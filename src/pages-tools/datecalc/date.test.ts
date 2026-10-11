import { addDays, addMonths, addWorkdays, countWorkdays, dayOfYear, diffDays, isoWeek, parseYmd, weekday, ymdDiff } from './date'
import { chinaWorkdayRule, dayInfo, hasHolidayData, lunarMonths, lunarToSolar, nextJieQi, shortLabel, upcomingHolidays } from './lunar'

describe('基础计算', () => {
  it('天数差与加减', () => {
    expect(diffDays('2026-01-01', '2026-12-31')).toBe(364)
    expect(diffDays('2024-03-01', '2024-02-28')).toBe(-2)
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
  })

  it('加减月份取月末', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28')
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15')
    expect(addMonths('2026-10-11', 120)).toBe('2036-10-11')
  })

  it('星期、第几天、ISO 周', () => {
    expect(weekday('2026-10-11')).toBe(0)
    expect(weekday('1970-01-01')).toBe(4)
    expect(weekday('1900-01-01')).toBe(1)
    expect(dayOfYear('2024-12-31')).toBe(366)
    expect(isoWeek('2026-01-01')).toEqual({ year: 2026, week: 1 })
    expect(isoWeek('2027-01-01')).toEqual({ year: 2026, week: 53 })
    expect(isoWeek('2024-12-30')).toEqual({ year: 2025, week: 1 })
  })

  it('几年几个月几天', () => {
    expect(ymdDiff('2000-02-29', '2026-10-11')).toMatchObject({ years: 26, months: 7, days: 12 })
    expect(ymdDiff('2024-01-31', '2024-03-01')).toMatchObject({ years: 0, months: 1, days: 1 })
    expect(ymdDiff('2026-10-11', '2026-01-01')).toMatchObject({ sign: -1, months: 9, days: 10 })
  })

  it('非法日期', () => {
    expect(() => parseYmd('2025-02-29')).toThrow('不存在')
    expect(() => parseYmd('2026/1/1')).toThrow('格式')
  })
})

describe('工作日', () => {
  it('仅按周末', () => {
    // 2026-10-12（周一）~ 10-18（周日）
    expect(countWorkdays('2026-10-12', '2026-10-18')).toBe(5)
    expect(addWorkdays('2026-10-16', 1)).toBe('2026-10-19')
    expect(addWorkdays('2026-10-19', -1)).toBe('2026-10-16')
  })

  it('按法定节假日与调休', () => {
    // 2026 国庆 10-01~10-07 放假，10-10（周六）调休上班
    expect(chinaWorkdayRule('2026-10-01')).toBe(false)
    expect(chinaWorkdayRule('2026-10-10')).toBe(true)
    expect(countWorkdays('2026-10-01', '2026-10-11', chinaWorkdayRule)).toBe(3)
    expect(addWorkdays('2026-09-30', 1, chinaWorkdayRule)).toBe('2026-10-08')
  })

  it('数据年份', () => {
    expect(hasHolidayData(2026)).toBe(true)
  })
})

describe('农历', () => {
  it('公历转农历', () => {
    const info = dayInfo('2026-02-17')
    expect(info.lunarDate).toBe('正月初一')
    expect(info.ganzhiYear).toBe('丙午')
    expect(info.zodiac).toBe('马')
    expect(info.festivals).toContain('春节')
    expect(dayInfo('2026-04-05').jieqi).toBe('清明')
    expect(dayInfo('2026-10-01').holiday).toEqual({ name: '国庆节', work: false })
  })

  it('农历转公历（含闰月）', () => {
    expect(lunarToSolar(2026, 8, 15)).toBe('2026-09-25')
    expect(lunarToSolar(2025, -6, 1)).toBe('2025-07-25')
    expect(lunarMonths(2025).map(m => m.label)).toContain('闰六月')
    expect(lunarMonths(2026)).toHaveLength(12)
  })

  it('日历短标签', () => {
    expect(shortLabel('2026-02-17')).toBe('春节')
    expect(shortLabel('2026-04-05')).toBe('清明')
    expect(shortLabel('2026-10-11')).toBe('初二')
  })

  it('节气与节假日倒计时', () => {
    expect(nextJieQi('2026-10-11')).toEqual({ name: '霜降', date: '2026-10-23' })
    const list = upcomingHolidays('2026-10-03', 2)
    // 国庆假期进行中
    expect(list[0]).toMatchObject({ name: '国庆节', start: '2026-10-01', days: 7, inDays: -2 })
  })
})
