/**
 * Cron 表达式解析：支持 Linux crontab（5 位）、Spring（6 位，秒开头）、Quartz（6~7 位，周 1=周日）。
 * 纯函数实现，可计算接下来的执行时间并生成中文说明。
 */

export type CronDialect = 'linux' | 'spring' | 'quartz'

export const DIALECTS: { value: CronDialect, label: string, desc: string }[] = [
  { value: 'linux', label: 'Linux', desc: '分 时 日 月 周（crontab）' },
  { value: 'spring', label: 'Spring', desc: '秒 分 时 日 月 周（周 0/7=周日）' },
  { value: 'quartz', label: 'Quartz', desc: '秒 分 时 日 月 周 [年]（周 1=周日）' },
]

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const DOW_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
export const WEEKDAY_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
}

/** 根据位数推断方言：5 位为 Linux，7 位为 Quartz，6 位含 ? 视为 Quartz，否则 Spring */
export function detectDialect(expr: string): CronDialect {
  const t = expr.trim()
  if (t.startsWith('@'))
    return 'linux'
  const n = t.split(/\s+/).filter(Boolean).length
  if (n <= 5)
    return 'linux'
  if (n >= 7)
    return 'quartz'
  return t.includes('?') ? 'quartz' : 'spring'
}

interface FieldDef {
  key: 'second' | 'minute' | 'hour' | 'dom' | 'month' | 'dow' | 'year'
  label: string
  min: number
  max: number
  names?: string[]
  /** 名称对应的起始数值 */
  nameBase?: number
}

function fieldDefs(dialect: CronDialect): FieldDef[] {
  const dow: FieldDef = dialect === 'quartz'
    ? { key: 'dow', label: '周', min: 1, max: 7, names: DOW_NAMES, nameBase: 1 }
    : { key: 'dow', label: '周', min: 0, max: 7, names: DOW_NAMES, nameBase: 0 }
  const base: FieldDef[] = [
    { key: 'minute', label: '分', min: 0, max: 59 },
    { key: 'hour', label: '时', min: 0, max: 23 },
    { key: 'dom', label: '日', min: 1, max: 31 },
    { key: 'month', label: '月', min: 1, max: 12, names: MONTH_NAMES, nameBase: 1 },
    dow,
  ]
  if (dialect === 'linux')
    return base
  const withSecond: FieldDef[] = [{ key: 'second', label: '秒', min: 0, max: 59 }, ...base]
  if (dialect === 'quartz')
    withSecond.push({ key: 'year', label: '年', min: 1970, max: 2099 })
  return withSecond
}

/** 把 MON、jan 等名称换成数字 */
function toNumber(token: string, def: FieldDef) {
  if (/^\d+$/.test(token))
    return Number(token)
  const idx = def.names?.indexOf(token.toUpperCase()) ?? -1
  if (idx < 0)
    throw new Error(`「${def.label}」字段无法识别：${token}`)
  return idx + (def.nameBase ?? 0)
}

function checkRange(v: number, def: FieldDef) {
  if (v < def.min || v > def.max)
    throw new Error(`「${def.label}」取值超出范围 ${def.min}-${def.max}：${v}`)
}

/** 解析逗号分隔的普通字段（* , - /），返回取值集合 */
function parseSet(expr: string, def: FieldDef): Set<number> {
  const out = new Set<number>()
  for (const part of expr.split(',')) {
    if (!part)
      throw new Error(`「${def.label}」字段有多余的逗号`)
    const [rangePart, stepPart, extra] = part.split('/')
    if (extra !== undefined)
      throw new Error(`「${def.label}」字段格式不正确：${part}`)
    let step = 1
    if (stepPart !== undefined) {
      if (!/^\d+$/.test(stepPart) || Number(stepPart) === 0)
        throw new Error(`「${def.label}」的步长必须是正整数：${part}`)
      step = Number(stepPart)
    }
    let from: number
    let to: number
    if (rangePart === '*' || rangePart === '?') {
      from = def.min
      to = def.max
    }
    else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-')
      from = toNumber(a, def)
      to = toNumber(b, def)
    }
    else {
      from = toNumber(rangePart, def)
      // 5/15 表示从 5 开始每 15 个单位
      to = stepPart !== undefined ? def.max : from
    }
    checkRange(from, def)
    checkRange(to, def)
    if (from <= to) {
      for (let v = from; v <= to; v += step)
        out.add(v)
    }
    else {
      // 跨越边界的区间，如 FRI-MON、22-2
      const span = def.max - def.min + 1
      for (let k = 0; k <= to - from + span; k += step)
        out.add(((from - def.min + k) % span) + def.min)
    }
  }
  return out
}

type DayMatcher = (y: number, m: number, d: number) => boolean

function daysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate()
}

function weekdayOf(y: number, m: number, d: number) {
  return new Date(y, m - 1, d).getDay()
}

/** 离指定日期最近的工作日（不跨月），用于 15W */
function nearestWeekday(y: number, m: number, day: number) {
  const last = daysInMonth(y, m)
  const d = Math.min(day, last)
  const w = weekdayOf(y, m, d)
  if (w === 6)
    return d === 1 ? 3 : d - 1
  if (w === 0)
    return d === last ? d - 2 : d + 1
  return d
}

function parseDom(expr: string, def: FieldDef, allowSpecial: boolean): DayMatcher {
  if (expr === '*' || expr === '?')
    return () => true
  if (/[LW]/i.test(expr) && !allowSpecial)
    throw new Error('Linux crontab 不支持 L、W 写法')
  const matchers: DayMatcher[] = []
  for (const part of expr.toUpperCase().split(',')) {
    const lastOffset = part.match(/^L-(\d{1,2})$/)
    const nearest = part.match(/^(\d{1,2})W$/)
    if (part === 'L') {
      matchers.push((y, mo, d) => d === daysInMonth(y, mo))
    }
    else if (part === 'LW') {
      matchers.push((y, mo, d) => d === nearestWeekday(y, mo, daysInMonth(y, mo)))
    }
    else if (lastOffset) {
      const off = Number(lastOffset[1])
      matchers.push((y, mo, d) => d === daysInMonth(y, mo) - off)
    }
    else if (nearest) {
      const day = Number(nearest[1])
      checkRange(day, def)
      matchers.push((y, mo, d) => d === nearestWeekday(y, mo, day))
    }
    else {
      const set = parseSet(part, def)
      matchers.push((_y, _m, d) => set.has(d))
    }
  }
  return (y, mo, d) => matchers.some(fn => fn(y, mo, d))
}

function parseDow(expr: string, def: FieldDef, dialect: CronDialect): DayMatcher {
  if (expr === '*' || expr === '?')
    return () => true
  if (/[L#]/i.test(expr) && dialect === 'linux')
    throw new Error('Linux crontab 不支持 L、# 写法')
  /** 把方言里的周取值换成 0=周日 … 6=周六 */
  const norm = (v: number) => (dialect === 'quartz' ? v - 1 : v % 7)
  const matchers: DayMatcher[] = []
  for (const part of expr.toUpperCase().split(',')) {
    const last = part.match(/^(\w+)L$/)
    const nthOf = part.match(/^(\w+)#([1-5])$/)
    if (part === 'L') {
      // 单独的 L 表示一周的最后一天（周六）
      matchers.push((y, mo, d) => weekdayOf(y, mo, d) === 6)
    }
    else if (last) {
      const w = norm(toNumber(last[1], def))
      matchers.push((y, mo, d) => weekdayOf(y, mo, d) === w && d + 7 > daysInMonth(y, mo))
    }
    else if (nthOf) {
      const w = norm(toNumber(nthOf[1], def))
      const nth = Number(nthOf[2])
      matchers.push((y, mo, d) => weekdayOf(y, mo, d) === w && Math.ceil(d / 7) === nth)
    }
    else {
      const set = new Set([...parseSet(part, def)].map(norm))
      matchers.push((y, mo, d) => set.has(weekdayOf(y, mo, d)))
    }
  }
  return (y, mo, d) => matchers.some(fn => fn(y, mo, d))
}

export interface CronField {
  key: FieldDef['key']
  label: string
  raw: string
  /** 该字段的中文含义 */
  text: string
}

export interface ParsedCron {
  dialect: CronDialect
  /** 展开宏之后的表达式 */
  expression: string
  fields: CronField[]
  seconds: number[]
  minutes: number[]
  hours: number[]
  months: Set<number>
  years: Set<number> | null
  dayMatches: DayMatcher
  description: string
}

/**
 * 解析表达式
 * @throws 格式错误时抛出带中文说明的错误
 */
export function parseCron(input: string, dialect: CronDialect): ParsedCron {
  let expr = input.trim().replace(/\s+/g, ' ')
  if (!expr)
    throw new Error('请输入 Cron 表达式')
  if (expr.startsWith('@')) {
    const macro = MACROS[expr.toLowerCase()]
    if (!macro)
      throw new Error(expr === '@reboot' ? '@reboot 表示开机时执行一次，没有固定的执行时间' : `不认识的写法：${expr}`)
    expr = presetFor(macro, dialect)
  }
  const defs = fieldDefs(dialect)
  const parts = expr.split(' ')
  const optionalYear = dialect === 'quartz' && parts.length === 6
  if (parts.length !== defs.length && !optionalYear) {
    const need = dialect === 'quartz' ? '6 或 7' : String(defs.length)
    throw new Error(`${DIALECTS.find(d => d.value === dialect)!.label} 表达式需要 ${need} 个字段（${defs.map(d => d.label).join(' ')}），当前是 ${parts.length} 个`)
  }
  const raw = Object.fromEntries(defs.map((d, i) => [d.key, parts[i] ?? '*'])) as Record<FieldDef['key'], string>
  const def = Object.fromEntries(defs.map(d => [d.key, d])) as Record<FieldDef['key'], FieldDef>

  for (const d of defs) {
    if (raw[d.key].includes('?') && d.key !== 'dom' && d.key !== 'dow')
      throw new Error(`只有「日」和「周」字段可以使用 ?`)
  }
  if (dialect === 'linux' && (raw.dom === '?' || raw.dow === '?'))
    throw new Error('Linux crontab 不支持 ?，请使用 *')
  if (dialect === 'quartz') {
    const domQ = raw.dom === '?'
    const dowQ = raw.dow === '?'
    if (domQ === dowQ)
      throw new Error('Quartz 要求「日」和「周」中有且只有一个写成 ?')
  }

  const domFn = parseDom(raw.dom, def.dom, dialect !== 'linux')
  const dowFn = parseDow(raw.dow, def.dow, dialect)
  // Linux：日与周都被限定时满足其一即可；以 * 开头视为不限定（与 Vixie cron 一致）
  const domAny = raw.dom.startsWith('*') || raw.dom === '?'
  const dowAny = raw.dow.startsWith('*') || raw.dow === '?'
  const dayMatches: DayMatcher = dialect === 'linux' && !domAny && !dowAny
    ? (y, m, d) => domFn(y, m, d) || dowFn(y, m, d)
    : (y, m, d) => domFn(y, m, d) && dowFn(y, m, d)

  const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b)
  const parsed: ParsedCron = {
    dialect,
    expression: parts.join(' '),
    fields: defs.filter(d => parts[defs.indexOf(d)] !== undefined).map(d => ({ key: d.key, label: d.label, raw: raw[d.key], text: describeField(d, raw[d.key], dialect) })),
    seconds: def.second ? sorted(parseSet(raw.second, def.second)) : [0],
    minutes: sorted(parseSet(raw.minute, def.minute)),
    hours: sorted(parseSet(raw.hour, def.hour)),
    months: parseSet(raw.month, def.month),
    years: def.year && raw.year !== '*' && parts[6] !== undefined ? parseSet(raw.year, def.year) : null,
    dayMatches,
    description: '',
  }
  parsed.description = describe(raw, dialect, domAny, dowAny)
  return parsed
}

/** 有序数组中第一个 >= v 的值 */
function ceilOf(list: number[], v: number) {
  for (const x of list) {
    if (x >= v)
      return x
  }
  return undefined
}

/**
 * 计算接下来的执行时间（本地时区）
 * @param from 从该时刻之后开始（不含）
 */
export function nextRuns(cron: ParsedCron, count: number, from = new Date()): Date[] {
  const out: Date[] = []
  const t = new Date(from.getTime())
  t.setMilliseconds(0)
  t.setSeconds(t.getSeconds() + 1)
  const maxYear = from.getFullYear() + 100
  let guard = 0
  while (out.length < count && guard++ < 100000) {
    const y = t.getFullYear()
    if (y > maxYear)
      break
    if (cron.years && !cron.years.has(y)) {
      const next = [...cron.years].filter(v => v > y).sort((a, b) => a - b)[0]
      if (next === undefined)
        break
      t.setFullYear(next, 0, 1)
      t.setHours(0, 0, 0, 0)
      continue
    }
    const mo = t.getMonth() + 1
    if (!cron.months.has(mo)) {
      t.setMonth(mo, 1)
      t.setHours(0, 0, 0, 0)
      continue
    }
    if (!cron.dayMatches(y, mo, t.getDate())) {
      t.setDate(t.getDate() + 1)
      t.setHours(0, 0, 0, 0)
      continue
    }
    const h = ceilOf(cron.hours, t.getHours())
    if (h === undefined) {
      t.setDate(t.getDate() + 1)
      t.setHours(0, 0, 0, 0)
      continue
    }
    if (h !== t.getHours()) {
      t.setHours(h, 0, 0, 0)
      // 夏令时跳过的小时会被 Date 自动顺延，此时重新判断
      continue
    }
    const mi = ceilOf(cron.minutes, t.getMinutes())
    if (mi === undefined) {
      t.setHours(t.getHours() + 1, 0, 0, 0)
      continue
    }
    if (mi !== t.getMinutes()) {
      t.setMinutes(mi, 0, 0)
      continue
    }
    const s = ceilOf(cron.seconds, t.getSeconds())
    if (s === undefined) {
      t.setMinutes(t.getMinutes() + 1, 0, 0)
      continue
    }
    if (s !== t.getSeconds()) {
      t.setSeconds(s, 0)
      continue
    }
    out.push(new Date(t.getTime()))
    t.setSeconds(t.getSeconds() + 1)
  }
  return out
}

/* ---------------- 中文说明 ---------------- */

const pad = (n: number) => String(n).padStart(2, '0')

function dowName(v: string, dialect: CronDialect) {
  const n = /^\d+$/.test(v) ? Number(v) : DOW_NAMES.indexOf(v.toUpperCase()) + (dialect === 'quartz' ? 1 : 0)
  return WEEKDAY_ZH[dialect === 'quartz' ? (n + 6) % 7 : n % 7] ?? v
}

function monthName(v: string) {
  const n = /^\d+$/.test(v) ? Number(v) : MONTH_NAMES.indexOf(v.toUpperCase()) + 1
  return `${n} 月`
}

/** 单个字段的中文含义 */
function describeField(def: FieldDef, raw: string, dialect: CronDialect): string {
  if (raw === '*' || raw === '?')
    return raw === '?' ? '不指定' : `每${def.key === 'dom' ? '天' : def.key === 'dow' ? '天' : def.label === '时' ? '小时' : def.label === '分' ? '分钟' : def.label}`
  const unit = { second: '秒', minute: '分', hour: '点', dom: '号', month: '', year: '年', dow: '' }[def.key]
  const name = (v: string) => (def.key === 'dow' ? dowName(v, dialect) : def.key === 'month' ? monthName(v) : `${v}${unit && ` ${unit}`}`)
  return raw.toUpperCase().split(',').map((part) => {
    if (def.key === 'dom') {
      const lastOffset = part.match(/^L-(\d+)$/)
      const nearest = part.match(/^(\d+)W$/)
      if (part === 'L')
        return '每月最后一天'
      if (part === 'LW')
        return '每月最后一个工作日'
      if (lastOffset)
        return `每月倒数第 ${Number(lastOffset[1]) + 1} 天`
      if (nearest)
        return `离 ${nearest[1]} 号最近的工作日`
    }
    if (def.key === 'dow') {
      const last = part.match(/^(\w+)L$/)
      const nthOf = part.match(/^(\w+)#(\d)$/)
      if (part === 'L')
        return '周六'
      if (last)
        return `每月最后一个${dowName(last[1], dialect)}`
      if (nthOf)
        return `每月第 ${nthOf[2]} 个${dowName(nthOf[1], dialect)}`
    }
    const [range, step] = part.split('/')
    const unitName = { second: '秒', minute: '分钟', hour: '小时', dom: '天', month: '个月', year: '年', dow: '天' }[def.key]
    if (step !== undefined) {
      if (range === '*' || range === '?')
        return `每 ${step} ${unitName}`
      if (range.includes('-')) {
        const [a, b] = range.split('-')
        return `${name(a)} 至 ${name(b)} 之间每 ${step} ${unitName}`
      }
      return `从 ${name(range)} 起每 ${step} ${unitName}`
    }
    if (range.includes('-')) {
      const [a, b] = range.split('-')
      return `${name(a)} 至 ${name(b)}`
    }
    return name(range)
  }).join('、')
}

const isPlain = (s: string) => /^\d+$/.test(s)
const isPlainList = (s: string) => /^\d+(?:,\d+)*$/.test(s)

function describe(raw: Record<string, string>, dialect: CronDialect, domAny: boolean, dowAny: boolean) {
  const defs = Object.fromEntries(fieldDefs(dialect).map(d => [d.key, d])) as Record<FieldDef['key'], FieldDef>
  const sec = raw.second ?? '0'
  // ---- 日期部分 ----
  const dateParts: string[] = []
  if (raw.year && raw.year !== '*')
    dateParts.push(describeField(defs.year, raw.year, dialect))
  if (raw.month !== '*')
    dateParts.push(`每年 ${describeField(defs.month, raw.month, dialect)}`)
  const every = (t: string, prefix: string) => (t.includes('每') ? t : `${prefix}${t}`)
  const domText = raw.dom === '*' || raw.dom === '?' ? '' : every(describeField(defs.dom, raw.dom, dialect), '每月 ')
  const dowText = raw.dow === '*' || raw.dow === '?' ? '' : every(describeField(defs.dow, raw.dow, dialect), '每')
  if (domText && dowText)
    dateParts.push(dialect === 'linux' && !domAny && !dowAny ? `${domText} 或 ${dowText}` : `${domText}且为${dowText.replace(/^每/, '')}`)
  else if (domText || dowText)
    dateParts.push(domText || dowText)
  else
    dateParts.push('每天')

  // ---- 时间部分 ----
  let timeText: string
  if (isPlain(sec) && isPlain(raw.minute) && isPlainList(raw.hour)) {
    const hours = raw.hour.split(',')
    timeText = hours.map(h => `${pad(Number(h))}:${pad(Number(raw.minute))}${Number(sec) ? `:${pad(Number(sec))}` : ''}`).join('、')
  }
  else {
    const t: string[] = []
    if (raw.hour !== '*')
      t.push(describeField(defs.hour, raw.hour, dialect))
    if (raw.minute === '*')
      t.push('每分钟')
    else if (isPlain(raw.minute) && raw.hour === '*')
      t.push(Number(raw.minute) === 0 ? '每小时整点' : `每小时的第 ${Number(raw.minute)} 分`)
    else if (raw.minute.startsWith('*/') || raw.minute.includes('/'))
      t.push(describeField(defs.minute, raw.minute, dialect))
    else
      t.push(`第 ${describeField(defs.minute, raw.minute, dialect).replace(/ 分/g, '')} 分`)
    if (raw.second !== undefined && sec !== '0') {
      if (sec === '*')
        t.push('每秒')
      else if (sec.includes('/'))
        t.push(describeField(defs.second, sec, dialect))
      else
        t.push(`第 ${describeField(defs.second, sec, dialect).replace(/ 秒/g, '')} 秒`)
    }
    timeText = t.join('，')
  }
  const date = dateParts.filter(Boolean).join('，')
  return `${date ? `${date}，` : ''}${timeText} 执行`
}

/** 常用表达式（按 Linux 5 位写法，其他方言在页面里自动补秒） */
export const PRESETS: { label: string, expr: string }[] = [
  { label: '每分钟', expr: '* * * * *' },
  { label: '每 5 分钟', expr: '*/5 * * * *' },
  { label: '每小时整点', expr: '0 * * * *' },
  { label: '每天 0 点', expr: '0 0 * * *' },
  { label: '每天 8:30', expr: '30 8 * * *' },
  { label: '工作日 9 点', expr: '0 9 * * 1-5' },
  { label: '每周一 10 点', expr: '0 10 * * 1' },
  { label: '每月 1 号', expr: '0 0 1 * *' },
  { label: '每季度首日', expr: '0 0 1 1,4,7,10 *' },
  { label: '9-18 点每半小时', expr: '0,30 9-18 * * *' },
]

/** 改写「周」字段里的数字；# 后的序号与 / 后的步长不是星期，保持不变 */
function mapDowNumbers(dow: string, fn: (n: number) => number) {
  return dow.replace(/(^|[^#/\d])(\d+)/g, (_, pre: string, n: string) => `${pre}${fn(Number(n))}`)
}

/**
 * 在方言之间转换表达式（秒、年在 Linux 中会丢弃）
 * Quartz 无法表达「日或周」，日和周同时指定时只保留周
 */
export function convertDialect(expr: string, from: CronDialect, to: CronDialect) {
  const parts = expr.trim().split(/\s+/)
  if (from === to || parts.length < (from === 'linux' ? 5 : 6) || expr.trim().startsWith('@'))
    return expr
  const second = from === 'linux' ? '0' : parts[0]
  let [mi, h, dom, mo, dow] = from === 'linux' ? parts : parts.slice(1, 6)
  // 先统一成 Linux 写法：周 0=周日，不用 ?
  if (from === 'quartz')
    dow = mapDowNumbers(dow, n => n - 1)
  if (dom === '?')
    dom = '*'
  if (dow === '?')
    dow = '*'
  if (to === 'linux')
    return [mi, h, dom, mo, dow].join(' ')
  if (to === 'spring')
    return [second, mi, h, dom, mo, dow].join(' ')
  const qDow = dow === '*' ? '?' : mapDowNumbers(dow, n => (n % 7) + 1)
  return [second, mi, h, dow === '*' ? dom : '?', mo, qDow].join(' ')
}

/** 把 5 位写法转成指定方言 */
export function presetFor(expr: string, dialect: CronDialect) {
  return convertDialect(expr, 'linux', dialect)
}
