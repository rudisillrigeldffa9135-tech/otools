/** 文本对比：把 jsdiff 的结果整理成便于渲染的行 / 片段（纯函数，便于单测） */
import { diffChars, diffLines, diffWordsWithSpace } from 'diff'

export type DiffMode = 'line' | 'word' | 'char'
export type ChangeType = 'equal' | 'add' | 'del'

export interface DiffOptions {
  ignoreCase: boolean
  /** 忽略所有空白差异（包括行内多个空格与一个空格的差别） */
  ignoreWhitespace: boolean
}

export interface Segment {
  type: ChangeType
  text: string
}

export interface LineRow {
  type: ChangeType
  /** 原文行号，新增行没有 */
  oldNo?: number
  /** 新文本行号，删除行没有 */
  newNo?: number
  /** 行内差异片段：删除行只含 equal/del，新增行只含 equal/add */
  segs: Segment[]
}

export interface DiffStats {
  added: number
  removed: number
}

/** 结尾补上换行，避免「最后一行有无换行」被当成差异 */
function withNewline(s: string) {
  const t = s.replace(/\r\n?/g, '\n')
  return t && !t.endsWith('\n') ? `${t}\n` : t
}

function splitLines(value: string) {
  const lines = value.split('\n')
  if (lines[lines.length - 1] === '')
    lines.pop()
  return lines
}

function normalizer(opts: DiffOptions) {
  return (s: string) => {
    let v = opts.ignoreWhitespace ? s.replace(/\s+/g, '') : s
    if (opts.ignoreCase)
      v = v.toLowerCase()
    return v
  }
}

/** 一对「删除行 / 新增行」做字符级对比，标出行内具体改动 */
function inlinePair(oldLine: string, newLine: string, opts: DiffOptions): [Segment[], Segment[]] {
  const changes = diffChars(oldLine, newLine, { ignoreCase: opts.ignoreCase })
  const oldSegs: Segment[] = []
  const newSegs: Segment[] = []
  for (const c of changes) {
    if (c.added) {
      newSegs.push({ type: 'add', text: c.value })
    }
    else if (c.removed) {
      oldSegs.push({ type: 'del', text: c.value })
    }
    else {
      oldSegs.push({ type: 'equal', text: c.value })
      newSegs.push({ type: 'equal', text: c.value })
    }
  }
  return [oldSegs, newSegs]
}

/** 按行对比；相邻的删除块与新增块逐行配对，显示行内差异 */
export function lineDiff(a: string, b: string, opts: DiffOptions): { rows: LineRow[], stats: DiffStats } {
  const norm = normalizer(opts)
  // 传入回调参数时类型重载会返回 undefined，这里是同步调用，结果一定存在
  const changes = diffLines(withNewline(a), withNewline(b), {
    comparator: (l: string, r: string) => norm(l) === norm(r),
  } as any) ?? []
  const rows: LineRow[] = []
  const stats: DiffStats = { added: 0, removed: 0 }
  let oldNo = 0
  let newNo = 0

  for (let i = 0; i < changes.length; i++) {
    const c = changes[i]
    if (!c.added && !c.removed) {
      for (const line of splitLines(c.value))
        rows.push({ type: 'equal', oldNo: ++oldNo, newNo: ++newNo, segs: [{ type: 'equal', text: line }] })
      continue
    }
    // 删除块后紧跟新增块：视为修改，逐行配对
    const delLines = c.removed ? splitLines(c.value) : []
    const next = changes[i + 1]
    const addLines = c.added ? splitLines(c.value) : next?.added ? splitLines(next.value) : []
    if (c.removed && next?.added)
      i++
    stats.removed += delLines.length
    stats.added += addLines.length

    const delRows: LineRow[] = delLines.map(text => ({ type: 'del', oldNo: ++oldNo, segs: [{ type: 'del', text }] }))
    const addRows: LineRow[] = addLines.map(text => ({ type: 'add', newNo: ++newNo, segs: [{ type: 'add', text }] }))
    for (let k = 0; k < Math.min(delRows.length, addRows.length); k++)
      [delRows[k].segs, addRows[k].segs] = inlinePair(delLines[k], addLines[k], opts)
    rows.push(...delRows, ...addRows)
  }
  return { rows, stats }
}

/** 按词或按字符对比，返回连续的片段 */
export function inlineDiff(a: string, b: string, mode: 'word' | 'char', opts: DiffOptions): { segs: Segment[], stats: DiffStats } {
  const fn = mode === 'word' ? diffWordsWithSpace : diffChars
  const changes = fn(a.replace(/\r\n?/g, '\n'), b.replace(/\r\n?/g, '\n'), { ignoreCase: opts.ignoreCase })
  const stats: DiffStats = { added: 0, removed: 0 }
  const segs = changes.map((c): Segment => {
    const count = mode === 'word' ? c.value.trim().split(/\s+/).filter(Boolean).length || 1 : Array.from(c.value).length
    if (c.added)
      stats.added += count
    if (c.removed)
      stats.removed += count
    return { type: c.added ? 'add' : c.removed ? 'del' : 'equal', text: c.value }
  })
  return { segs, stats }
}

export type CollapsedRow = LineRow | { type: 'skip', count: number, from: number }

/** 只看差异时折叠长段相同的行，保留差异上下各 context 行 */
export function collapseRows(rows: LineRow[], context = 3): CollapsedRow[] {
  const keep = rows.map(() => false)
  rows.forEach((r, i) => {
    if (r.type !== 'equal') {
      for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k++)
        keep[k] = true
    }
  })
  const out: CollapsedRow[] = []
  for (let i = 0; i < rows.length;) {
    if (keep[i]) {
      out.push(rows[i++])
      continue
    }
    const from = i
    while (i < rows.length && !keep[i])
      i++
    out.push({ type: 'skip', count: i - from, from })
  }
  return out
}
