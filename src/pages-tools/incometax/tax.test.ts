import { annualSummary, annualTax, bonusTaxSeparate, bonusTrap, EMPTY_SPECIAL, insuranceOf, monthlySpecial, monthlyWithholding } from './tax'

describe('annualTax', () => {
  it.each([
    [0, 0],
    [-100, 0],
    [36000, 1080],
    [36001, 1080.1],
    [100000, 7480],
    [144000, 11880],
    [300000, 43080],
    [1000000, 268080],
  ])('%d → %d', (taxable, tax) => {
    expect(annualTax(taxable)).toBeCloseTo(tax, 2)
  })
})

describe('年终奖单独计税', () => {
  it.each([
    [36000, 1080],
    [36001, 3390.1],
    [144000, 14190],
    [144001, 27390.2],
    [0, 0],
  ])('%d → %d', (bonus, tax) => {
    expect(bonusTaxSeparate(bonus).tax).toBeCloseTo(tax, 2)
  })

  it('临界点区间', () => {
    // 36000 元的税后为 34920；超过后要到 38566.67 才能追平
    expect(bonusTrap(36500)).toMatchObject({ from: 36000, to: 38566.67 })
    expect(bonusTrap(36500)!.loss).toBeCloseTo(34920 - (36500 - 3440), 2)
    expect(bonusTrap(40000)).toBeNull()
    expect(bonusTrap(30000)).toBeNull()
    expect(bonusTrap(150000)).toMatchObject({ from: 144000 })
  })
})

describe('累计预扣', () => {
  it('月薪 2 万、五险一金 3500、无专项扣除', () => {
    const rows = monthlyWithholding(20000, 3500, 0)
    // 每月应纳税所得额 11500：1~3 月 3%，第 4 月跨到 10%
    expect(rows[0].tax).toBe(345)
    expect(rows[2].tax).toBe(345)
    expect(rows[3].tax).toBeCloseTo(46000 * 0.1 - 2520 - 1035, 2)
    expect(rows[4].tax).toBe(1150)
    const total = rows.reduce((s, r) => s + r.tax, 0)
    expect(total).toBeCloseTo(annualTax(11500 * 12), 2)
  })

  it('收入不超过起征点不交税', () => {
    expect(monthlyWithholding(6000, 1000, 0).every(r => r.tax === 0)).toBe(true)
  })
})

describe('专项附加扣除与五险一金', () => {
  it('合计', () => {
    expect(monthlySpecial({ ...EMPTY_SPECIAL, children: 2, elderly: 1500, mortgage: true, rent: 1500 })).toBe(6500)
    expect(monthlySpecial({ ...EMPTY_SPECIAL, rent: 1100, education: true, elderly: 9999 })).toBe(4500)
  })

  it('五险一金', () => {
    expect(insuranceOf({ base: 10000, pension: 0.08, medical: 0.02, unemployment: 0.005, housingFund: 0.12 })).toBe(2250)
  })
})

describe('annualSummary', () => {
  it('高收入时年终奖单独计税更省', () => {
    const r = annualSummary(30000, 4500, EMPTY_SPECIAL, 60000)
    expect(r.better).toBe('separate')
    expect(r.separate.bonusTax).toBe(5790)
    expect(r.saving).toBeGreaterThan(0)
  })

  it('工资低于起征点时并入综合所得更省', () => {
    const r = annualSummary(4000, 400, EMPTY_SPECIAL, 30000)
    expect(r.better).toBe('combined')
    expect(r.combined.totalTax).toBe(396)
    expect(r.separate.totalTax).toBe(900)
  })

  it('个人养老金在年度扣除', () => {
    const a = annualSummary(20000, 3500, EMPTY_SPECIAL, 0)
    const b = annualSummary(20000, 3500, { ...EMPTY_SPECIAL, pension: 12000 }, 0)
    expect(a.salaryTax - b.salaryTax).toBe(1200)
  })
})
