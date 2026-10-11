import { formatThousands, parseAmount, parseRmbUpper, toChineseNumber, toRmbUpper } from './rmb'

describe('toRmbUpper 金额大写', () => {
  it.each([
    ['0', '零元整'],
    ['1', '壹元整'],
    ['10', '壹拾元整'],
    ['15', '壹拾伍元整'],
    ['100.05', '壹佰元零伍分'],
    ['1234.56', '壹仟贰佰叁拾肆元伍角陆分'],
    ['1001', '壹仟零壹元整'],
    ['1010', '壹仟零壹拾元整'],
    ['10000', '壹万元整'],
    ['105000', '壹拾万伍仟元整'],
    ['100500', '壹拾万零伍佰元整'],
    ['20000001', '贰仟万零壹元整'],
    ['100010000', '壹亿零壹万元整'],
    ['100000001', '壹亿零壹元整'],
    ['1000000000000', '壹万亿元整'],
    ['1680.32', '壹仟陆佰捌拾元叁角贰分'],
    ['0.5', '伍角'],
    ['0.05', '伍分'],
    ['0.56', '伍角陆分'],
    ['3.5', '叁元伍角'],
    ['-12.3', '负壹拾贰元叁角'],
    ['1,234.5', '壹仟贰佰叁拾肆元伍角'],
    ['¥ 88', '捌拾捌元整'],
  ])('%s → %s', (input, expected) => {
    expect(toRmbUpper(input)).toBe(expected)
  })

  it('四舍五入到分，并正确进位', () => {
    expect(toRmbUpper('1.005')).toBe('壹元零壹分')
    expect(toRmbUpper('0.994')).toBe('玖角玖分')
    expect(toRmbUpper('9.995')).toBe('壹拾元整')
    expect(toRmbUpper('99999.999')).toBe('壹拾万元整')
  })

  it('负零不加「负」', () => {
    expect(toRmbUpper('-0.001')).toBe('零元整')
  })

  it('非法输入与超长数字报错', () => {
    expect(() => toRmbUpper('abc')).toThrow(/数字/)
    expect(() => toRmbUpper('1.2.3')).toThrow()
    expect(() => toRmbUpper('12345678901234567')).toThrow(/16 位/)
  })
})

describe('toChineseNumber 中文数字', () => {
  it.each([
    ['0', '零'],
    ['10', '十'],
    ['15', '十五'],
    ['110', '一百一十'],
    ['1234.56', '一千二百三十四点五六'],
    ['100010', '十万零一十'],
    ['3.1400', '三点一四'],
    ['-7', '负七'],
  ])('%s → %s', (input, expected) => {
    expect(toChineseNumber(input)).toBe(expected)
  })

  it('大写读法', () => {
    expect(toChineseNumber('1234.5', true)).toBe('壹仟贰佰叁拾肆点伍')
    expect(toChineseNumber('10', true)).toBe('壹拾')
  })
})

describe('parseRmbUpper 大写转数字', () => {
  it.each([
    ['壹仟贰佰叁拾肆元伍角陆分', '1234.56'],
    ['壹亿零壹万元整', '100010000.00'],
    ['壹佰元零伍分', '100.05'],
    ['伍角', '0.50'],
    ['零元整', '0.00'],
    ['负壹拾贰元叁角', '-12.30'],
    ['人民币拾元正', '10.00'],
    ['壹万亿元整', '1000000000000.00'],
  ])('%s → %s', (input, expected) => {
    expect(parseRmbUpper(input)).toBe(expected)
  })

  it('与 toRmbUpper 往返一致', () => {
    for (const n of ['0.01', '7.8', '1001', '105000', '20000001', '987654321.09'])
      expect(Number(parseRmbUpper(toRmbUpper(n)))).toBe(Number(n))
  })

  it('无法识别的字符报错', () => {
    expect(() => parseRmbUpper('壹A元')).toThrow(/无法识别/)
  })
})

describe('辅助', () => {
  it('parseAmount 去掉前导零', () => {
    expect(parseAmount('007.5')).toEqual({ negative: false, int: '7', frac: '5' })
  })

  it('千分位', () => {
    expect(formatThousands('1234567.8')).toBe('1,234,567.80')
    expect(formatThousands('-0.005')).toBe('-0.01')
  })
})
