/** 农历、节气、节日与法定节假日（基于 lunar-javascript，数据离线内置） */
import type { WorkdayRule } from './date'
import { HolidayUtil, Lunar, LunarYear, Solar } from 'lunar-javascript'
import { diffDays, parseYmd, weekendRule } from './date'

/** 农历支持的公历范围 */
export const MIN_YEAR = 1901
export const MAX_YEAR = 2099

export interface DayInfo {
  /** 正月初一 */
  lunarDate: string
  /** 二〇二六年正月初一 */
  lunarFull: string
  ganzhiYear: string
  ganzhiMonth: string
  ganzhiDay: string
  zodiac: string
  /** 当天是节气则有值 */
  jieqi: string
  festivals: string[]
  xingzuo: string
  yi: string[]
  ji: string[]
  /** 法定节假日：放假 / 调休上班 */
  holiday?: { name: string, work: boolean }
}

function solarOf(date: string) {
  const { y, m, d } = parseYmd(date)
  return Solar.fromYmd(y, m, d)
}

export function dayInfo(date: string): DayInfo {
  const solar = solarOf(date)
  const lunar = solar.getLunar()
  const h = HolidayUtil.getHoliday(date)
  return {
    lunarDate: `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    lunarFull: lunar.toString(),
    ganzhiYear: lunar.getYearInGanZhi(),
    ganzhiMonth: lunar.getMonthInGanZhi(),
    ganzhiDay: lunar.getDayInGanZhi(),
    zodiac: lunar.getYearShengXiao(),
    jieqi: lunar.getJieQi(),
    festivals: [...lunar.getFestivals(), ...solar.getFestivals(), ...lunar.getOtherFestivals(), ...solar.getOtherFestivals()]
      .filter((v, i, arr) => arr.indexOf(v) === i),
    xingzuo: `${solar.getXingZuo()}座`,
    yi: lunar.getDayYi(),
    ji: lunar.getDayJi(),
    holiday: h ? { name: h.getName(), work: h.isWork() } : undefined,
  }
}

/** 日历格子里显示的简短文字：节日 > 节气 > 初一显示月份 > 日 */
export function shortLabel(date: string) {
  const solar = solarOf(date)
  const lunar = solar.getLunar()
  const fest = lunar.getFestivals()[0] || solar.getFestivals()[0]
  if (fest && fest.length <= 4)
    return fest
  if (lunar.getJieQi())
    return lunar.getJieQi()
  return lunar.getDay() === 1 ? `${lunar.getMonthInChinese()}月` : lunar.getDayInChinese()
}

/** 某个农历年的月份列表，闰月的月份为负数 */
export function lunarMonths(year: number) {
  return LunarYear.fromYear(year).getMonthsInYear().map(m => ({
    value: m.getMonth(),
    label: `${m.getMonth() < 0 ? '闰' : ''}${['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'][Math.abs(m.getMonth()) - 1]}月`,
    days: m.getDayCount(),
  }))
}

export const LUNAR_DAYS = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十']

/** 农历 → 公历 */
export function lunarToSolar(year: number, month: number, day: number) {
  return Lunar.fromYmd(year, month, day).getSolar().toYmd()
}

/** 该年是否有法定节假日数据（数据随国务院每年公布更新） */
export function hasHolidayData(year: number) {
  return HolidayUtil.getHolidays(year).length > 0
}

/** 当天的法定节假日安排：放假或调休上班，普通日子返回 undefined */
export function holidayOf(date: string) {
  const h = HolidayUtil.getHoliday(date)
  return h ? { name: h.getName(), work: h.isWork() } : undefined
}

/** 按国务院公布的放假与调休安排判断是否上班；没有数据的年份按周末双休 */
export const chinaWorkdayRule: WorkdayRule = (date) => {
  const h = HolidayUtil.getHoliday(date)
  return h ? h.isWork() : weekendRule(date)
}

export interface UpcomingHoliday {
  name: string
  /** 节日当天 */
  date: string
  /** 放假首日 */
  start: string
  /** 连休天数 */
  days: number
  /** 距今天数（放假首日） */
  inDays: number
}

/** 今天之后（含进行中）的法定节假日 */
export function upcomingHolidays(from: string, count = 3): UpcomingHoliday[] {
  const year = Number(from.slice(0, 4))
  const map = new Map<string, UpcomingHoliday>()
  for (const y of [year, year + 1]) {
    for (const h of HolidayUtil.getHolidays(y)) {
      if (h.isWork())
        continue
      const key = `${h.getName()}@${h.getTarget()}`
      const item = map.get(key)
      if (item) {
        item.days++
        if (h.getDay() < item.start)
          item.start = h.getDay()
      }
      else {
        map.set(key, { name: h.getName(), date: h.getTarget(), start: h.getDay(), days: 1, inDays: 0 })
      }
    }
  }
  return [...map.values()]
    .map(h => ({ ...h, inDays: diffDays(from, h.start) }))
    // 还没结束的假期
    .filter(h => h.inDays + h.days > 0)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, count)
}

/** 下一个节气 */
export function nextJieQi(date: string) {
  const jq = solarOf(date).getLunar().getNextJieQi()
  return { name: jq.getName(), date: jq.getSolar().toYmd() }
}
