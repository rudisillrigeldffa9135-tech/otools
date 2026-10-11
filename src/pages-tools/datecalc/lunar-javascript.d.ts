// lunar-javascript 没有自带类型，这里只声明本项目用到的部分
declare module 'lunar-javascript' {
  interface JieQi {
    getName: () => string
    getSolar: () => Solar
  }

  interface Holiday {
    getName: () => string
    /** true 表示调休上班 */
    isWork: () => boolean
    /** 对应的节日当天，如 2026-10-01 */
    getTarget: () => string
    getDay: () => string
  }

  interface Lunar {
    getYear: () => number
    getMonth: () => number
    getDay: () => number
    getYearInChinese: () => string
    getMonthInChinese: () => string
    getDayInChinese: () => string
    getYearInGanZhi: () => string
    getMonthInGanZhi: () => string
    getDayInGanZhi: () => string
    getYearShengXiao: () => string
    getFestivals: () => string[]
    getOtherFestivals: () => string[]
    getJieQi: () => string
    getPrevJieQi: () => JieQi
    getNextJieQi: () => JieQi
    getDayYi: () => string[]
    getDayJi: () => string[]
    getSolar: () => Solar
    toString: () => string
  }

  interface Solar {
    getYear: () => number
    getMonth: () => number
    getDay: () => number
    getWeek: () => number
    getXingZuo: () => string
    getFestivals: () => string[]
    getOtherFestivals: () => string[]
    getLunar: () => Lunar
    toYmd: () => string
  }

  interface LunarMonth {
    getMonth: () => number
    getDayCount: () => number
  }

  export const Solar: {
    fromYmd: (y: number, m: number, d: number) => Solar
  }

  export const Lunar: {
    fromYmd: (y: number, m: number, d: number) => Lunar
  }

  export const LunarYear: {
    fromYear: (y: number) => {
      getLeapMonth: () => number
      getMonthsInYear: () => LunarMonth[]
    }
  }

  export const HolidayUtil: {
    getHoliday: (ymd: string) => Holiday | null
    getHolidays: (year: number) => Holiday[]
  }
}
