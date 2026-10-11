/** 字符转义：各种转义格式的编码 / 解码（纯函数，便于单测） */

export type EscapeKind = 'html' | 'unicode' | 'js' | 'json' | 'regex' | 'sql' | 'xml'

export interface EscapeOptions {
  /** HTML / Unicode / JS：非 ASCII 字符（如中文）也转义 */
  nonAscii: boolean
}

export const KINDS: { value: EscapeKind, label: string, desc: string }[] = [
  { value: 'html', label: 'HTML', desc: '& < > " \' 转为实体，解码时支持命名实体与 &#数字;' },
  { value: 'unicode', label: 'Unicode', desc: '\\uXXXX 形式，等同 Java native2ascii' },
  { value: 'js', label: 'JS 字符串', desc: '转义引号、反斜杠与换行等控制字符' },
  { value: 'json', label: 'JSON 字符串', desc: '按 JSON 规范转义，可直接放进双引号里' },
  { value: 'regex', label: '正则', desc: '转义正则中的特殊字符，用于按字面匹配' },
  { value: 'sql', label: 'SQL', desc: '单引号写成两个单引号（标准 SQL）' },
  { value: 'xml', label: 'XML', desc: '五个预定义实体 &amp; &lt; &gt; &quot; &apos;' },
]

/** 常见命名实体（解码用） */
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: '\'',
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  zwnj: '‌',
  zwj: '‍',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  middot: '·',
  bull: '•',
  times: '×',
  divide: '÷',
  plusmn: '±',
  deg: '°',
  micro: 'µ',
  para: '¶',
  sect: '§',
  cent: '¢',
  pound: '£',
  yen: '¥',
  euro: '€',
  larr: '←',
  rarr: '→',
  uarr: '↑',
  darr: '↓',
  harr: '↔',
  le: '≤',
  ge: '≥',
  ne: '≠',
  infin: '∞',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  sup2: '²',
  sup3: '³',
  iexcl: '¡',
  iquest: '¿',
}

const ENTITY_RE = /&(?:#(\d+)|#x([\da-f]+)|([a-z][a-z\d]*));/gi

function decodeEntities(s: string, named: Record<string, string>) {
  return s.replace(ENTITY_RE, (m, dec, hex, name) => {
    if (dec || hex) {
      const cp = Number.parseInt(dec || hex, dec ? 10 : 16)
      return cp > 0 && cp <= 0x10FFFF ? String.fromCodePoint(cp) : m
    }
    return named[name] ?? named[name.toLowerCase()] ?? m
  })
}

/** 码点 → \uXXXX（超出 BMP 的拆成代理对） */
function u4(ch: string) {
  return Array.from({ length: ch.length }, (_, i) => `\\u${ch.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0')}`).join('')
}

const isAscii = (ch: string) => ch.codePointAt(0)! < 0x80

function escapeHtml(s: string, o: EscapeOptions) {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }
  return Array.from(s, ch => map[ch] ?? (o.nonAscii && !isAscii(ch) ? `&#${ch.codePointAt(0)};` : ch)).join('')
}

function escapeUnicode(s: string, o: EscapeOptions) {
  // 默认只转非 ASCII；勾选后连 ASCII 也转（便于混淆或排查不可见字符）
  return Array.from(s, ch => (!isAscii(ch) || o.nonAscii ? u4(ch) : ch)).join('')
}

/** 解析 \uXXXX、\u{1F600}、\xXX；可选是否处理 \n 等常规转义 */
function unescapeBackslash(s: string, full: boolean) {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch !== '\\' || i === s.length - 1) {
      out += ch
      continue
    }
    const next = s[i + 1]
    const rest = s.slice(i + 2)
    const braced = next === 'u' ? rest.match(/^\{([\da-f]{1,6})\}/i) : null
    const u = next === 'u' ? rest.match(/^[\da-f]{4}/i) : null
    const x = next === 'x' && full ? rest.match(/^[\da-f]{2}/i) : null
    if (braced) {
      out += String.fromCodePoint(Number.parseInt(braced[1], 16))
      i += 2 + braced[0].length - 1
    }
    else if (u) {
      out += String.fromCharCode(Number.parseInt(u[0], 16))
      i += 5
    }
    else if (x) {
      out += String.fromCharCode(Number.parseInt(x[0], 16))
      i += 3
    }
    else if (full) {
      const simple: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' }
      // \0 后面跟数字时是八进制，这里不支持，原样保留
      if (next === '0' && /\d/.test(s[i + 2] ?? '')) {
        out += ch
        continue
      }
      out += simple[next] ?? next
      i++
    }
    else {
      out += ch
    }
  }
  return out
}

function escapeJs(s: string, o: EscapeOptions) {
  const map: Record<string, string> = { '\\': '\\\\', '\'': '\\\'', '"': '\\"', '`': '\\`', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f', '\v': '\\v', '\0': '\\0' }
  // 行分隔符与段分隔符在旧版 JS 字符串里不合法，也要转义
  map[String.fromCharCode(0x2028)] = '\\u2028'
  map[String.fromCharCode(0x2029)] = '\\u2029'
  return Array.from(s, (ch) => {
    if (map[ch])
      return map[ch]
    const cp = ch.codePointAt(0)!
    if (cp < 0x20 || cp === 0x7F)
      return `\\x${cp.toString(16).toUpperCase().padStart(2, '0')}`
    return o.nonAscii && cp >= 0x80 ? u4(ch) : ch
  }).join('')
}

function escapeJson(s: string, o: EscapeOptions) {
  const out = JSON.stringify(s).slice(1, -1)
  return o.nonAscii ? Array.from(out, ch => (isAscii(ch) ? ch : u4(ch))).join('') : out
}

function unescapeJson(s: string) {
  try {
    return JSON.parse(`"${s.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`) as string
  }
  catch {
    // 用户可能连同两边的引号一起粘贴进来
    if (/^".*"$/s.test(s.trim()))
      return unescapeJson(s.trim().slice(1, -1))
    throw new Error('不是有效的 JSON 字符串内容：可能有未转义的双引号，或 \\ 后跟了不支持的字符')
  }
}

export function encode(kind: EscapeKind, s: string, o: EscapeOptions): string {
  switch (kind) {
    case 'html':
      return escapeHtml(s, o)
    case 'xml':
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    case 'unicode':
      return escapeUnicode(s, o)
    case 'js':
      return escapeJs(s, o)
    case 'json':
      return escapeJson(s, o)
    case 'regex':
      return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
    case 'sql':
      return s.replace(/'/g, '\'\'')
  }
}

export function decode(kind: EscapeKind, s: string): string {
  switch (kind) {
    case 'html':
      return decodeEntities(s, NAMED)
    case 'xml':
      return decodeEntities(s, { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' })
    case 'unicode':
      // 同时兼容 U+4F60 与 &#x4F60; 写法
      return unescapeBackslash(
        s.replace(/U\+([\da-f]{4,6})/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16))),
        false,
      ).replace(/&#x([\da-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    case 'js':
      return unescapeBackslash(s, true)
    case 'json':
      return unescapeJson(s)
    case 'regex':
      // 只还原特殊字符的转义，\d \w 等保持不变
      return s.replace(/\\([.*+?^${}()|[\]\\/])/g, '$1')
    case 'sql':
      return s.replace(/''/g, '\'')
  }
}

/** 列出文本中的不可见 / 易混淆字符，排查「看起来一样却不相等」的问题 */
export function findInvisible(s: string) {
  const NAMES: Record<number, string> = {
    0x09: '制表符',
    0x0A: '换行',
    0x0D: '回车',
    0xA0: '不换行空格',
    0x200B: '零宽空格',
    0x200C: '零宽非连接符',
    0x200D: '零宽连接符',
    0x2028: '行分隔符',
    0x2029: '段分隔符',
    0x3000: '全角空格',
    0xFEFF: 'BOM / 零宽不换行空格',
    0x00AD: '软连字符',
  }
  const counts = new Map<number, number>()
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    if (NAMES[cp] && cp !== 0x0A)
      counts.set(cp, (counts.get(cp) ?? 0) + 1)
  }
  return [...counts].map(([cp, count]) => ({ code: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`, name: NAMES[cp], count }))
}
