/**
 * 纪念日的日期计算（前端与 Worker 共用的纯函数）：
 * - 公历 / 农历 / 「某月第几个星期几」（母亲节、父亲节）三种日期
 * - 每年重复的下一次日期、倒数天数、累计天数（起始日算第 1 天或第 0 天）、第几周年 / 几岁
 * - 农历闰月（按正常月份过 / 只在有闰月的年份过）、农历三十（小月取二十九）、公历 2 月 29 日（平年取 2 月 28 日或 3 月 1 日）
 * - 里程碑：第 100 / 520 / 1000 / 10000 天等
 */
import { Lunar, LunarYear, Solar } from 'lunar-javascript'
import { addDays, daysInMonth, diffDays, isLeapYear, parseYmd } from '../datecalc/date'

export type CalendarType = 'solar' | 'lunar' | 'weekday'

export interface AnnivDate {
  calendar: CalendarType
  /** 起始年份（生日的出生年、恋爱开始的年份）；节日这类没有起始年的为 null */
  year: number | null
  /** 公历 / 农历月份 1~12 */
  month: number
  /** 公历 / 农历日 1~31（weekday 类型不用） */
  day: number
  /** 起始日是农历闰月 */
  leap?: boolean
  /** weekday 类型：第几个（1~5，-1 为最后一个） */
  nth?: number
  /** weekday 类型：星期几，0 为周日 */
  weekday?: number
}

export interface AnnivRule {
  date: AnnivDate
  /** 每年重复（生日、纪念日、节日）；否则只算一次（考试、旅行、戒烟第 N 天） */
  repeat: boolean
  /** 累计天数是否把起始日算作第 1 天 */
  countFromOne: boolean
  /** 农历闰月起始日的过法：normal 每年按正常月份过；leapOnly 只在有该闰月的年份过 */
  leapRule?: 'normal' | 'leapOnly'
  /** 公历 2 月 29 日在平年的过法 */
  feb29Rule?: 'feb28' | 'mar1'
}

export const LUNAR_MIN_YEAR = 1901
export const LUNAR_MAX_YEAR = 2099

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

/** 农历某年某月（负数为闰月）的天数；该月不存在返回 0 */
function lunarMonthDays(year: number, month: number) {
  const found = LunarYear.fromYear(year).getMonthsInYear().find(m => m.getMonth() === month)
  return found ? found.getDayCount() : 0
}

/** 农历日期 → 公历；日超出该月天数时取月末（腊月三十在小月年取二十九） */
export function lunarToSolarClamped(year: number, month: number, day: number): string | null {
  if (year < LUNAR_MIN_YEAR || year > LUNAR_MAX_YEAR)
    return null
  const days = lunarMonthDays(year, month)
  if (!days)
    return null
  return Lunar.fromYmd(year, month, Math.min(day, days)).getSolar().toYmd()
}

/** 某年某月第 n 个星期几（n = -1 为最后一个） */
export function nthWeekday(year: number, month: number, nth: number, wd: number) {
  if (nth === -1) {
    const last = daysInMonth(year, month)
    const lastWd = new Date(Date.UTC(year, month - 1, last)).getUTCDay()
    return ymd(year, month, last - ((lastWd - wd + 7) % 7))
  }
  const firstWd = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const day = 1 + ((wd - firstWd + 7) % 7) + (nth - 1) * 7
  return day <= daysInMonth(year, month) ? ymd(year, month, day) : null
}

/** 起始日（公历）；没有起始年份时返回 null */
export function originDate(d: AnnivDate): string | null {
  if (!d.year)
    return null
  if (d.calendar === 'lunar')
    return lunarToSolarClamped(d.year, d.leap ? -d.month : d.month, d.day)
  if (d.calendar === 'weekday')
    return nthWeekday(d.year, d.month, d.nth ?? 1, d.weekday ?? 0)
  return ymd(d.year, d.month, Math.min(d.day, daysInMonth(d.year, d.month)))
}

/**
 * 第 cycle 年的那一次（公历日期）。cycle 对公历 / 星期规则是公历年，对农历是农历年。
 * 当年没有这一天（如只在闰年过的闰月生日）返回 null。
 */
export function occurrence(rule: AnnivRule, cycle: number): string | null {
  const d = rule.date
  if (d.calendar === 'weekday')
    return nthWeekday(cycle, d.month, d.nth ?? 1, d.weekday ?? 0)
  if (d.calendar === 'lunar') {
    if (d.leap && rule.leapRule === 'leapOnly') {
      if (LunarYear.fromYear(cycle).getLeapMonth() !== d.month)
        return null
      return lunarToSolarClamped(cycle, -d.month, d.day)
    }
    return lunarToSolarClamped(cycle, d.month, d.day)
  }
  if (d.month === 2 && d.day === 29 && !isLeapYear(cycle))
    return rule.feb29Rule === 'mar1' ? ymd(cycle, 3, 1) : ymd(cycle, 2, 28)
  return ymd(cycle, d.month, Math.min(d.day, daysInMonth(cycle, d.month)))
}

/** 不早于 from 的下一次（含 from 当天），返回日期与对应的周期（年） */
export function nextOccurrence(rule: AnnivRule, from: string): { date: string, cycle: number } | null {
  if (!rule.repeat) {
    const o = originDate(rule.date)
    return o && o >= from ? { date: o, cycle: rule.date.year! } : null
  }
  const year = Number(from.slice(0, 4))
  // 农历年跨公历年，从前一年开始找；只在闰年过的闰月可能要往后找很多年
  const maxCycles = rule.date.calendar === 'lunar' && rule.date.leap && rule.leapRule === 'leapOnly' ? 80 : 4
  for (let cycle = year - 1; cycle <= year - 1 + maxCycles; cycle++) {
    if (rule.date.year && cycle < rule.date.year)
      continue
    const date = occurrence(rule, cycle)
    if (date && date >= from)
      return { date, cycle }
  }
  return null
}

/** 接下来的若干次（用于「未来几年」列表、日历订阅） */
export function upcomingOccurrences(rule: AnnivRule, from: string, count: number) {
  const list: { date: string, cycle: number }[] = []
  let cursor = from
  for (let i = 0; i < count * 3 && list.length < count; i++) {
    const next = nextOccurrence(rule, cursor)
    if (!next)
      break
    list.push(next)
    if (!rule.repeat)
      break
    cursor = addDays(next.date, 1)
  }
  return list
}

/** 累计天数：起始日到 today；countFromOne 时起始日当天为第 1 天 */
export function daysSince(origin: string, today: string, countFromOne: boolean) {
  return diffDays(origin, today) + (countFromOne ? 1 : 0)
}

/** 第 N 天对应的日期 */
export function dateOfDay(origin: string, n: number, countFromOne: boolean) {
  return addDays(origin, n - (countFromOne ? 1 : 0))
}

export type DisplayKind = 'countdown' | 'today' | 'countup' | 'past'

export interface AnnivSummary {
  /** countdown 还有 N 天；today 就是今天；countup 已经 N 天（一次性、已过去）；past 已过去且不累计（不会出现：一次性过去即 countup） */
  kind: DisplayKind
  /** 主数字 */
  days: number
  /** 下一次日期（每年重复或未来的一次性） */
  nextDate: string | null
  /** 下一次是第几次（周年数 / 岁数），没有起始年为 null */
  nth: number | null
  /** 起始日至今的累计天数（有起始年且已开始时） */
  totalDays: number | null
  origin: string | null
}

export function summarize(rule: AnnivRule, today: string): AnnivSummary {
  const origin = originDate(rule.date)
  const totalDays = origin && origin <= today ? daysSince(origin, today, rule.countFromOne) : null
  const next = nextOccurrence(rule, today)
  if (next) {
    const days = diffDays(today, next.date)
    let nth: number | null = null
    if (rule.repeat && rule.date.year)
      nth = next.cycle - rule.date.year
    return { kind: days === 0 ? 'today' : 'countdown', days, nextDate: next.date, nth, totalDays, origin }
  }
  // 一次性且已过去：累计天数
  return { kind: 'countup', days: totalDays ?? 0, nextDate: null, nth: null, totalDays, origin }
}

/** 常见里程碑天数 */
export const MILESTONE_DAYS = [100, 200, 300, 365, 500, 520, 666, 999, 1000, 1314, 1500, 2000, 2500, 3000, 3650, 5000, 5200, 6666, 7300, 8888, 9999, 10000, 13140, 15000, 20000]

export interface Milestone {
  day: number
  date: string
  /** 距今天数，负数为已过去 */
  inDays: number
}

/** 起始日之后的里程碑：已过去的最近几个与即将到来的几个 */
export function milestones(origin: string, today: string, countFromOne: boolean, before = 2, after = 4): Milestone[] {
  const all = MILESTONE_DAYS.map(day => ({ day, date: dateOfDay(origin, day, countFromOne) }))
    .map(m => ({ ...m, inDays: diffDays(today, m.date) }))
  const past = all.filter(m => m.inDays < 0).slice(-before)
  const future = all.filter(m => m.inDays >= 0).slice(0, after)
  return [...past, ...future]
}

/** 日期描述：公历「2026-10-26」、农历「农历八月十五」、星期规则「5 月第 2 个周日」 */
const LUNAR_MONTHS = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊']
const LUNAR_DAYS = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十']
const WEEK_NAMES = ['日', '一', '二', '三', '四', '五', '六']

export function describeDate(d: AnnivDate) {
  if (d.calendar === 'lunar')
    return `${d.year ? `${d.year} 年 ` : ''}农历${d.leap ? '闰' : ''}${LUNAR_MONTHS[d.month - 1]}月${LUNAR_DAYS[d.day - 1]}`
  if (d.calendar === 'weekday')
    return `${d.year ? `${d.year} 年 ` : '每年 '}${d.month} 月${d.nth === -1 ? '最后一个' : `第 ${d.nth} 个`}周${WEEK_NAMES[d.weekday ?? 0]}`
  return d.year ? ymd(d.year, d.month, d.day) : `每年 ${d.month} 月 ${d.day} 日`
}

/** 生肖与星座（生日用） */
export function birthInfo(origin: string) {
  const { y, m, d } = parseYmd(origin)
  const solar = Solar.fromYmd(y, m, d)
  return { zodiac: solar.getLunar().getYearShengXiao(), xingzuo: `${solar.getXingZuo()}座` }
}

/** 公历日期对应的农历文字，如「八月十五」 */
export function lunarText(date: string) {
  const { y, m, d } = parseYmd(date)
  const lunar = Solar.fromYmd(y, m, d).getLunar()
  return `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`
}

/** 校验并规范化来自接口的日期规则，不合法返回 null */
export function normalizeDate(value: unknown): AnnivDate | null {
  if (!value || typeof value !== 'object')
    return null
  const v = value as Record<string, unknown>
  const calendar = v.calendar
  if (calendar !== 'solar' && calendar !== 'lunar' && calendar !== 'weekday')
    return null
  const year = v.year === null || v.year === undefined || v.year === '' ? null : Number(v.year)
  const month = Number(v.month)
  const day = Number(v.day ?? 1)
  if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2100))
    return null
  if (!Number.isInteger(month) || month < 1 || month > 12)
    return null
  const d: AnnivDate = { calendar, year, month, day: 1 }
  if (calendar === 'weekday') {
    const nth = Number(v.nth)
    const wd = Number(v.weekday)
    if (![1, 2, 3, 4, 5, -1].includes(nth) || !Number.isInteger(wd) || wd < 0 || wd > 6)
      return null
    d.nth = nth
    d.weekday = wd
    return d
  }
  if (!Number.isInteger(day) || day < 1)
    return null
  if (calendar === 'lunar') {
    if (day > 30)
      return null
    if (year !== null && (year < LUNAR_MIN_YEAR || year > LUNAR_MAX_YEAR))
      return null
    d.leap = v.leap === true
    if (d.leap && year !== null && LunarYear.fromYear(year).getLeapMonth() !== month)
      return null
    d.day = day
    return d
  }
  if (day > (year ? daysInMonth(year, month) : month === 2 ? 29 : daysInMonth(2000, month)))
    return null
  d.day = day
  return d
}

export interface RemindPlan {
  /** 提醒时间（UTC 秒） */
  at: number
  /** occurrence：纪念日当天或提前 N 天；milestone：第 N 天里程碑 */
  kind: 'occurrence' | 'milestone'
  /** 对应的纪念日 / 里程碑日期 */
  date: string
  daysBefore: number
  /** 里程碑天数 */
  day?: number
}

/**
 * 下一次提醒：纪念日当天或提前若干天（remindDays，如 [0, 1, 7]），以及里程碑当天；取最早且晚于 now 的一个。
 * @param time 提醒的时刻 'HH:mm'，默认 09:00
 * @param tzOffset 与 Date.getTimezoneOffset() 相同含义（北京时间为 -480）
 */
export function nextRemind(rule: AnnivRule, remindDays: number[], milestone: boolean, time: string | null, tzOffset: number, nowMs = Date.now()): RemindPlan | null {
  const [hh, mm] = (time || '09:00').split(':').map(Number)
  const toUtc = (date: string) => {
    const { y, m, d } = parseYmd(date)
    return Math.floor(Date.UTC(y, m - 1, d, hh, mm) / 1000) + tzOffset * 60
  }
  const nowSec = Math.floor(nowMs / 1000)
  // 本地今天往前一点开始找，避免「提前 7 天」错过
  const localToday = new Date(nowMs - tzOffset * 60000).toISOString().slice(0, 10)
  const candidates: RemindPlan[] = []
  if (remindDays.length) {
    for (const o of upcomingOccurrences(rule, localToday, 2)) {
      for (const before of remindDays) {
        const date = addDays(o.date, -before)
        const at = toUtc(date)
        if (at > nowSec)
          candidates.push({ at, kind: 'occurrence', date: o.date, daysBefore: before })
      }
    }
  }
  const origin = originDate(rule.date)
  if (milestone && origin) {
    for (const m of milestones(origin, localToday, rule.countFromOne, 0, 3)) {
      const at = toUtc(m.date)
      if (at > nowSec)
        candidates.push({ at, kind: 'milestone', date: m.date, daysBefore: 0, day: m.day })
    }
  }
  candidates.sort((a, b) => a.at - b.at)
  return candidates[0] ?? null
}
