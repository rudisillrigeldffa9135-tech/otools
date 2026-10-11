/** 正则测试的纯逻辑：编译、查找匹配、高亮分段、常用正则 */

export const FLAGS = [
  { flag: 'g', label: '全局', desc: '查找所有匹配，而不是只找第一个' },
  { flag: 'i', label: '忽略大小写', desc: '' },
  { flag: 'm', label: '多行', desc: '^ 和 $ 匹配每一行的开头结尾' },
  { flag: 's', label: '点匹配换行', desc: '. 也能匹配换行符' },
  { flag: 'u', label: 'Unicode', desc: '按 Unicode 码点处理，支持 \\p{...}' },
] as const

export interface MatchItem {
  index: number
  end: number
  text: string
  /** 捕获组 $1..$n，未参与匹配的为 undefined */
  groups: (string | undefined)[]
  named: Record<string, string | undefined>
}

export function compile(pattern: string, flags: string): { re?: RegExp, error?: string } {
  if (!pattern)
    return {}
  try {
    return { re: new RegExp(pattern, flags) }
  }
  catch (e: any) {
    let error = `正则语法错误：${e?.message || e}`
    // 旧版 iOS（含部分小程序环境）不支持反向断言
    if (/\(\?<[=!]/.test(pattern))
      error += '。如果在 iOS 或小程序中使用，当前环境可能不支持反向断言 (?<= / (?<!'
    return { error }
  }
}

/**
 * 查找匹配：未开启 g 时只取第一个；零宽匹配时手动前进，避免死循环
 * @param limit 最多返回的匹配数，防止超大文本卡死页面
 */
export function findMatches(re: RegExp, text: string, limit = 1000): { matches: MatchItem[], truncated: boolean } {
  const global = re.flags.includes('g')
  const r = new RegExp(re.source, global ? re.flags : `${re.flags}g`)
  const matches: MatchItem[] = []
  for (let m = r.exec(text); m; m = r.exec(text)) {
    matches.push({
      index: m.index,
      end: m.index + m[0].length,
      text: m[0],
      groups: m.slice(1),
      named: { ...(m.groups || {}) },
    })
    if (!global)
      break
    if (matches.length >= limit)
      return { matches, truncated: r.exec(text) !== null }
    if (m[0] === '') {
      // 零宽匹配：前进一个字符（u 模式下按码点前进）
      const code = text.codePointAt(r.lastIndex)
      r.lastIndex += re.flags.includes('u') && code !== undefined && code > 0xFFFF ? 2 : 1
    }
  }
  return { matches, truncated: false }
}

export interface Segment {
  text: string
  /** 所属匹配的序号，-1 表示未匹配部分 */
  match: number
}

/** 把文本切成「匹配 / 非匹配」片段，用于高亮显示；零宽匹配不产生片段 */
export function toSegments(text: string, matches: MatchItem[]): Segment[] {
  const segs: Segment[] = []
  let pos = 0
  matches.forEach((m, i) => {
    if (m.end === m.index)
      return
    if (m.index > pos)
      segs.push({ text: text.slice(pos, m.index), match: -1 })
    segs.push({ text: m.text, match: i })
    pos = m.end
  })
  if (pos < text.length)
    segs.push({ text: text.slice(pos), match: -1 })
  return segs
}

/** 把普通文本转义成可直接用于正则的字面量 */
export function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

export interface Preset {
  name: string
  pattern: string
  flags: string
  sample: string
}

export const PRESETS: Preset[] = [
  { name: '手机号', pattern: '1[3-9]\\d{9}', flags: 'g', sample: '联系电话：13812345678，备用 15900001111' },
  { name: '邮箱', pattern: '[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+', flags: 'g', sample: '请发送到 alice@example.com 或 bob.li@mail.example.cn' },
  { name: '身份证号', pattern: '[1-9]\\d{5}(18|19|20)\\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\\d|3[01])\\d{3}[\\dXx]', flags: 'g', sample: '证件号：11010519491231002X' },
  { name: '网址', pattern: 'https?:\\/\\/[\\w.-]+(:\\d+)?(\\/[^\\s]*)?', flags: 'g', sample: '官网 https://example.com/docs?id=1 ，测试环境 http://localhost:8080' },
  { name: 'IPv4', pattern: '\\b((25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(25[0-5]|2[0-4]\\d|1?\\d?\\d)\\b', flags: 'g', sample: '网关 192.168.1.1，DNS 8.8.8.8，非法 300.1.1.1' },
  { name: '中文字符', pattern: '[\\u4E00-\\u9FA5]+', flags: 'g', sample: 'Hello 世界，正则 Regex 测试' },
  { name: '日期', pattern: '(\\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])', flags: 'g', sample: '开始 2026-10-11，结束 2026-12-31' },
  { name: '时间', pattern: '([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?', flags: 'g', sample: '09:30 开会，18:45:10 结束' },
  { name: '邮政编码', pattern: '\\b[1-9]\\d{5}\\b', flags: 'g', sample: '北京 100000，上海 200000' },
  { name: '金额', pattern: '¥?\\d{1,3}(,\\d{3})*(\\.\\d{1,2})?', flags: 'g', sample: '合计 ¥1,234.50，优惠 20' },
  { name: 'HTML 标签', pattern: '<\\/?([a-zA-Z][\\w-]*)[^>]*>', flags: 'g', sample: '<div class="a"><span>文字</span></div>' },
  { name: '空白行', pattern: '^\\s*$', flags: 'gm', sample: '第一行\n\n第三行\n   \n第五行' },
]
