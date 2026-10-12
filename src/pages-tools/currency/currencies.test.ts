import { convert, currencyName, formatAmount } from './currencies'

const rates = { USD: 1, CNY: 7.1, JPY: 150, EUR: 0.9 }

describe('convert', () => {
  it('交叉汇率', () => {
    expect(convert(100, 'USD', 'CNY', rates)).toBeCloseTo(710)
    expect(convert(710, 'CNY', 'USD', rates)).toBeCloseTo(100)
    expect(convert(100, 'CNY', 'JPY', rates)).toBeCloseTo(2112.676, 2)
    expect(convert(1, 'EUR', 'CNY', rates)).toBeCloseTo(7.8889, 3)
  })
  it('未知币种', () => {
    expect(convert(1, 'XXX', 'CNY', rates)).toBeNaN()
  })
})

describe('formatAmount', () => {
  it.each([
    [1234.5, '1,234.50'],
    [7.123456, '7.1235'],
    [0.140845, '0.140845'],
    [0.00012345678, '0.00012346'],
    [Number.NaN, '—'],
  ])('%d → %s', (n, s) => {
    expect(formatAmount(n)).toBe(s)
  })
})

describe('currencyName', () => {
  it('常用币种用内置中文名', () => {
    expect(currencyName('HKD')).toBe('港币')
    expect(currencyName('ZZZ')).toBe('ZZZ')
  })
})
