/** 密码管理的纯逻辑：按网站分组、重复检测、密码强度（与平台无关，便于单测） */

export interface VaultLike {
  id: number
  name: string
  url: string
  username: string
  label: string
  updatedAt: number
}

export interface SiteGroup<T extends VaultLike> {
  key: string
  /** 展示用的网站名称：取最近更新的那条 */
  name: string
  /** 第一个非空网址 */
  url: string
  host: string
  items: T[]
  /** 组内最近更新时间，用于排序 */
  updatedAt: number
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

/**
 * 按网站分组：有网址的按主机名归组（github.com 与 www.github.com 视为同一站点）；
 * 没填网址的条目优先并入同名的站点，否则按名称单独成组。
 */
export function groupBySite<T extends VaultLike>(items: T[]): SiteGroup<T>[] {
  const groups = new Map<string, SiteGroup<T>>()
  const byName = new Map<string, string>()
  const sorted = [...items].sort((a, b) => b.updatedAt - a.updatedAt || b.id - a.id)

  const add = (key: string, item: T, host: string) => {
    let g = groups.get(key)
    if (!g) {
      g = { key, name: item.name, url: '', host, items: [], updatedAt: item.updatedAt }
      groups.set(key, g)
    }
    g.items.push(item)
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

  return [...groups.values()].sort((a, b) => b.updatedAt - a.updatedAt)
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
