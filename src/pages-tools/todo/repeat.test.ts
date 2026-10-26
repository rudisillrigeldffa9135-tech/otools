import { describeRule, nextDue, normalizeRule, remindAt, todayIn } from './repeat'

describe('nextDue', () => {
  it('每天 / 每 N 天', () => {
    expect(nextDue({ freq: 'day' }, '2026-10-26', '2026-10-26')).toBe('2026-10-27')
    expect(nextDue({ freq: 'day', interval: 3 }, '2026-10-30', '2026-10-01')).toBe('2026-11-02')
  })

  it('很久没完成时跳到不早于今天的那一次', () => {
    expect(nextDue({ freq: 'day' }, '2026-10-01', '2026-10-26')).toBe('2026-10-26')
    expect(nextDue({ freq: 'week' }, '2026-10-01', '2026-10-26')).toBe('2026-10-29')
  })

  it('每周指定几天，每两周', () => {
    // 2026-10-26 是周一
    const rule = { freq: 'week' as const, weekdays: [1, 3, 5] }
    expect(nextDue(rule, '2026-10-26', '2026-10-26')).toBe('2026-10-28')
    expect(nextDue(rule, '2026-10-30', '2026-10-26')).toBe('2026-11-02')
    const biweekly = { freq: 'week' as const, interval: 2, weekdays: [1] }
    expect(nextDue(biweekly, '2026-10-26', '2026-10-26', '2026-10-26')).toBe('2026-11-09')
  })

  it('每月几号、月末、31 号在小月取月末后下个月恢复 31 号', () => {
    expect(nextDue({ freq: 'month' }, '2026-01-15', '2026-01-01')).toBe('2026-02-15')
    expect(nextDue({ freq: 'month', monthDay: -1 }, '2026-01-31', '2026-01-01')).toBe('2026-02-28')
    expect(nextDue({ freq: 'month' }, '2026-01-31', '2026-01-01', '2026-01-31')).toBe('2026-02-28')
    expect(nextDue({ freq: 'month' }, '2026-02-28', '2026-01-01', '2026-01-31')).toBe('2026-03-31')
  })

  it('每年，2 月 29 日在平年取 28 日', () => {
    expect(nextDue({ freq: 'year' }, '2028-02-29', '2028-01-01')).toBe('2029-02-28')
    expect(nextDue({ freq: 'year' }, '2029-02-28', '2029-01-01', '2028-02-29')).toBe('2030-02-28')
    expect(nextDue({ freq: 'year' }, '2031-02-28', '2031-01-01', '2028-02-29')).toBe('2032-02-29')
  })

  it('工作日按法定节假日与调休', () => {
    // 2026 国庆：10-01 ~ 10-07 放假，10-10（周六）调休上班
    expect(nextDue({ freq: 'workday' }, '2026-09-30', '2026-09-30')).toBe('2026-10-08')
    expect(nextDue({ freq: 'workday' }, '2026-10-09', '2026-10-09')).toBe('2026-10-10')
    // 普通周五 → 下周一
    expect(nextDue({ freq: 'workday' }, '2026-10-23', '2026-10-23')).toBe('2026-10-26')
  })

  it('超过结束日期返回 null', () => {
    expect(nextDue({ freq: 'day', until: '2026-10-27' }, '2026-10-27', '2026-10-27')).toBeNull()
  })
})

describe('normalizeRule', () => {
  it('过滤非法字段', () => {
    expect(normalizeRule({ freq: 'week', interval: 0, weekdays: [1, 9, 1, '3'] })).toEqual({ freq: 'week', interval: 1, weekdays: [1, 3] })
    expect(normalizeRule({ freq: 'month', monthDay: 40 })).toEqual({ freq: 'month', interval: 1 })
    expect(normalizeRule({ freq: 'hourly' })).toBeNull()
    expect(normalizeRule(null)).toBeNull()
  })
})

describe('describeRule', () => {
  it('中文描述', () => {
    expect(describeRule(null)).toBe('不重复')
    expect(describeRule({ freq: 'day', interval: 2 })).toBe('每 2 天')
    expect(describeRule({ freq: 'week', weekdays: [1, 3, 5] })).toBe('每周周一、周三、周五')
    expect(describeRule({ freq: 'month', monthDay: -1 })).toBe('每月最后一天')
    expect(describeRule({ freq: 'workday', until: '2026-12-31' })).toBe('每个工作日，到 2026-12-31')
  })
})

describe('remindAt', () => {
  it('北京时间 9:00（未填时间）提前 0 分钟', () => {
    // 2026-10-26 09:00 +08:00 = 01:00 UTC
    expect(remindAt('2026-10-26', null, 0, -480)).toBe(Date.UTC(2026, 9, 26, 1, 0) / 1000)
    expect(remindAt('2026-10-26', '15:30', 30, -480)).toBe(Date.UTC(2026, 9, 26, 7, 0) / 1000)
    expect(remindAt('2026-10-26', null, null, -480)).toBe(0)
  })

  it('某时区的今天', () => {
    // UTC 2026-10-26 17:00 在北京已是 27 日
    expect(todayIn(-480, Date.UTC(2026, 9, 26, 17, 0))).toBe('2026-10-27')
  })
})
