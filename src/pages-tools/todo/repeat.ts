/**
 * 待办的重复规则（前端与 Worker 共用的纯函数）。
 * 日期统一用 'YYYY-MM-DD'，计算复用日期计算工具的函数；「工作日」按国务院公布的放假与调休安排。
 */
import { addDays, addMonths, daysInMonth, diffDays, parseYmd, weekday } from '../datecalc/date'
import { chinaWorkdayRule } from '../datecalc/lunar'

export type RepeatFreq = 'day' | 'week' | 'month' | 'year' | 'workday'

export interface RepeatRule {
  freq: RepeatFreq
  /** 每隔几个周期，默认 1（工作日忽略） */
  interval?: number
  /** 每周的哪几天，0 为周日；不填则与截止日期同一天 */
  weekdays?: number[]
  /** 每月几号，-1 表示最后一天；不填则与截止日期同一天 */
  monthDay?: number
  /** 重复到哪天为止（含），不填则一直重复 */
  until?: string
}

export const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']
const MAX_STEPS = 5000

/** 校验并规范化（来自用户输入或接口），不合法返回 null */
export function normalizeRule(value: unknown): RepeatRule | null {
  if (!value || typeof value !== 'object')
    return null
  const v = value as Record<string, unknown>
  if (!['day', 'week', 'month', 'year', 'workday'].includes(v.freq as string))
    return null
  const rule: RepeatRule = { freq: v.freq as RepeatFreq }
  const interval = Number(v.interval ?? 1)
  if (rule.freq !== 'workday')
    rule.interval = Number.isInteger(interval) && interval >= 1 && interval <= 365 ? interval : 1
  if (rule.freq === 'week' && Array.isArray(v.weekdays)) {
    const days = [...new Set(v.weekdays.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    if (days.length)
      rule.weekdays = days
  }
  if (rule.freq === 'month' && v.monthDay !== undefined) {
    const d = Number(v.monthDay)
    if (d === -1 || (Number.isInteger(d) && d >= 1 && d <= 31))
      rule.monthDay = d
  }
  if (typeof v.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.until))
    rule.until = v.until
  return rule
}

/** 按规则从 due 往后走一步（不考虑 until） */
function step(rule: RepeatRule, due: string, anchor: string): string {
  const n = rule.interval ?? 1
  switch (rule.freq) {
    case 'day':
      return addDays(due, n)
    case 'workday': {
      let d = addDays(due, 1)
      for (let i = 0; i < 60 && !chinaWorkdayRule(d); i++)
        d = addDays(d, 1)
      return d
    }
    case 'week': {
      if (!rule.weekdays?.length)
        return addDays(due, 7 * n)
      // 以 anchor 所在的周为第 0 周，只在第 0、n、2n… 周的指定星期几出现
      const anchorWeekStart = addDays(anchor, -weekday(anchor))
      let d = addDays(due, 1)
      for (let i = 0; i < 7 * n + 7; i++, d = addDays(d, 1)) {
        const week = Math.floor(diffDays(anchorWeekStart, d) / 7)
        if (week % n === 0 && rule.weekdays.includes(weekday(d)))
          return d
      }
      return addDays(due, 7 * n)
    }
    case 'month': {
      const target = rule.monthDay ?? parseYmd(anchor).d
      const { y, m } = parseYmd(addMonths(`${due.slice(0, 7)}-01`, n))
      const last = daysInMonth(y, m)
      const day = target === -1 ? last : Math.min(target, last)
      return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
    case 'year': {
      const { y, m, d } = parseYmd(anchor)
      const ny = parseYmd(due).y + n
      // 2 月 29 日在平年取 2 月 28 日
      const day = Math.min(d, daysInMonth(ny, m))
      return `${ny}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
}

/**
 * 下一次的截止日期：严格晚于 due；如果算出来仍早于 today（很久没完成），继续往后直到不早于 today。
 * 超过 until 返回 null，表示重复结束。
 * @param anchor 规则的基准日期（第一次的截止日期），用于「每两周」「每月 31 号」这类需要记住原始日子的规则
 */
export function nextDue(rule: RepeatRule, due: string, today: string, anchor = due): string | null {
  let next = step(rule, due, anchor)
  for (let i = 0; i < MAX_STEPS && next < today; i++)
    next = step(rule, next, anchor)
  if (rule.until && next > rule.until)
    return null
  return next
}

/** 规则的中文描述 */
export function describeRule(rule: RepeatRule | null | undefined): string {
  if (!rule)
    return '不重复'
  const n = rule.interval ?? 1
  let text = ''
  switch (rule.freq) {
    case 'day':
      text = n === 1 ? '每天' : `每 ${n} 天`
      break
    case 'workday':
      text = '每个工作日'
      break
    case 'week':
      text = `${n === 1 ? '每周' : `每 ${n} 周的`}${rule.weekdays?.length ? rule.weekdays.map(d => `周${WEEKDAY_NAMES[d]}`).join('、') : ''}`
      if (!rule.weekdays?.length && n === 1)
        text = '每周'
      break
    case 'month':
      text = `${n === 1 ? '每月' : `每 ${n} 个月的`}${rule.monthDay === -1 ? '最后一天' : rule.monthDay ? `${rule.monthDay} 日` : ''}`
      break
    case 'year':
      text = n === 1 ? '每年' : `每 ${n} 年`
      break
  }
  return rule.until ? `${text}，到 ${rule.until}` : text
}

/**
 * 提醒时间（UTC 秒）：截止日期 + 时间（没有时间按 9:00）减去提前量；
 * @param tzOffset 与 Date.getTimezoneOffset() 相同的含义：UTC - 本地，单位分钟（北京时间为 -480）
 */
export function remindAt(dueDate: string | null, dueTime: string | null, remindBefore: number | null, tzOffset: number) {
  if (!dueDate || remindBefore === null || remindBefore === undefined || remindBefore < 0)
    return 0
  const { y, m, d } = parseYmd(dueDate)
  const [hh, mm] = (dueTime || '09:00').split(':').map(Number)
  const localMs = Date.UTC(y, m - 1, d, hh, mm)
  return Math.floor(localMs / 1000) + tzOffset * 60 - remindBefore * 60
}

/** 某个时区下的「今天」 */
export function todayIn(tzOffset: number, nowMs = Date.now()) {
  const t = new Date(nowMs - tzOffset * 60000)
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}
