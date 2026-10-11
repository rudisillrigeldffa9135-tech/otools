/**
 * 人民币金额大写与中文数字（全部基于字符串运算，避免浮点误差）
 * 写法参照《支付结算办法》：到「元」为止的写「整」；角后不写「整」；元位后角为 0、分不为 0 时写「零」
 */

const UPPER_DIGITS = '零壹贰叁肆伍陆柒捌玖'
const LOWER_DIGITS = '零一二三四五六七八九'
const UPPER_UNITS = ['', '拾', '佰', '仟']
const LOWER_UNITS = ['', '十', '百', '千']
const BIG_UNITS = ['', '万', '亿', '万亿']

/** 最多 16 位整数（到「万亿」） */
const MAX_INT_DIGITS = 16

export interface ParsedAmount {
  negative: boolean
  /** 去掉前导零的整数部分 */
  int: string
  /** 小数部分（原样，可能超过 2 位） */
  frac: string
}

/** 解析输入的数字：允许千分位逗号、空格、¥ 符号 */
export function parseAmount(input: string): ParsedAmount {
  const s = input.replace(/[\s,，¥￥]/g, '')
  const m = s.match(/^(-)?(\d*)(?:\.(\d*))?$/)
  if (!s || !m || (!m[2] && !m[3]))
    throw new Error('请输入数字，如 1234.56')
  const int = m[2].replace(/^0+(?=\d)/, '') || '0'
  if (int.length > MAX_INT_DIGITS)
    throw new Error('整数部分最多 16 位（万亿级）')
  return { negative: !!m[1], int, frac: m[3] || '' }
}

/** 十进制字符串加一个小整数（避免依赖 BigInt，部分小程序环境不支持） */
const BigIntLike = {
  add(num: string, n: number) {
    const digits = num.split('').map(Number)
    let carry = n
    for (let i = digits.length - 1; i >= 0 && carry; i--) {
      const v = digits[i] + carry
      digits[i] = v % 10
      carry = Math.floor(v / 10)
    }
    return (carry ? String(carry) : '') + digits.join('')
  },
}

/** 四舍五入保留两位小数（字符串运算） */
export function roundTo2(int: string, frac: string) {
  const f = (`${frac}000`).slice(0, 3)
  let cents = BigIntLike.add(`${int}${f.slice(0, 2)}`, Number(f[2]) >= 5 ? 1 : 0)
  cents = cents.padStart(3, '0')
  return { int: cents.slice(0, -2).replace(/^0+(?=\d)/, ''), jiao: Number(cents.at(-2)), fen: Number(cents.at(-1)) }
}

/**
 * 整数部分转中文：每 4 位一节，节内连续的 0 只读一个「零」，节末的 0 不读；
 * 整节为 0 时不加节单位，且零会延续到下一节（如 1,0000,0001 → 壹亿零壹）
 */
function intToChinese(int: string, digits: string, units: string[]) {
  if (/^0*$/.test(int))
    return digits[0]
  let out = ''
  let zero = false
  const len = int.length
  for (let i = 0; i < len; i++) {
    const d = Number(int[i])
    const pos = len - 1 - i
    if (d === 0) {
      zero = true
    }
    else {
      if (zero && out)
        out += digits[0]
      zero = false
      out += digits[d] + units[pos % 4]
    }
    if (pos % 4 === 0 && pos > 0) {
      const group = int.slice(Math.max(0, i - 3), i + 1)
      if (Number(group) !== 0) {
        out += BIG_UNITS[pos / 4]
        zero = false
      }
    }
  }
  return out
}

/** 金额大写，如 1234.56 → 壹仟贰佰叁拾肆元伍角陆分 */
export function toRmbUpper(input: string) {
  const { negative, int: rawInt, frac } = parseAmount(input)
  const { int, jiao, fen } = roundTo2(rawInt, frac)
  if (int.length > MAX_INT_DIGITS)
    throw new Error('整数部分最多 16 位（万亿级）')
  const hasInt = int !== '0'
  let out = hasInt ? `${intToChinese(int, UPPER_DIGITS, UPPER_UNITS)}元` : ''
  if (!jiao && !fen) {
    out = `${out || '零元'}整`
  }
  else {
    if (jiao)
      out += `${UPPER_DIGITS[jiao]}角`
    else if (hasInt)
      out += '零'
    if (fen)
      out += `${UPPER_DIGITS[fen]}分`
  }
  const isZero = !hasInt && !jiao && !fen
  return (negative && !isZero ? '负' : '') + out
}

/**
 * 中文数字（读法），如 1234.56 → 一千二百三十四点五六
 * @param upper 使用大写数字：壹仟贰佰叁拾肆点伍陆
 */
export function toChineseNumber(input: string, upper = false) {
  const { negative, int, frac } = parseAmount(input)
  const digits = upper ? UPPER_DIGITS : LOWER_DIGITS
  let out = intToChinese(int, digits, upper ? UPPER_UNITS : LOWER_UNITS)
  // 小写读法：10~19 读作「十几」而不是「一十几」
  if (!upper && out.startsWith('一十') && int.length % 4 === 2)
    out = out.slice(1)
  const fracDigits = frac.replace(/0+$/, '')
  if (fracDigits)
    out += `点${Array.from(fracDigits, d => digits[Number(d)]).join('')}`
  const isZero = /^0*$/.test(int) && !fracDigits
  return (negative && !isZero ? '负' : '') + out
}

const DIGIT_MAP: Record<string, number> = {}
Array.from(UPPER_DIGITS).forEach((c, i) => (DIGIT_MAP[c] = i))
Array.from(LOWER_DIGITS).forEach((c, i) => (DIGIT_MAP[c] = i))
DIGIT_MAP['〇'] = 0
DIGIT_MAP['两'] = 2
const SMALL_UNIT_MAP: Record<string, number> = { 拾: 10, 十: 10, 佰: 100, 百: 100, 仟: 1000, 千: 1000 }

/** 解析整数部分的中文（大小写均可），按节累加：万、亿为节单位 */
function chineseToInt(s: string) {
  let total = 0
  let section = 0
  let num = 0
  for (const ch of s) {
    if (ch in DIGIT_MAP) {
      num = DIGIT_MAP[ch]
    }
    else if (ch in SMALL_UNIT_MAP) {
      // 「拾元」「十五」开头省略了「壹 / 一」
      section += (num || 1) * SMALL_UNIT_MAP[ch]
      num = 0
    }
    else if (ch === '万') {
      section = (section + num) * 10000
      num = 0
    }
    else if (ch === '亿') {
      total = (total + section + num) * 100000000
      section = 0
      num = 0
    }
    else {
      throw new Error(`无法识别的字符「${ch}」`)
    }
  }
  return total + section + num
}

/** 大写金额转回数字，用于核对，如 壹仟贰佰叁拾肆元伍角陆分 → 1234.56 */
export function parseRmbUpper(input: string) {
  let s = input.replace(/\s/g, '').replace(/^人民币/, '')
  if (!s)
    throw new Error('请输入大写金额')
  const negative = s.startsWith('负')
  if (negative)
    s = s.slice(1)
  s = s.replace(/[整正]$/, '')
  // 没有「元」时：含角分的是纯小数（如 伍角陆分），否则视为整数
  const yuan = s.search(/[元圆]/)
  const intPart = yuan >= 0 ? s.slice(0, yuan) : /[角分]/.test(s) ? '' : s
  const fracPart = yuan >= 0 ? s.slice(yuan + 1) : /[角分]/.test(s) ? s : ''
  let jiao = 0
  let fen = 0
  const jm = fracPart.match(/(.)角/)
  const fm = fracPart.match(/(.)分/)
  if (jm)
    jiao = DIGIT_MAP[jm[1]] ?? Number.NaN
  if (fm)
    fen = DIGIT_MAP[fm[1]] ?? Number.NaN
  if (fracPart.replace(/零|.角|.分/g, ''))
    throw new Error('角分部分格式不正确')
  if (Number.isNaN(jiao) || Number.isNaN(fen))
    throw new Error('角分部分格式不正确')
  const int = intPart ? chineseToInt(intPart) : 0
  if (!Number.isSafeInteger(int))
    throw new Error('金额过大')
  const value = `${int}.${jiao}${fen}`
  return (negative ? '-' : '') + value
}

/** 千分位格式化，如 1234567.8 → 1,234,567.80 */
export function formatThousands(input: string) {
  const { negative, int: rawInt, frac } = parseAmount(input)
  const { int, jiao, fen } = roundTo2(rawInt, frac)
  return `${negative ? '-' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${jiao}${fen}`
}
