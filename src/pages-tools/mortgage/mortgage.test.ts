import { buildPlan, formatMonths, groupByYear, mergePlans, money } from './mortgage'

const LOAN = { principal: 1_000_000, annualRate: 4.9, months: 360 }

describe('等额本息', () => {
  it('100 万 4.9% 30 年', () => {
    const p = buildPlan(LOAN, 'annuity')
    expect(money(p.firstPayment)).toBe('5,307.27')
    expect(money(p.totalInterest)).toBe('910,616.19')
    expect(p.months).toBe(360)
    expect(p.rows[359].balance).toBe(0)
  })

  it('利率为 0', () => {
    const p = buildPlan({ principal: 120000, annualRate: 0, months: 12 }, 'annuity')
    expect(p.firstPayment).toBe(10000)
    expect(p.totalInterest).toBe(0)
  })
})

describe('等额本金', () => {
  it('100 万 4.9% 30 年', () => {
    const p = buildPlan(LOAN, 'linear')
    expect(money(p.firstPayment)).toBe('6,861.11')
    // 每月递减 = 月本金 × 月利率
    expect(money(p.rows[0].payment - p.rows[1].payment)).toBe('11.34')
    expect(money(p.totalInterest)).toBe('737,041.67')
  })
})

describe('提前还款', () => {
  it('缩短年限：月供不变，期数减少，利息减少', () => {
    const base = buildPlan(LOAN, 'annuity')
    const p = buildPlan(LOAN, 'annuity', { afterPeriod: 36, amount: 200000, strategy: 'shorten' })
    expect(p.rows[35].prepaid).toBe(200000)
    expect(p.months).toBeLessThan(360)
    expect(p.rows[36].payment).toBeLessThanOrEqual(base.firstPayment + 0.01)
    expect(p.totalInterest).toBeLessThan(base.totalInterest)
    expect(p.rows[p.rows.length - 1].balance).toBe(0)
  })

  it('减少月供：期数不变，月供下降', () => {
    const base = buildPlan(LOAN, 'annuity')
    const p = buildPlan(LOAN, 'annuity', { afterPeriod: 36, amount: 200000, strategy: 'reduce' })
    expect(p.months).toBe(360)
    expect(p.rows[36].payment).toBeLessThan(base.firstPayment)
    // 缩短年限比减少月供省的利息更多
    const shorten = buildPlan(LOAN, 'annuity', { afterPeriod: 36, amount: 200000, strategy: 'shorten' })
    expect(shorten.totalInterest).toBeLessThan(p.totalInterest)
  })

  it('等额本金缩短年限保持月还本金', () => {
    const p = buildPlan(LOAN, 'linear', { afterPeriod: 12, amount: 100000, strategy: 'shorten' })
    expect(p.rows[12].principal).toBeCloseTo(1_000_000 / 360, 0)
    expect(p.months).toBe(12 + Math.ceil((1_000_000 - 12 * 1_000_000 / 360 - 100000) / (1_000_000 / 360)))
  })

  it('一次还清', () => {
    const p = buildPlan(LOAN, 'annuity', { afterPeriod: 12, amount: 5_000_000, strategy: 'shorten' })
    expect(p.months).toBe(12)
    expect(p.rows[11].balance).toBe(0)
    expect(p.rows[11].prepaid).toBeLessThan(1_000_000)
  })

  it('时间不合法', () => {
    expect(() => buildPlan(LOAN, 'annuity', { afterPeriod: 360, amount: 1, strategy: 'reduce' })).toThrow('1~359')
  })
})

describe('组合贷与工具函数', () => {
  it('按期合并', () => {
    const a = buildPlan({ principal: 600000, annualRate: 3.1, months: 360 }, 'annuity')
    const b = buildPlan({ principal: 400000, annualRate: 2.6, months: 240 }, 'annuity')
    const m = mergePlans(a, b)
    expect(m.months).toBe(360)
    expect(m.firstPayment).toBeCloseTo(a.firstPayment + b.firstPayment, 6)
    expect(m.rows[240].payment).toBeCloseTo(a.rows[240].payment, 6)
    expect(m.totalInterest).toBeCloseTo(a.totalInterest + b.totalInterest, 6)
  })

  it('按年分组', () => {
    const g = groupByYear(buildPlan(LOAN, 'linear').rows)
    expect(g).toHaveLength(30)
    expect(g[0].rows).toHaveLength(12)
    expect(g[29].balance).toBe(0)
  })

  it('格式化', () => {
    expect(money(1234567.891)).toBe('1,234,567.89')
    expect(formatMonths(125)).toBe('10 年 5 个月')
    expect(formatMonths(360)).toBe('30 年')
  })
})
