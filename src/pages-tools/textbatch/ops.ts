/** 文本批处理：按固定顺序执行一组可选操作（纯函数，便于单测） */

export type SortMode = 'none' | 'asc' | 'desc' | 'natural' | 'length' | 'reverse' | 'shuffle'
export type CaseMode = 'none' | 'upper' | 'lower'

export interface BatchOptions {
  /** 输入分隔符，留空表示按行；支持 \n \t 转义 */
  splitBy: string
  trim: boolean
  /** 连续空白合并为一个空格 */
  collapseSpaces: boolean
  /** 查找替换（纯文本，替换全部） */
  find: string
  replaceWith: string
  /** 只保留包含该文本的行 */
  include: string
  /** 去掉包含该文本的行 */
  exclude: string
  removeEmpty: boolean
  caseMode: CaseMode
  dedupe: boolean
  dedupeIgnoreCase: boolean
  sort: SortMode
  prefix: string
  suffix: string
  numbering: boolean
  /** 输出分隔符，留空表示换行；支持 \n \t 转义 */
  joinWith: string
}

export const DEFAULT_OPTIONS: BatchOptions = {
  splitBy: '',
  trim: false,
  collapseSpaces: false,
  find: '',
  replaceWith: '',
  include: '',
  exclude: '',
  removeEmpty: false,
  caseMode: 'none',
  dedupe: false,
  dedupeIgnoreCase: false,
  sort: 'none',
  prefix: '',
  suffix: '',
  numbering: false,
  joinWith: '',
}

/** 把用户输入的 \n \t \\ 转成真实字符 */
export function unescape(s: string) {
  return s.replace(/\\([nt\\])/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : '\\'))
}

function shuffle<T>(arr: T[], random: () => number) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 顺序：拆分 → 去空白 → 替换 → 筛选 → 去空行 → 大小写 → 去重 → 排序 → 前后缀 → 编号 → 合并 */
export function processText(text: string, opts: BatchOptions, random: () => number = Math.random) {
  const sep = unescape(opts.splitBy)
  let lines = text.replace(/\r\n?/g, '\n').split(sep || '\n')
  // 末尾换行不算一行
  if (!sep && lines.length > 1 && lines[lines.length - 1] === '')
    lines.pop()

  if (opts.trim)
    lines = lines.map(l => l.trim())
  if (opts.collapseSpaces)
    lines = lines.map(l => l.replace(/[ \t\u3000]+/g, ' '))
  if (opts.find)
    lines = lines.map(l => l.split(opts.find).join(opts.replaceWith))
  if (opts.include)
    lines = lines.filter(l => l.includes(opts.include))
  if (opts.exclude)
    lines = lines.filter(l => !l.includes(opts.exclude))
  if (opts.removeEmpty)
    lines = lines.filter(l => l.trim() !== '')
  if (opts.caseMode === 'upper')
    lines = lines.map(l => l.toUpperCase())
  else if (opts.caseMode === 'lower')
    lines = lines.map(l => l.toLowerCase())
  if (opts.dedupe) {
    const seen = new Set<string>()
    lines = lines.filter((l) => {
      const key = opts.dedupeIgnoreCase ? l.toLowerCase() : l
      if (seen.has(key))
        return false
      seen.add(key)
      return true
    })
  }

  switch (opts.sort) {
    case 'asc':
      lines = [...lines].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      break
    case 'desc':
      lines = [...lines].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
      break
    case 'natural':
      // 数字按数值大小比较：file2 排在 file10 前面
      lines = [...lines].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
      break
    case 'length':
      lines = [...lines].sort((a, b) => a.length - b.length)
      break
    case 'reverse':
      lines = [...lines].reverse()
      break
    case 'shuffle':
      lines = shuffle(lines, random)
      break
  }

  if (opts.prefix || opts.suffix)
    lines = lines.map(l => `${opts.prefix}${l}${opts.suffix}`)
  if (opts.numbering)
    lines = lines.map((l, i) => `${i + 1}. ${l}`)

  return { lines, output: lines.join(unescape(opts.joinWith) || '\n') }
}

/** 统计行数（末尾换行不算一行） */
export function countLines(text: string) {
  if (!text)
    return 0
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length
}
