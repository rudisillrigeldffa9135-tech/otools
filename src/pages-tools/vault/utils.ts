/** 密码管理的纯逻辑：按网站分组、重复检测、密码强度（与平台无关，便于单测） */

export interface VaultLike {
  id: number
  name: string
  url: string
  username: string
  label: string
  updatedAt: number
  createdAt?: number
}

/** 列表排序：name 按网站名称（中文按拼音），created 按添加时间（新的在前）；两种都不受编辑影响，位置固定 */
export type VaultOrder = 'name' | 'created'

export interface SiteGroup<T extends VaultLike> {
  key: string
  /** 展示用的网站名称：取最早添加的那条，编辑其他账号不会改变 */
  name: string
  /** 第一个非空网址 */
  url: string
  host: string
  items: T[]
  /** 组内最近更新时间 */
  updatedAt: number
  /** 组内最晚添加时间，按添加时间排序时使用 */
  createdAt: number
}

/** 未写协议时补 https:// */
export function normalizeUrl(url: string) {
  const s = url.trim()
  if (!s)
    return ''
  return /^[a-z][\w+.-]*:\/\//i.test(s) ? s : `https://${s}`
}

/** 取主机名并去掉 www.，小写；无法解析时返回 '' */
export function hostOf(url: string) {
  const m = normalizeUrl(url).match(/^[a-z][\w+.-]*:\/\/([^/?#:]+)/i)
  return m ? m[1].toLowerCase().replace(/^www\./, '') : ''
}

const nameKey = (name: string) => name.trim().toLowerCase()
const createdOf = (item: VaultLike) => item.createdAt ?? item.id
const lastId = (g: SiteGroup<VaultLike>) => Math.max(...g.items.map(i => i.id))

/**
 * 按网站分组：有网址的按主机名归组（github.com 与 www.github.com 视为同一站点）；
 * 没填网址的条目优先并入同名的站点，否则按名称单独成组。
 */
export function groupBySite<T extends VaultLike>(items: T[], order: VaultOrder = 'name'): SiteGroup<T>[] {
  const groups = new Map<string, SiteGroup<T>>()
  const byName = new Map<string, string>()
  // 组内按添加先后排列，编辑不改变位置
  const sorted = [...items].sort((a, b) => createdOf(a) - createdOf(b) || a.id - b.id)

  const add = (key: string, item: T, host: string) => {
    let g = groups.get(key)
    if (!g) {
      g = { key, name: item.name, url: '', host, items: [], updatedAt: item.updatedAt, createdAt: createdOf(item) }
      groups.set(key, g)
    }
    g.items.push(item)
    g.updatedAt = Math.max(g.updatedAt, item.updatedAt)
    g.createdAt = Math.max(g.createdAt, createdOf(item))
    if (!g.url && item.url)
      g.url = item.url
    if (!byName.has(nameKey(item.name)))
      byName.set(nameKey(item.name), key)
  }

  for (const item of sorted) {
    const host = hostOf(item.url)
    if (host)
      add(`h:${host}`, item, host)
  }
  for (const item of sorted) {
    if (hostOf(item.url))
      continue
    add(byName.get(nameKey(item.name)) || `n:${nameKey(item.name)}`, item, '')
  }

  const list = [...groups.values()]
  return order === 'created'
    ? list.sort((a, b) => b.createdAt - a.createdAt || lastId(b) - lastId(a))
    : list.sort((a, b) => compareInitial(initialOf(a.name), initialOf(b.name)) || compareName(a.name, b.name) || a.key.localeCompare(b.key))
}

const collator = typeof Intl !== 'undefined' ? new Intl.Collator('zh-Hans-CN', { sensitivity: 'base', numeric: true }) : undefined

/** 首字母排序：A–Z 在前，# 在最后 */
export function compareInitial(a: string, b: string) {
  return a === b ? 0 : a === '#' ? 1 : b === '#' ? -1 : a < b ? -1 : 1
}

export function compareName(a: string, b: string) {
  return collator ? collator.compare(a.trim(), b.trim()) : a.trim().toLowerCase().localeCompare(b.trim().toLowerCase())
}

// 拼音首字母分界字：按拼音排序时，每个字母的第一个汉字（没有 I、U、V 开头的拼音）
const PINYIN_BOUNDS = '阿八嚓哒妸发旮哈讥咔垃妈拏噢妑七呥仨他屲夕丫帀'
const PINYIN_LETTERS = 'ABCDEFGHJKLMNOPQRSTWXYZ'
/** 运行环境的排序规则是否支持拼音（部分小程序环境不支持，此时汉字归到 #） */
const pinyinOk = !!collator && collator.compare('阿', '八') < 0 && collator.compare('八', '嚓') < 0 && collator.compare('张', '中') < 0

/** 网站名称的首字母分组：英文取首字母，汉字取拼音首字母，其他归到 # */
export function initialOf(name: string) {
  const ch = name.trim().charAt(0)
  if (/[a-z]/i.test(ch))
    return ch.toUpperCase()
  const code = ch.charCodeAt(0)
  if (!pinyinOk || code < 0x4E00 || code > 0x9FFF)
    return '#'
  let letter = '#'
  for (let i = 0; i < PINYIN_BOUNDS.length; i++) {
    if (collator!.compare(ch, PINYIN_BOUNDS[i]) < 0)
      break
    letter = PINYIN_LETTERS[i]
  }
  return letter
}

/** 是否属于同一网站：主机名相同，或任一方没有网址时名称相同 */
export function isSameSite(a: Pick<VaultLike, 'name' | 'url'>, b: Pick<VaultLike, 'name' | 'url'>) {
  const ha = hostOf(a.url)
  const hb = hostOf(b.url)
  if (ha && hb)
    return ha === hb
  return nameKey(a.name) === nameKey(b.name)
}

/** 查找同一网站下账号相同的已有条目（编辑时排除自身），用于提示重复 */
export function findDuplicate<T extends VaultLike>(items: T[], form: Pick<VaultLike, 'name' | 'url' | 'username'>, excludeId?: number) {
  const username = form.username.trim().toLowerCase()
  if (!username || !form.name.trim())
    return undefined
  return items.find(i => i.id !== excludeId && i.username.trim().toLowerCase() === username && isSameSite(i, form))
}

export function matchKeyword(item: VaultLike, keyword: string) {
  const kw = keyword.trim().toLowerCase()
  return !kw || [item.name, item.url, item.username, item.label].some(s => s.toLowerCase().includes(kw))
}

export interface Strength {
  level: 0 | 1 | 2 | 3
  text: string
  color: string
}

/** 按字符种类与长度估算熵，给出强度等级 */
export function passwordStrength(pwd: string): Strength {
  if (!pwd)
    return { level: 0, text: '', color: 'transparent' }
  let pool = 0
  if (/[a-z]/.test(pwd))
    pool += 26
  if (/[A-Z]/.test(pwd))
    pool += 26
  if (/\d/.test(pwd))
    pool += 10
  if (/[^a-z0-9]/i.test(pwd))
    pool += 32
  const bits = Math.log2(pool || 1) * pwd.length
  if (bits >= 80)
    return { level: 3, text: '强', color: '#10b981' }
  if (bits >= 50)
    return { level: 2, text: '中', color: '#f59e0b' }
  return { level: 1, text: '弱', color: '#ef4444' }
}
