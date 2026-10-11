import { compile, escapeRegExp, findMatches, PRESETS, toSegments } from './regex'

describe('compile', () => {
  it('空正则返回空结果，语法错误给出中文提示', () => {
    expect(compile('', 'g')).toEqual({})
    expect(compile('a(', 'g').error).toMatch(/正则语法错误/)
  })

  it('反向断言出错时额外提示环境兼容性', () => {
    // 用一个必然报错的反向断言写法模拟旧环境
    expect(compile('(?<=a', '').error).toMatch(/反向断言/)
  })
})

describe('findMatches', () => {
  it('全局模式返回所有匹配及捕获组', () => {
    const { re } = compile('(\\d{4})-(\\d{2})', 'g')
    const { matches } = findMatches(re!, '2026-10 和 2027-01')
    expect(matches.map(m => [m.text, m.index, m.groups])).toEqual([
      ['2026-10', 0, ['2026', '10']],
      ['2027-01', 10, ['2027', '01']],
    ])
  })

  it('非全局模式只取第一个', () => {
    const { re } = compile('\\d', '')
    expect(findMatches(re!, 'a1b2').matches).toHaveLength(1)
  })

  it('命名捕获组', () => {
    const { re } = compile('(?<year>\\d{4})', 'g')
    expect(findMatches(re!, 'x2026').matches[0].named).toEqual({ year: '2026' })
  })

  it('零宽匹配不会死循环', () => {
    const { re } = compile('^', 'gm')
    expect(findMatches(re!, 'a\nb\nc').matches.map(m => m.index)).toEqual([0, 2, 4])
    const { re: boundary } = compile('\\b', 'g')
    expect(findMatches(boundary!, 'ab cd').matches.map(m => m.index)).toEqual([0, 2, 3, 5])
  })

  it('超过上限时截断并标记', () => {
    const { re } = compile('a', 'g')
    const r = findMatches(re!, 'a'.repeat(20), 5)
    expect(r.matches).toHaveLength(5)
    expect(r.truncated).toBe(true)
  })
})

describe('toSegments', () => {
  it('切分出匹配与非匹配片段，零宽匹配不产生片段', () => {
    const { re } = compile('\\d+', 'g')
    const text = 'a12b3'
    expect(toSegments(text, findMatches(re!, text).matches)).toEqual([
      { text: 'a', match: -1 },
      { text: '12', match: 0 },
      { text: 'b', match: -1 },
      { text: '3', match: 1 },
    ])
  })
})

describe('escapeRegExp', () => {
  it('转义后可按字面量匹配', () => {
    const s = 'a.b*(c)?[d]/$'
    expect(new RegExp(escapeRegExp(s)).test(`x${s}y`)).toBe(true)
  })
})

describe('常用正则', () => {
  it.each(PRESETS.map(p => [p.name, p] as const))('%s 能在示例中找到匹配', (_, p) => {
    const { re, error } = compile(p.pattern, p.flags)
    expect(error).toBeUndefined()
    expect(findMatches(re!, p.sample).matches.length).toBeGreaterThan(0)
  })

  it('iPv4 不匹配越界数字', () => {
    const p = PRESETS.find(p => p.name === 'IPv4')!
    const texts = findMatches(compile(p.pattern, p.flags).re!, p.sample).matches.map(m => m.text)
    expect(texts).toEqual(['192.168.1.1', '8.8.8.8'])
  })
})
