/**
 * 日期计算的纯函数。日期统一用 'YYYY-MM-DD' 字符串，
 * 内部换算成「距 1970-01-01 的天数」，避免时区与夏令时带来的误差。
 */

export interface Ymd {
  y: number
  m: number
  d: number
}

export function parseYmd(s: string): Ymd {
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m)
    throw new Error(`日期格式不正确：${s}`)
  const ymd = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
  if (ymd.m < 1 || ymd.m > 12 || ymd.d < 1 || ymd.d > daysInMonth(ymd.y, ymd.m))
    throw new Error(`日期不存在：${s}`)
  return ymd
}

export function formatYmd({ y, m, d }: Ymd) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function toDayNumber(s: string) {
  const { y, m, d } = parseYmd(s)
  return Math.round(Date.UTC(y, m - 1, d) / 86400000)
}

export function fromDayNumber(n: number) {
  const t = new Date(n * 86400000)
  return formatYmd({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() })
}

/** 今天（本地时区） */
export function today(now = new Date()) {
  return formatYmd({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() })
}

/** b - a 的天数 */
export function diffDays(a: string, b: string) {
  return toDayNumber(b) - toDayNumber(a)
}

export function addDays(s: string, n: number) {
  return fromDayNumber(toDayNumber(s) + n)
}

/** 加减月份；目标月没有该日时取月末（1 月 31 日 + 1 个月 = 2 月 28/29 日） */
export function addMonths(s: string, n: number) {
  const { y, m, d } = parseYmd(s)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12 + 12) % 12 + 1
  return formatYmd({ y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) })
}

/** 0=周日 … 6=周六 */
export function weekday(s: string) {
  // 1970-01-01 是周四
  return ((toDayNumber(s) % 7) + 7 + 4) % 7
}

export const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function dayOfYear(s: string) {
  return diffDays(`${s.slice(0, 4)}-01-01`, s) + 1
}

export function isLeapYear(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

/** ISO 8601 周数：周一为一周的开始，包含该年第一个周四的那一周是第 1 周 */
export function isoWeek(s: string) {
  const n = toDayNumber(s)
  const w = (weekday(s) + 6) % 7 // 0=周一
  const thursday = n - w + 3
  const year = Number(fromDayNumber(thursday).slice(0, 4))
  const week = Math.floor((thursday - toDayNumber(`${year}-01-01`)) / 7) + 1
  return { year, week }
}

/**
 * 两个日期相差几年几个月几天（按日历逐月计算）
 * 例：2024-01-31 → 2024-03-01 为 1 个月 1 天（先到 2-29，再加 1 天）
 */
export function ymdDiff(a: string, b: string) {
  const sign = toDayNumber(b) >= toDayNumber(a) ? 1 : -1
  const [from, to] = sign > 0 ? [a, b] : [b, a]
  const f = parseYmd(from)
  const t = parseYmd(to)
  let months = (t.y - f.y) * 12 + (t.m - f.m)
  if (months > 0 && toDayNumber(addMonths(from, months)) > toDayNumber(to))
    months--
  const days = diffDays(addMonths(from, months), to)
  return { sign, years: Math.floor(months / 12), months: months % 12, days, totalMonths: months }
}

/** 判断是否上班日的规则；返回 true 表示要上班 */
export type WorkdayRule = (date: string) => boolean

export const weekendRule: WorkdayRule = (s) => {
  const w = weekday(s)
  return w !== 0 && w !== 6
}

/** 统计区间内的工作日（含首尾） */
export function countWorkdays(a: string, b: string, isWorkday: WorkdayRule = weekendRule) {
  let start = toDayNumber(a)
  let end = toDayNumber(b)
  if (start > end)
    [start, end] = [end, start]
  let count = 0
  for (let n = start; n <= end; n++) {
    if (isWorkday(fromDayNumber(n)))
      count++
  }
  return count
}

/** 从 s 起加减 n 个工作日（不含当天），n 为负时往前推 */
export function addWorkdays(s: string, n: number, isWorkday: WorkdayRule = weekendRule) {
  const step = n >= 0 ? 1 : -1
  let left = Math.abs(n)
  let cur = toDayNumber(s)
  let guard = 0
  while (left > 0 && guard++ < 100000) {
    cur += step
    if (isWorkday(fromDayNumber(cur)))
      left--
  }
  return fromDayNumber(cur)
}
