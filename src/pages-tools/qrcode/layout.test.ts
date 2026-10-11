import { computeLayout, fileNameOf, wrapText } from './layout'

// 每个字符宽 10px 的简化测量
const measure = (s: string) => Array.from(s).length * 10

describe('wrapText 备注折行', () => {
  it('不超宽时保持一行', () => {
    expect(wrapText('扫码关注', 100, measure)).toEqual(['扫码关注'])
  })

  it('超宽时逐字折行（中英文都按字符）', () => {
    expect(wrapText('abcdefghij一二三', 50, measure)).toEqual(['abcde', 'fghij', '一二三'])
  })

  it('标点不出现在行首，留在上一行末尾', () => {
    expect(wrapText('一二三四五，六七', 50, measure)).toEqual(['一二三四五，', '六七'])
  })

  it('保留手动换行并去掉末尾空行', () => {
    expect(wrapText('第一行\n第二行\n\n', 100, measure)).toEqual(['第一行', '第二行'])
  })

  it('超过最大行数时截断并加省略号，且不超宽', () => {
    const lines = wrapText('一二三四五六七八九十甲乙丙丁戊', 50, measure, 2)
    expect(lines).toEqual(['一二三四五', '六七八九…'])
    expect(lines.every(l => measure(l) <= 50)).toBe(true)
  })

  it('空白内容不产生行', () => {
    expect(wrapText('  \n ', 100, measure)).toEqual([])
  })
})

describe('computeLayout 排版', () => {
  it('无备注时画布为正方形，模块边长取整', () => {
    const l = computeLayout({ size: 220, moduleCount: 25, lines: 0, fontSize: 15, position: 'bottom' })
    expect(l.width).toBe(l.height)
    expect(l.cell).toBe(8)
    expect(l.qrSize).toBe(200)
    // 二维码在画布内水平、垂直都居中
    expect(l.qrX * 2 + l.qrSize).toBe(l.width)
    expect(l.qrY * 2 + l.qrSize).toBe(l.height)
  })

  it('备注在下方：画布变高，文字在二维码下面', () => {
    const l = computeLayout({ size: 220, moduleCount: 25, lines: 2, fontSize: 15, position: 'bottom' })
    expect(l.height).toBeGreaterThan(l.width)
    expect(l.textY).toBeGreaterThan(l.qrY + l.qrSize)
    expect(l.textY + l.lineHeight * 1.5).toBeLessThanOrEqual(l.height - l.padding)
  })

  it('备注在上方：文字在二维码上面', () => {
    const l = computeLayout({ size: 220, moduleCount: 25, lines: 1, fontSize: 15, position: 'top' })
    expect(l.textY).toBeLessThan(l.qrY)
    expect(l.qrY + l.qrSize).toBeLessThanOrEqual(l.height - l.padding)
  })
})

describe('fileNameOf', () => {
  it('用备注第一行做文件名，替换非法字符', () => {
    expect(fileNameOf('我的 网站/首页\n第二行')).toBe('我的_网站_首页.png')
    expect(fileNameOf('')).toBe('qrcode.png')
  })
})
