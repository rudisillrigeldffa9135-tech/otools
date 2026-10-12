/** 常用货币的中文名；不在表里的用浏览器的 Intl.DisplayNames 兜底 */
export const CURRENCY_ZH: Record<string, string> = {
  CNY: '人民币',
  USD: '美元',
  EUR: '欧元',
  JPY: '日元',
  HKD: '港币',
  GBP: '英镑',
  KRW: '韩元',
  TWD: '新台币',
  MOP: '澳门元',
  SGD: '新加坡元',
  AUD: '澳大利亚元',
  CAD: '加拿大元',
  CHF: '瑞士法郎',
  NZD: '新西兰元',
  THB: '泰铢',
  MYR: '马来西亚林吉特',
  IDR: '印尼盾',
  PHP: '菲律宾比索',
  VND: '越南盾',
  INR: '印度卢比',
  KHR: '柬埔寨瑞尔',
  LAK: '老挝基普',
  MMK: '缅甸元',
  MNT: '蒙古图格里克',
  KZT: '哈萨克斯坦坚戈',
  RUB: '俄罗斯卢布',
  AED: '阿联酋迪拉姆',
  SAR: '沙特里亚尔',
  QAR: '卡塔尔里亚尔',
  TRY: '土耳其里拉',
  ILS: '以色列新谢克尔',
  EGP: '埃及镑',
  ZAR: '南非兰特',
  SEK: '瑞典克朗',
  NOK: '挪威克朗',
  DKK: '丹麦克朗',
  PLN: '波兰兹罗提',
  CZK: '捷克克朗',
  HUF: '匈牙利福林',
  BRL: '巴西雷亚尔',
  MXN: '墨西哥比索',
  ARS: '阿根廷比索',
  CLP: '智利比索',
  PKR: '巴基斯坦卢比',
  BDT: '孟加拉塔卡',
  LKR: '斯里兰卡卢比',
  NPR: '尼泊尔卢比',
}

/** 默认展示的币种 */
export const DEFAULT_FAVORITES = ['CNY', 'USD', 'EUR', 'JPY', 'HKD', 'GBP', 'KRW', 'AUD', 'CAD', 'SGD', 'THB', 'TWD']

let displayNames: { of: (code: string) => string | undefined } | null | undefined

export function currencyName(code: string) {
  if (CURRENCY_ZH[code])
    return CURRENCY_ZH[code]
  if (displayNames === undefined) {
    try {
      displayNames = new (Intl as any).DisplayNames(['zh-CN'], { type: 'currency' })
    }
    catch {
      displayNames = null
    }
  }
  const name = displayNames?.of(code)
  return name && name !== code ? name : code
}

/** amount 个 from 等于多少 to；rates 为以同一基准货币计价的汇率表 */
export function convert(amount: number, from: string, to: string, rates: Record<string, number>) {
  const f = rates[from]
  const t = rates[to]
  if (!f || !t)
    return Number.NaN
  return (amount / f) * t
}

/** 金额越小保留的小数越多，避免 0.00 */
export function formatAmount(n: number) {
  if (!Number.isFinite(n))
    return '—'
  const abs = Math.abs(n)
  const digits = abs >= 100 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : 8
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: abs >= 100 ? 2 : 0 })
}
