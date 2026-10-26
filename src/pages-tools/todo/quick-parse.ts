/**
 * 快速添加的中文识别：从一句话里提取日期、时间、优先级、清单 / 标签、重复规则，剩下的作为标题。
 * 例：「明天下午3点 交周报 !高 #工作」→ 明天 15:00，高优先级，清单「工作」（没有同名清单时作为标签）
 *
 * 支持：
 * - 日期：今天 / 明天 / 后天 / 大后天、周X / 星期X / 下周X / 本周末、X月X日 / X号、2026-10-26、10/26、N天后、下个月X号
 * - 时间：上午 / 下午 / 晚上 / 中午 / 凌晨 + X点(半 / X分)、15:30
 * - 优先级：!高 / !中 / !低、!1 / !2 / !3、!!! / !! / !
 * - 清单与标签：#名称
 * - 重复：每天 / 每N天 / 每个工作日 / 每周X(、X) / 每月X号 / 每月最后一天 / 每年
 */
import type { RepeatRule } from './repeat'
import { addDays, addMonths, daysInMonth, weekday } from '../datecalc/date'

export interface ParsedTodo {
  title: string
  dueDate: string | null
  dueTime: string | null
  /** 0 无，1 低，2 中，3 高；null 表示没写 */
  priority: number | null
  /** #名称：与已有清单同名的作为清单，其余作为标签 */
  listName: string | null
  tags: string[]
  repeat: RepeatRule | null
  /** 识别出的片段（用于界面上提示） */
  tokens: string[]
}

const CN_NUM: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
const WEEK_CHARS: Record<string, number> = { 日: 0, 天: 0, 七: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }

/** 「十二」「二十三」「3」→ 数字 */
export function cnToNumber(s: string): number {
  if (/^\d+$/.test(s))
    return Number(s)
  if (s === '十')
    return 10
  if (s.startsWith('十'))
    return 10 + (CN_NUM[s[1]] ?? 0)
  if (s.includes('十')) {
    const [a, b] = s.split('十')
    return (CN_NUM[a] ?? 0) * 10 + (b ? CN_NUM[b] ?? 0 : 0)
  }
  return CN_NUM[s] ?? Number.NaN
}

const NUM = '(\\d{1,2}|[零〇一二两三四五六七八九十]{1,3})'

function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** 本周 / 下周的星期几：本周已过则视为下周 */
function weekdayDate(today: string, target: number, nextWeek: boolean) {
  const cur = weekday(today)
  // 以周一为一周开始
  const curIdx = (cur + 6) % 7
  const tIdx = (target + 6) % 7
  let diff = tIdx - curIdx
  if (nextWeek)
    diff += 7
  else if (diff < 0)
    diff += 7
  return addDays(today, diff)
}

export function parseQuickAdd(input: string, today: string, listNames: string[] = []): ParsedTodo {
  let text = ` ${input} `
  const tokens: string[] = []
  const result: ParsedTodo = { title: '', dueDate: null, dueTime: null, priority: null, listName: null, tags: [], repeat: null, tokens }

  /**
   * 匹配并移除一段文字。fn 返回 false 表示不算匹配；返回字符串表示匹配开头这几个字符不属于识别内容，需要保留
   * （不用正则后行断言：旧版 iOS 微信不支持）
   */
  function take(re: RegExp, fn: (m: RegExpMatchArray) => boolean | string | void) {
    // 依次尝试每一处匹配，第一处被否决时继续找后面的
    for (const m of text.matchAll(new RegExp(re.source, `${re.flags.replace('g', '')}g`))) {
      const r = fn(m)
      if (r === false)
        continue
      const keep = typeof r === 'string' ? r : ''
      tokens.push(m[0].slice(keep.length).trim())
      text = `${text.slice(0, m.index!)}${keep} ${text.slice(m.index! + m[0].length)}`
      return
    }
  }

  // 优先级
  take(/[!！]\s*([高中低123])(?=\s|$)/, (m) => {
    const v = m[1]
    result.priority = v === '高' || v === '3' ? 3 : v === '中' || v === '2' ? 2 : 1
  })
  if (result.priority === null) {
    take(/(?:^|\s)([!！]{1,3})(?=\s|$)/, (m) => {
      result.priority = m[1].length
    })
  }

  // #清单 / #标签（可以有多个）
  for (let i = 0; i < 10; i++) {
    const before = text
    take(/[#＃]([^\s#＃!！]{1,20})/, (m) => {
      const name = m[1]
      const list = listNames.find(n => n.toLowerCase() === name.toLowerCase())
      if (list && !result.listName)
        result.listName = list
      else if (!result.tags.includes(name))
        result.tags.push(name)
    })
    if (text === before)
      break
  }

  // 重复
  take(/每个?工作日/, () => {
    result.repeat = { freq: 'workday' }
  })
  if (!result.repeat) {
    take(new RegExp(`每隔?${NUM}?([天周年]|星期|个?月)`), (m) => {
      // 「每周一」交给下面的规则
      const after = text.slice(m.index! + m[0].length)
      if ((m[2] === '周' || m[2] === '星期') && /^[一二三四五六日天]/.test(after))
        return false
      // 「每月15号」「每月最后一天」也交给下面的规则
      if (m[2].endsWith('月') && /^(?:[\d一二三四五六七八九十]|最后|月底)/.test(after))
        return false
      const n = m[1] ? cnToNumber(m[1]) : 1
      const freq = m[2] === '天' ? 'day' : m[2].endsWith('月') ? 'month' : m[2] === '年' ? 'year' : 'week'
      result.repeat = { freq, interval: Number.isFinite(n) && n > 0 ? n : 1 }
    })
  }
  if (!result.repeat) {
    take(/每(?:周|星期)([一二三四五六日天](?:[、,，和]?[一二三四五六日天])*)/, (m) => {
      const days = [...new Set([...m[1]].filter(c => c in WEEK_CHARS).map(c => WEEK_CHARS[c]))].sort()
      result.repeat = { freq: 'week', weekdays: days }
      if (!result.dueDate)
        result.dueDate = days.map(d => weekdayDate(today, d, false)).sort()[0]
    })
  }
  if (!result.repeat) {
    take(/每月(?:最后一天|月底)/, () => {
      result.repeat = { freq: 'month', monthDay: -1 }
      const { y, m } = { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }
      result.dueDate = ymd(y, m, daysInMonth(y, m))
    })
  }
  if (!result.repeat) {
    take(new RegExp(`每月${NUM}[号日]`), (m) => {
      const d = cnToNumber(m[1])
      if (!(d >= 1 && d <= 31))
        return false
      result.repeat = { freq: 'month', monthDay: d }
      const y = Number(today.slice(0, 4))
      const mo = Number(today.slice(5, 7))
      let due = ymd(y, mo, Math.min(d, daysInMonth(y, mo)))
      if (due < today)
        due = addMonths(due, 1)
      result.dueDate = due
    })
  }

  /** 「今晚」「明早」后面再写几点时，按晚上 / 上午理解 */
  let periodHint = ''

  // 日期
  const year = Number(today.slice(0, 4))
  take(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})[日号]?/, (m) => {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo))
      return false
    result.dueDate = ymd(y, mo, d)
  })
  if (!result.dueDate) {
    take(new RegExp(`${NUM}月${NUM}[日号]?`), (m) => {
      const mo = cnToNumber(m[1])
      const d = cnToNumber(m[2])
      if (!(mo >= 1 && mo <= 12) || !(d >= 1 && d <= daysInMonth(year, mo)))
        return false
      let due = ymd(year, mo, d)
      if (due < today)
        due = ymd(year + 1, mo, Math.min(d, daysInMonth(year + 1, mo)))
      result.dueDate = due
    })
  }
  if (!result.dueDate) {
    take(/(?:^|\s)(\d{1,2})\/(\d{1,2})(?=\s|$)/, (m) => {
      const mo = Number(m[1])
      const d = Number(m[2])
      if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(year, mo))
        return false
      let due = ymd(year, mo, d)
      if (due < today)
        due = ymd(year + 1, mo, Math.min(d, daysInMonth(year + 1, mo)))
      result.dueDate = due
    })
  }
  if (!result.dueDate) {
    take(new RegExp(`下个?月${NUM}[号日]`), (m) => {
      const d = cnToNumber(m[1])
      const first = addMonths(`${today.slice(0, 7)}-01`, 1)
      const y = Number(first.slice(0, 4))
      const mo = Number(first.slice(5, 7))
      if (!(d >= 1 && d <= daysInMonth(y, mo)))
        return false
      result.dueDate = ymd(y, mo, d)
    })
  }
  if (!result.dueDate) {
    take(new RegExp(`(?:本月|这个月)?${NUM}号`), (m) => {
      const d = cnToNumber(m[1])
      const y = year
      const mo = Number(today.slice(5, 7))
      if (!(d >= 1 && d <= 31))
        return false
      let due = ymd(y, mo, Math.min(d, daysInMonth(y, mo)))
      if (due < today)
        due = addMonths(due, 1)
      result.dueDate = due
    })
  }
  if (!result.dueDate) {
    take(/大后天|后天|明天|今天|今晚|明早|明晚/, (m) => {
      const w = m[0]
      const offset = w === '大后天' ? 3 : w === '后天' ? 2 : w.startsWith('明') ? 1 : 0
      result.dueDate = addDays(today, offset)
      if (w === '今晚' || w === '明晚') {
        result.dueTime = '20:00'
        periodHint = '晚上'
      }
      if (w === '明早') {
        result.dueTime = '09:00'
        periodHint = '上午'
      }
    })
  }
  if (!result.dueDate) {
    take(new RegExp(`${NUM}天(?:后|以后|之后)`), (m) => {
      const n = cnToNumber(m[1])
      if (!(n >= 0 && n <= 365))
        return false
      result.dueDate = addDays(today, n)
    })
  }
  if (!result.dueDate) {
    take(/(下下|下个?|本|这个?)?(?:周|星期|礼拜)([一二三四五六日天])/, (m) => {
      const prefix = m[1] || ''
      const target = WEEK_CHARS[m[2]]
      let date = weekdayDate(today, target, prefix.startsWith('下'))
      if (prefix === '下下')
        date = addDays(date, 7)
      result.dueDate = date
    })
  }
  if (!result.dueDate) {
    take(/(下个?|本|这个?)?周末/, (m) => {
      result.dueDate = weekdayDate(today, 6, !!m[1]?.startsWith('下'))
    })
  }

  // 时间
  take(/(^|[^\d:])([01]?\d|2[0-3])[:：]([0-5]\d)(?!\d)/, (m) => {
    result.dueTime = `${m[2].padStart(2, '0')}:${m[3]}`
    return m[1]
  })
  take(new RegExp(`(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|今晚)?${NUM}[点时](半|${NUM}分?)?`), (m) => {
    // 「快一点」「重点」这类不是时间：中文数字必须带上午 / 下午等前缀，阿拉伯数字可以单独写
    if (!m[1] && !periodHint && !/^\d+$/.test(m[2]))
      return false
    let h = cnToNumber(m[2])
    if (!(h >= 0 && h <= 24))
      return false
    const period = m[1] || periodHint
    if (['下午', '傍晚', '晚上', '今晚'].includes(period) && h < 12)
      h += 12
    else if (period === '中午' && h < 6)
      h += 12
    // 没说上午下午时，1~6 点按下午理解（「3点开会」一般指 15:00）
    else if (!period && h >= 1 && h <= 6)
      h += 12
    let min = 0
    if (m[3] === '半')
      min = 30
    else if (m[4])
      min = cnToNumber(m[4])
    if (!(min >= 0 && min < 60))
      return false
    result.dueTime = `${String(h % 24).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  })
  // 只写了时间没写日期：算作今天
  if (result.dueTime && !result.dueDate)
    result.dueDate = today

  result.title = text.replace(/\s+/g, ' ').trim()
  return result
}
