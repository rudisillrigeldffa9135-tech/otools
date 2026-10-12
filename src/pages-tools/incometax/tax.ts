/**
 * 个人所得税（综合所得）计算，纯函数。
 * - 工资薪金按「累计预扣法」逐月预扣
 * - 全年一次性奖金可选单独计税（政策执行至 2027-12-31）或并入综合所得
 * - 专项附加扣除按 2023 年起执行的标准
 */

interface Bracket {
  /** 上限（含），最后一档为 Infinity */
  upTo: number
  rate: number
  /** 速算扣除数 */
  quick: number
}

/** 综合所得年度税率表 */
export const ANNUAL_BRACKETS: Bracket[] = [
  { upTo: 36000, rate: 0.03, quick: 0 },
  { upTo: 144000, rate: 0.1, quick: 2520 },
  { upTo: 300000, rate: 0.2, quick: 16920 },
  { upTo: 420000, rate: 0.25, quick: 31920 },
  { upTo: 660000, rate: 0.3, quick: 52920 },
  { upTo: 960000, rate: 0.35, quick: 85920 },
  { upTo: Infinity, rate: 0.45, quick: 181920 },
]

/** 按月换算后的综合所得税率表（年终奖单独计税使用） */
export const MONTHLY_BRACKETS: Bracket[] = [
  { upTo: 3000, rate: 0.03, quick: 0 },
  { upTo: 12000, rate: 0.1, quick: 210 },
  { upTo: 25000, rate: 0.2, quick: 1410 },
  { upTo: 35000, rate: 0.25, quick: 2660 },
  { upTo: 55000, rate: 0.3, quick: 4410 },
  { upTo: 80000, rate: 0.35, quick: 7160 },
  { upTo: Infinity, rate: 0.45, quick: 15160 },
]

/** 每月基本减除费用 */
export const BASIC_DEDUCTION = 5000

const round2 = (n: number) => Math.round(n * 100) / 100

function bracketOf(amount: number, table: Bracket[]) {
  return table.find(b => amount <= b.upTo)!
}

/** 按年度税率表计算应纳税额 */
export function annualTax(taxable: number) {
  if (taxable <= 0)
    return 0
  const b = bracketOf(taxable, ANNUAL_BRACKETS)
  return round2(taxable * b.rate - b.quick)
}

/** 年终奖单独计税：除以 12 找月度税率 */
export function bonusTaxSeparate(bonus: number) {
  if (bonus <= 0)
    return { tax: 0, rate: 0 }
  const b = bracketOf(bonus / 12, MONTHLY_BRACKETS)
  return { tax: round2(bonus * b.rate - b.quick), rate: b.rate }
}

export interface SpecialDeductions {
  /** 子女教育（每孩每月 2000） */
  children: number
  /** 3 岁以下婴幼儿照护（每孩每月 2000） */
  infants: number
  /** 赡养老人：独生子女 3000；非独生子女填分摊额（每人不超过 1500） */
  elderly: number
  /** 住房贷款利息（每月 1000），与住房租金二选一 */
  mortgage: boolean
  /** 住房租金：1500 / 1100 / 800，0 表示不扣 */
  rent: 0 | 800 | 1100 | 1500
  /** 学历（学位）继续教育（每月 400） */
  education: boolean
  /** 个人养老金年度缴费（上限 12000），在年度汇算时扣除 */
  pension: number
  /** 其他每月扣除（如企业年金、商业健康险等） */
  otherMonthly: number
}

export const EMPTY_SPECIAL: SpecialDeductions = {
  children: 0,
  infants: 0,
  elderly: 0,
  mortgage: false,
  rent: 0,
  education: false,
  pension: 0,
  otherMonthly: 0,
}

/** 每月可在预扣时扣除的专项附加扣除合计 */
export function monthlySpecial(s: SpecialDeductions) {
  return s.children * 2000
    + s.infants * 2000
    + Math.min(Math.max(s.elderly, 0), 3000)
    // 住房贷款利息与住房租金不能同时享受
    + (s.mortgage ? 1000 : s.rent)
    + (s.education ? 400 : 0)
    + Math.max(s.otherMonthly, 0)
}

/** 个人养老金只能在年度汇算时扣除 */
export function annualOnlyDeduction(s: SpecialDeductions) {
  return Math.min(Math.max(s.pension, 0), 12000)
}

export interface MonthRow {
  month: number
  gross: number
  insurance: number
  tax: number
  net: number
  /** 当月适用的预扣率 */
  rate: number
}

/**
 * 累计预扣法：第 m 个月的预扣税 = 累计应纳税额 − 已预扣
 * @param insurance 每月个人缴纳的五险一金
 */
export function monthlyWithholding(salary: number, insurance: number, special: number): MonthRow[] {
  const rows: MonthRow[] = []
  let paid = 0
  for (let m = 1; m <= 12; m++) {
    const taxable = Math.max(0, (salary - insurance - special - BASIC_DEDUCTION) * m)
    const cum = annualTax(taxable)
    const tax = round2(Math.max(0, cum - paid))
    paid = round2(paid + tax)
    rows.push({ month: m, gross: salary, insurance, tax, net: round2(salary - insurance - tax), rate: taxable > 0 ? bracketOf(taxable, ANNUAL_BRACKETS).rate : 0 })
  }
  return rows
}

export interface InsuranceRates {
  /** 缴费基数 */
  base: number
  pension: number
  medical: number
  unemployment: number
  housingFund: number
}

export const DEFAULT_INSURANCE_RATES = { pension: 0.08, medical: 0.02, unemployment: 0.005, housingFund: 0.07 }

/** 个人缴纳的五险一金（医保另有每月几元的大病统筹，各地不同，这里不计） */
export function insuranceOf(r: InsuranceRates) {
  const base = Math.max(r.base, 0)
  return round2(base * (r.pension + r.medical + r.unemployment + r.housingFund))
}

export interface AnnualResult {
  salaryTax: number
  /** 年终奖单独计税 */
  separate: { bonusTax: number, totalTax: number, bonusRate: number }
  /** 年终奖并入综合所得 */
  combined: { totalTax: number }
  /** 更省税的方式 */
  better: 'separate' | 'combined'
  saving: number
  grossIncome: number
  /** 采用更省方式后的税后年收入（已扣五险一金） */
  netIncome: number
  taxRate: number
}

/** 全年汇总：比较年终奖两种计税方式（含个人养老金等年度扣除） */
export function annualSummary(salary: number, insurance: number, special: SpecialDeductions, bonus: number): AnnualResult {
  const monthly = monthlySpecial(special)
  const yearly = annualOnlyDeduction(special)
  const baseTaxable = (salary - insurance - monthly - BASIC_DEDUCTION) * 12 - yearly
  const salaryTax = annualTax(Math.max(0, baseTaxable))
  const bonusSep = bonusTaxSeparate(bonus)
  // 并入综合所得时，工资部分的扣除额剩余（负的应纳税所得额）可以抵减奖金
  const combinedTax = annualTax(Math.max(0, baseTaxable + bonus))
  const separateTotal = round2(salaryTax + bonusSep.tax)
  const better = combinedTax < separateTotal ? 'combined' : 'separate'
  const totalTax = Math.min(combinedTax, separateTotal)
  const gross = salary * 12 + bonus
  return {
    salaryTax,
    separate: { bonusTax: bonusSep.tax, totalTax: separateTotal, bonusRate: bonusSep.rate },
    combined: { totalTax: combinedTax },
    better,
    saving: round2(Math.abs(combinedTax - separateTotal)),
    grossIncome: gross,
    netIncome: round2(gross - insurance * 12 - totalTax),
    taxRate: gross > 0 ? totalTax / gross : 0,
  }
}

/**
 * 年终奖单独计税的「多发反而少拿」区间：奖金刚超过某个档位时，多缴的税超过多发的钱。
 * 返回落在其中的区间 [from, to)，不在区间内返回 null
 */
export function bonusTrap(bonus: number) {
  for (let i = 0; i < MONTHLY_BRACKETS.length - 1; i++) {
    const from = MONTHLY_BRACKETS[i].upTo * 12
    const net = from - bonusTaxSeparate(from).tax
    const next = MONTHLY_BRACKETS[i + 1]
    // 解方程 x − (x·r − q) = net  →  x = (net − q) / (1 − r)
    const to = round2((net - next.quick) / (1 - next.rate))
    if (bonus > from && bonus < to)
      return { from, to, loss: round2(net - (bonus - bonusTaxSeparate(bonus).tax)) }
  }
  return null
}
