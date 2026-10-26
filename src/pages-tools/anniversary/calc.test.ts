import type { AnnivRule } from './calc'
import { LunarYear, Solar } from 'lunar-javascript'
import { birthInfo, dateOfDay, daysSince, describeDate, lunarText, milestones, nextOccurrence, nextRemind, normalizeDate, nthWeekday, occurrence, originDate, summarize, upcomingOccurrences } from './calc'

const TODAY = '2026-10-26'
const rule = (p: Partial<AnnivRule> & { date: AnnivRule['date'] }): AnnivRule => ({ repeat: true, countFromOne: true, ...p })

describe('公历', () => {
  it('每年重复：下一次、倒数天数、第几周年', () => {
    const r = rule({ date: { calendar: 'solar', year: 2020, month: 11, day: 1 } })
    expect(summarize(r, TODAY)).toMatchObject({ kind: 'countdown', days: 6, nextDate: '2026-11-01', nth: 6 })
    const passed = rule({ date: { calendar: 'solar', year: 2020, month: 3, day: 1 } })
    expect(summarize(passed, TODAY)).toMatchObject({ nextDate: '2027-03-01', nth: 7 })
  })

  it('当天显示「就是今天」', () => {
    expect(summarize(rule({ date: { calendar: 'solar', year: 1996, month: 10, day: 26 } }), TODAY)).toMatchObject({ kind: 'today', days: 0, nth: 30 })
  })

  it('2 月 29 日在平年按设置取 28 日或 3 月 1 日', () => {
    const date = { calendar: 'solar' as const, year: 2028, month: 2, day: 29 }
    expect(occurrence(rule({ date }), 2029)).toBe('2029-02-28')
    expect(occurrence(rule({ date, feb29Rule: 'mar1' }), 2029)).toBe('2029-03-01')
    expect(occurrence(rule({ date }), 2032)).toBe('2032-02-29')
  })

  it('一次性：未来的倒数，过去的累计（起始日算第 1 天 / 第 0 天）', () => {
    const exam = rule({ repeat: false, date: { calendar: 'solar', year: 2026, month: 12, day: 20 } })
    expect(summarize(exam, TODAY)).toMatchObject({ kind: 'countdown', days: 55, nth: null })
    const quit = rule({ repeat: false, date: { calendar: 'solar', year: 2026, month: 1, day: 1 } })
    expect(summarize(quit, TODAY)).toMatchObject({ kind: 'countup', days: 299 })
    expect(summarize({ ...quit, countFromOne: false }, TODAY)).toMatchObject({ kind: 'countup', days: 298 })
  })

  it('每年重复的也给出累计天数', () => {
    expect(summarize(rule({ date: { calendar: 'solar', year: 2026, month: 1, day: 1 } }), TODAY).totalDays).toBe(299)
  })
})

describe('农历', () => {
  it('农历生日：下一次与岁数', () => {
    const r = rule({ date: { calendar: 'lunar', year: 1990, month: 8, day: 15 } })
    expect(originDate(r.date)).toBe('1990-10-03')
    // 2026 年中秋 9-25 已过，下一次 2027-09-15
    expect(summarize(r, TODAY)).toMatchObject({ nextDate: '2027-09-15', nth: 37 })
    expect(lunarText('2027-09-15')).toBe('八月十五')
  })

  it('腊月三十在小月年取二十九（除夕）', () => {
    const eve = rule({ date: { calendar: 'lunar', year: null, month: 12, day: 30 } })
    // 农历 2025 年腊月只有 29 天，除夕是 2026-02-16
    expect(occurrence(eve, 2025)).toBe('2026-02-16')
    expect(nextOccurrence(eve, TODAY)?.date).toBe('2027-02-05')
  })

  it('闰月：默认按正常月份过；只在闰年过时找下一个有该闰月的年份', () => {
    // 2023 年闰二月
    expect(LunarYear.fromYear(2023).getLeapMonth()).toBe(2)
    const date = { calendar: 'lunar' as const, year: 2023, month: 2, day: 1, leap: true }
    expect(originDate(date)).toBe('2023-03-22')
    expect(nextOccurrence(rule({ date }), TODAY)?.date).toBe(occurrence(rule({ date }), 2027))
    const only = nextOccurrence(rule({ date, leapRule: 'leapOnly' }), TODAY)!
    expect(LunarYear.fromYear(only.cycle).getLeapMonth()).toBe(2)
    const lunar = Solar.fromYmd(...(only.date.split('-').map(Number) as [number, number, number])).getLunar()
    expect(lunar.getMonth()).toBe(-2)
  })
})

describe('某月第几个星期几', () => {
  it('母亲节、父亲节、感恩节', () => {
    expect(nthWeekday(2026, 5, 2, 0)).toBe('2026-05-10')
    expect(nthWeekday(2026, 6, 3, 0)).toBe('2026-06-21')
    expect(nthWeekday(2026, 11, 4, 4)).toBe('2026-11-26')
    expect(nthWeekday(2026, 10, -1, 5)).toBe('2026-10-30')
    expect(nthWeekday(2026, 2, 5, 0)).toBeNull()
  })

  it('节日每年重复', () => {
    const mother = rule({ date: { calendar: 'weekday', year: null, month: 5, day: 1, nth: 2, weekday: 0 } })
    expect(nextOccurrence(mother, TODAY)?.date).toBe('2027-05-09')
    expect(describeDate(mother.date)).toBe('每年 5 月第 2 个周日')
  })
})

describe('累计与里程碑', () => {
  it('第 N 天对应的日期', () => {
    expect(dateOfDay('2026-01-01', 100, true)).toBe('2026-04-10')
    expect(dateOfDay('2026-01-01', 100, false)).toBe('2026-04-11')
    expect(daysSince('2026-01-01', '2026-01-01', true)).toBe(1)
  })

  it('最近的里程碑', () => {
    const list = milestones('2026-01-01', TODAY, true)
    // 今天是第 299 天：已过去的取最近 2 个，接下来取 4 个
    expect(list.map(m => m.day)).toEqual([100, 200, 300, 365, 500, 520])
    expect(list.find(m => m.day === 300)).toMatchObject({ date: '2026-10-27', inDays: 1 })
    expect(list.find(m => m.day === 365)).toMatchObject({ date: '2026-12-31', inDays: 66 })
  })

  it('未来几次', () => {
    const r = rule({ date: { calendar: 'solar', year: 2020, month: 11, day: 1 } })
    expect(upcomingOccurrences(r, TODAY, 3).map(o => o.date)).toEqual(['2026-11-01', '2027-11-01', '2028-11-01'])
    expect(upcomingOccurrences({ ...r, repeat: false, date: { ...r.date, year: 2027 } }, TODAY, 3)).toHaveLength(1)
  })
})

describe('其他', () => {
  it('生肖与星座', () => {
    expect(birthInfo('1990-10-03')).toEqual({ zodiac: '马', xingzuo: '天秤座' })
  })

  it('日期描述', () => {
    expect(describeDate({ calendar: 'lunar', year: 1990, month: 8, day: 15 })).toBe('1990 年 农历八月十五')
    expect(describeDate({ calendar: 'lunar', year: null, month: 2, day: 1, leap: true })).toBe('农历闰二月初一')
    expect(describeDate({ calendar: 'solar', year: null, month: 2, day: 14 })).toBe('每年 2 月 14 日')
  })

  it('normalizeDate 校验', () => {
    expect(normalizeDate({ calendar: 'solar', year: 2026, month: 2, day: 30 })).toBeNull()
    expect(normalizeDate({ calendar: 'solar', year: null, month: 2, day: 29 })).toMatchObject({ day: 29 })
    expect(normalizeDate({ calendar: 'lunar', year: 2026, month: 2, day: 1, leap: true })).toBeNull()
    expect(normalizeDate({ calendar: 'lunar', year: 2023, month: 2, day: 1, leap: true })).toMatchObject({ leap: true })
    expect(normalizeDate({ calendar: 'weekday', year: null, month: 5, nth: 2, weekday: 0 })).toMatchObject({ nth: 2, weekday: 0 })
    expect(normalizeDate({ calendar: 'weekday', year: null, month: 5, nth: 9, weekday: 0 })).toBeNull()
    expect(normalizeDate({ calendar: 'moon', month: 1 })).toBeNull()
  })
})

describe('nextRemind', () => {
  const now = Date.UTC(2026, 9, 26, 2, 0) // 北京时间 2026-10-26 10:00
  it('当天与提前几天，取最早且晚于现在的', () => {
    const r = rule({ date: { calendar: 'solar', year: 2020, month: 11, day: 1 } })
    // 提前 7 天是 10-25（已过），提前 1 天是 10-31 09:00
    expect(nextRemind(r, [0, 1, 7], false, null, -480, now)).toMatchObject({ kind: 'occurrence', date: '2026-11-01', daysBefore: 1, at: Date.UTC(2026, 9, 31, 1, 0) / 1000 })
    expect(nextRemind(r, [], false, null, -480, now)).toBeNull()
  })

  it('里程碑当天提醒', () => {
    const r = rule({ repeat: false, date: { calendar: 'solar', year: 2026, month: 1, day: 1 } })
    // 第 300 天是 10-27
    expect(nextRemind(r, [], true, '20:00', -480, now)).toMatchObject({ kind: 'milestone', day: 300, date: '2026-10-27', at: Date.UTC(2026, 9, 27, 12, 0) / 1000 })
  })
})
