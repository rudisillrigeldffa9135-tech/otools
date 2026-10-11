/** 房贷计算：等额本息 / 等额本金、组合贷、提前还款（纯函数，金额单位为元） */

export type RepayMethod = 'annuity' | 'linear'

export const METHOD_NAME: Record<RepayMethod, string> = {
  annuity: '等额本息',
  linear: '等额本金',
}

export interface Loan {
  /** 本金（元） */
  principal: number
  /** 年利率（%），如 3.1 */
  annualRate: number
  /** 期数（月） */
  months: number
}

export interface Row {
  /** 第几期，从 1 开始 */
  period: number
  payment: number
  principal: number
  interest: number
  /** 本期还款后剩余本金 */
  balance: number
  /** 本期之后进行了提前还款 */
  prepaid?: number
}

export interface Plan {
  rows: Row[]
  totalInterest: number
  /** 月供合计，不含提前还款的一次性金额 */
  totalPayment: number
  months: number
  firstPayment: number
  lastPayment: number
}

export interface Prepay {
  /** 在第几期还款之后提前还款 */
  afterPeriod: number
  amount: number
  /** 缩短年限（月供基本不变）或 减少月供（年限不变） */
  strategy: 'shorten' | 'reduce'
}

/** 等额本息月供 */
export function annuityPayment(principal: number, monthlyRate: number, months: number) {
  if (months <= 0)
    return 0
  if (monthlyRate === 0)
    return principal / months
  const f = (1 + monthlyRate) ** months
  return (principal * monthlyRate * f) / (f - 1)
}

/** 从 balance 开始按指定方式还 months 期，period 从 startPeriod+1 开始编号 */
function amortize(balance: number, monthlyRate: number, months: number, method: RepayMethod, startPeriod: number): Row[] {
  const rows: Row[] = []
  const pay = annuityPayment(balance, monthlyRate, months)
  const linearPrincipal = balance / months
  let b = balance
  for (let i = 1; i <= months; i++) {
    const interest = b * monthlyRate
    let principal = method === 'annuity' ? pay - interest : linearPrincipal
    // 最后一期把舍入误差一并还清
    if (i === months)
      principal = b
    b -= principal
    rows.push({ period: startPeriod + i, payment: principal + interest, principal, interest, balance: Math.max(0, b) })
  }
  return rows
}

function summarize(rows: Row[]): Plan {
  return {
    rows,
    totalInterest: rows.reduce((s, r) => s + r.interest, 0),
    totalPayment: rows.reduce((s, r) => s + r.payment, 0),
    months: rows.length,
    firstPayment: rows[0]?.payment ?? 0,
    lastPayment: rows[rows.length - 1]?.payment ?? 0,
  }
}

export function validateLoan(loan: Loan) {
  if (!(loan.principal > 0))
    throw new Error('贷款金额需大于 0')
  if (!(loan.annualRate >= 0) || loan.annualRate > 36)
    throw new Error('年利率需在 0~36% 之间')
  if (!Number.isInteger(loan.months) || loan.months < 1 || loan.months > 600)
    throw new Error('贷款期限需在 1~600 个月之间')
}

export function buildPlan(loan: Loan, method: RepayMethod, prepay?: Prepay): Plan {
  validateLoan(loan)
  const r = loan.annualRate / 100 / 12
  if (!prepay || prepay.amount <= 0)
    return summarize(amortize(loan.principal, r, loan.months, method, 0))

  if (!Number.isInteger(prepay.afterPeriod) || prepay.afterPeriod < 1 || prepay.afterPeriod >= loan.months)
    throw new Error(`提前还款时间需在第 1~${loan.months - 1} 期之间`)
  const before = amortize(loan.principal, r, loan.months, method, 0).slice(0, prepay.afterPeriod)
  const last = before[before.length - 1]
  const amount = Math.min(prepay.amount, last.balance)
  const balance = last.balance - amount
  before[before.length - 1] = { ...last, balance, prepaid: amount }
  if (balance <= 0.005)
    return summarize(before)

  const remaining = loan.months - prepay.afterPeriod
  let months = remaining
  if (prepay.strategy === 'shorten') {
    if (method === 'annuity') {
      // 保持原月供不变，反推需要的期数
      const pay = annuityPayment(loan.principal, r, loan.months)
      months = r === 0 ? Math.ceil(balance / pay) : Math.ceil(-Math.log(1 - (r * balance) / pay) / Math.log(1 + r) - 1e-9)
    }
    else {
      // 保持每月归还的本金不变
      months = Math.ceil(balance / (loan.principal / loan.months) - 1e-9)
    }
    months = Math.min(remaining, Math.max(1, months))
  }
  return summarize([...before, ...amortize(balance, r, months, method, prepay.afterPeriod)])
}

/** 组合贷：两笔贷款按期合并 */
export function mergePlans(a: Plan, b: Plan): Plan {
  const n = Math.max(a.rows.length, b.rows.length)
  const rows: Row[] = []
  for (let i = 0; i < n; i++) {
    const x = a.rows[i]
    const y = b.rows[i]
    const prepaid = (x?.prepaid ?? 0) + (y?.prepaid ?? 0)
    rows.push({
      period: i + 1,
      payment: (x?.payment ?? 0) + (y?.payment ?? 0),
      principal: (x?.principal ?? 0) + (y?.principal ?? 0),
      interest: (x?.interest ?? 0) + (y?.interest ?? 0),
      balance: (x?.balance ?? 0) + (y?.balance ?? 0),
      ...(prepaid ? { prepaid } : {}),
    })
  }
  return summarize(rows)
}

export interface YearGroup {
  year: number
  rows: Row[]
  payment: number
  principal: number
  interest: number
  balance: number
}

/** 按还款年度分组（第 1~12 期为第 1 年） */
export function groupByYear(rows: Row[]): YearGroup[] {
  const groups: YearGroup[] = []
  for (const row of rows) {
    const year = Math.ceil(row.period / 12)
    let g = groups[groups.length - 1]
    if (!g || g.year !== year) {
      g = { year, rows: [], payment: 0, principal: 0, interest: 0, balance: 0 }
      groups.push(g)
    }
    g.rows.push(row)
    g.payment += row.payment
    g.principal += row.principal
    g.interest += row.interest
    g.balance = row.balance
  }
  return groups
}

/** 金额格式化：千分位，保留 2 位小数 */
export function money(n: number, digits = 2) {
  const fixed = (Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits)
  const [int, dec] = fixed.split('.')
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${dec ? `.${dec}` : ''}`
}

/** 以万元显示，如 91.06 万 */
export function wan(n: number) {
  return `${money(n / 10000)} 万`
}

/** 120 → 10 年；125 → 10 年 5 个月 */
export function formatMonths(months: number) {
  const y = Math.floor(months / 12)
  const m = months % 12
  return [y ? `${y} 年` : '', m ? `${m} 个月` : ''].filter(Boolean).join(' ') || '0 个月'
}
