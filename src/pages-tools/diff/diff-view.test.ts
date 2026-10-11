import type { LineRow } from './diff-view'
import { collapseRows, inlineDiff, lineDiff } from './diff-view'

const OPTS = { ignoreCase: false, ignoreWhitespace: false }

describe('lineDiff 按行对比', () => {
  it('相同文本没有差异，末尾换行有无不算差异', () => {
    const { rows, stats } = lineDiff('a\nb', 'a\nb\n', OPTS)
    expect(stats).toEqual({ added: 0, removed: 0 })
    expect(rows.map(r => r.type)).toEqual(['equal', 'equal'])
  })

  it('新增、删除与行号', () => {
    const { rows, stats } = lineDiff('a\nb\nc', 'a\nc\nd', OPTS)
    expect(stats).toEqual({ added: 1, removed: 1 })
    expect(rows.map(r => [r.type, r.oldNo, r.newNo])).toEqual([
      ['equal', 1, 1],
      ['del', 2, undefined],
      ['equal', 3, 2],
      ['add', undefined, 3],
    ])
  })

  it('修改的行配对后标出行内差异', () => {
    const { rows } = lineDiff('hello world', 'hello there', OPTS)
    const del = rows.find(r => r.type === 'del')!
    const add = rows.find(r => r.type === 'add')!
    expect(del.segs.filter(s => s.type === 'equal').map(s => s.text).join('')).toContain('hello ')
    expect(del.segs.some(s => s.type === 'del')).toBe(true)
    expect(add.segs.some(s => s.type === 'add')).toBe(true)
    // 拼回来与原行一致
    expect(del.segs.map(s => s.text).join('')).toBe('hello world')
    expect(add.segs.map(s => s.text).join('')).toBe('hello there')
  })

  it('忽略大小写与空白', () => {
    expect(lineDiff('Hello  World', 'hello world', { ignoreCase: true, ignoreWhitespace: true }).stats).toEqual({ added: 0, removed: 0 })
    expect(lineDiff('Hello', 'hello', OPTS).stats).toEqual({ added: 1, removed: 1 })
  })
})

describe('inlineDiff 按词 / 字符对比', () => {
  it('按字符统计增删数量（中文按字计）', () => {
    const { segs, stats } = inlineDiff('今天天气好', '今天心情好', 'char', OPTS)
    expect(stats).toEqual({ added: 2, removed: 2 })
    expect(segs.filter(s => s.type !== 'add').map(s => s.text).join('')).toBe('今天天气好')
  })

  it('按词对比', () => {
    const { stats } = inlineDiff('the cat sat', 'the dog sat', 'word', OPTS)
    expect(stats).toEqual({ added: 1, removed: 1 })
  })
})

describe('collapseRows 折叠相同行', () => {
  const eq = (n: number): LineRow => ({ type: 'equal', oldNo: n, newNo: n, segs: [] })
  it('保留差异附近的上下文，其余折叠', () => {
    const rows: LineRow[] = [...Array.from({ length: 10 }, (_, i) => eq(i + 1)), { type: 'add', newNo: 11, segs: [] }, ...Array.from({ length: 10 }, (_, i) => eq(i + 12))]
    const out = collapseRows(rows, 2)
    expect(out.map(r => (r.type === 'skip' ? `skip${r.count}` : r.type))).toEqual(['skip8', 'equal', 'equal', 'add', 'equal', 'equal', 'skip8'])
  })

  it('没有差异时整体折叠', () => {
    expect(collapseRows([eq(1), eq(2)])).toEqual([{ type: 'skip', count: 2, from: 0 }])
  })
})
