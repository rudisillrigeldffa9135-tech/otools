import type { BatchOptions } from './ops'
import { countLines, DEFAULT_OPTIONS, processText, unescape } from './ops'

const run = (text: string, opts: Partial<BatchOptions>) => processText(text, { ...DEFAULT_OPTIONS, ...opts }).output

describe('processText 文本批处理', () => {
  it('不选任何操作时原样输出（去掉末尾换行）', () => {
    expect(run('a\nb\n', {})).toBe('a\nb')
  })

  it('去首尾空白、合并空白、去空行', () => {
    expect(run('  a  b \n\n \t\nc', { trim: true, collapseSpaces: true, removeEmpty: true })).toBe('a b\nc')
  })

  it('去重（区分 / 忽略大小写）', () => {
    expect(run('a\nA\na\nb', { dedupe: true })).toBe('a\nA\nb')
    expect(run('a\nA\na\nb', { dedupe: true, dedupeIgnoreCase: true })).toBe('a\nb')
  })

  it('排序：升序、降序、自然排序、按长度、倒序', () => {
    expect(run('b\na\nc', { sort: 'asc' })).toBe('a\nb\nc')
    expect(run('b\na\nc', { sort: 'desc' })).toBe('c\nb\na')
    expect(run('file10\nfile2\nfile1', { sort: 'natural' })).toBe('file1\nfile2\nfile10')
    expect(run('ccc\na\nbb', { sort: 'length' })).toBe('a\nbb\nccc')
    expect(run('1\n2\n3', { sort: 'reverse' })).toBe('3\n2\n1')
  })

  it('随机打乱只改变顺序，不丢失内容', () => {
    let seed = 1
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const out = processText('1\n2\n3\n4\n5', { ...DEFAULT_OPTIONS, sort: 'shuffle' }, random).lines
    expect([...out].sort()).toEqual(['1', '2', '3', '4', '5'])
  })

  it('筛选包含 / 不包含', () => {
    expect(run('apple\nbanana\ncherry', { include: 'an' })).toBe('banana')
    expect(run('apple\nbanana\ncherry', { exclude: 'an' })).toBe('apple\ncherry')
  })

  it('查找替换全部出现（按纯文本，不按正则）', () => {
    expect(run('a.b.c', { find: '.', replaceWith: '-' })).toBe('a-b-c')
  })

  it('大小写、前后缀、编号', () => {
    expect(run('a\nb', { caseMode: 'upper', prefix: '"', suffix: '",', numbering: true })).toBe('1. "A",\n2. "B",')
  })

  it('列转行与行转列（自定义分隔符，支持 \\n 转义）', () => {
    expect(run('a,b,,c', { splitBy: ',', removeEmpty: true })).toBe('a\nb\nc')
    expect(run('a\nb\nc', { joinWith: ', ' })).toBe('a, b, c')
    expect(run('a b', { splitBy: ' ', joinWith: '\\t' })).toBe('a\tb')
  })
})

describe('辅助函数', () => {
  it('unescape 处理 \\n \\t \\\\', () => {
    expect(unescape('a\\nb\\tc\\\\d')).toBe('a\nb\tc\\d')
  })

  it('countLines 忽略末尾换行', () => {
    expect(countLines('')).toBe(0)
    expect(countLines('a\nb\n')).toBe(2)
    expect(countLines('a\r\nb')).toBe(2)
  })
})
