import type { AnnivRow, AnnivSecret } from './anniversary'
import type { Env } from './lib'
import { milestones, originDate, upcomingOccurrences } from '../../src/pages-tools/anniversary/calc'
import { addDays } from '../../src/pages-tools/datecalc/date'
import { todayIn } from '../../src/pages-tools/todo/repeat'
import { decryptAnniv, ruleOf } from './anniversary'
import { requireUser } from './auth'
import { decryptJson, encryptJson, sha256Hex } from './crypto'
import { ApiError } from './lib'

/**
 * 日历订阅（iCalendar / .ics）：每个用户一个带随机令牌的订阅链接，加到手机 / 电脑自带的日历后，由系统日历按时提醒。
 * - 待办：未完成且有日期的（含共享清单），有时间的为 30 分钟的事件，没有时间的为全天事件；设置了提醒的附带 VALARM
 * - 纪念日：展开成未来 3 次的具体日期（农历日期无法用 RRULE 表示），里程碑展开未来 2 年内的
 * - 令牌只存 SHA-256 与加密副本；重新生成后旧链接立即失效
 */

/* ---------------- iCalendar 文本 ---------------- */

export function icsEscape(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** 按 RFC 5545 每行不超过 75 个字节折行（不拆开多字节字符） */
export function foldLine(line: string) {
  const bytes = (c: string) => new TextEncoder().encode(c).length
  const out: string[] = []
  let cur = ''
  let len = 0
  for (const ch of line) {
    const n = bytes(ch)
    if (len + n > (out.length ? 74 : 75)) {
      out.push(cur)
      cur = ''
      len = 0
    }
    cur += ch
    len += n
  }
  out.push(cur)
  return out.join('\r\n ')
}

const compact = (date: string) => date.replace(/-/g, '')

function utcStamp(sec: number) {
  return new Date(sec * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** VALARM：trigger 为相对事件开始的分钟数（负数为提前） */
function alarm(title: string, minutes: number) {
  const sign = minutes < 0 ? '-' : ''
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(title)}`, `TRIGGER:${sign}PT${Math.abs(minutes)}M`, 'END:VALARM']
}

export interface IcsEvent {
  uid: string
  title: string
  description?: string
  /** 全天事件的日期 */
  date?: string
  /** 有时间的事件：开始时间（UTC 秒）与时长（分钟） */
  start?: number
  duration?: number
  /** 提醒：相对开始的分钟数 */
  alarms?: number[]
}

export function buildCalendar(name: string, events: IcsEvent[], nowSec: number) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OTools//Todo & Anniversary//ZH',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(name)}`,
    'X-WR-TIMEZONE:Asia/Shanghai',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${utcStamp(nowSec)}`)
    if (e.date)
      lines.push(`DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(addDays(e.date, 1))}`, 'TRANSP:TRANSPARENT')
    else if (e.start)
      lines.push(`DTSTART:${utcStamp(e.start)}`, `DTEND:${utcStamp(e.start + (e.duration ?? 30) * 60)}`)
    lines.push(`SUMMARY:${icsEscape(e.title)}`)
    if (e.description)
      lines.push(`DESCRIPTION:${icsEscape(e.description)}`)
    for (const m of e.alarms ?? [])
      lines.push(...alarm(e.title, m))
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}

/* ---------------- 组装用户的日历 ---------------- */

interface TodoCalRow {
  id: number
  key_owner_id: number
  data: string
  due_date: string
  due_time: string | null
  remind: number | null
  tz_offset: number
}

/** 全天事件从当天 00:00 开始；提醒默认 9:00，即相对开始 +540 分钟再减去提前量 */
const DAY_REMIND_MINUTES = 9 * 60

export async function userEvents(env: Env, userId: number, nowSec: number) {
  const events: IcsEvent[] = []
  const lists = (await env.DB.prepare(
    'SELECT id FROM todo_lists WHERE owner_id = ?1 UNION SELECT list_id FROM todo_list_members WHERE user_id = ?1',
  ).bind(userId).all<{ id: number }>()).results.map(r => r.id)
  const scope = `((list_id IS NULL AND user_id = ?)${lists.length ? ` OR list_id IN (${lists.join(',')})` : ''})`
  const { results: todos } = await env.DB.prepare(
    `SELECT id, key_owner_id, data, due_date, due_time, remind, tz_offset FROM todos WHERE ${scope} AND done = 0 AND due_date IS NOT NULL ORDER BY due_date LIMIT 500`,
  ).bind(userId).all<TodoCalRow>()
  for (const t of todos) {
    const secret = await decryptJson<{ title: string, note: string }>(env.VAULT_KEY, t.key_owner_id, t.data)
    const e: IcsEvent = { uid: `todo-${t.id}@otools`, title: `☑ ${secret.title}`, description: secret.note || undefined }
    if (t.due_time) {
      const [hh, mm] = t.due_time.split(':').map(Number)
      const [y, m, d] = t.due_date.split('-').map(Number)
      e.start = Math.floor(Date.UTC(y, m - 1, d, hh, mm) / 1000) + t.tz_offset * 60
      e.duration = 30
      if (t.remind !== null)
        e.alarms = [-t.remind]
    }
    else {
      e.date = t.due_date
      if (t.remind !== null)
        e.alarms = [DAY_REMIND_MINUTES - t.remind]
    }
    events.push(e)
  }

  const { results: annivs } = await env.DB.prepare('SELECT * FROM anniversaries WHERE user_id = ?').bind(userId).all<AnnivRow>()
  for (const a of annivs) {
    const secret: AnnivSecret = await decryptAnniv(env, a)
    const rule = ruleOf(a)
    const today = todayIn(a.tz_offset, nowSec * 1000)
    let days: number[] = []
    try {
      days = JSON.parse(a.remind_days)
    }
    catch {}
    const [hh, mm] = (a.time || '09:00').split(':').map(Number)
    const remindMinutes = hh * 60 + mm
    const prefix = secret.emoji ? `${secret.emoji} ` : ''
    for (const o of upcomingOccurrences(rule, today, 3)) {
      const nth = rule.repeat && rule.date.year ? o.cycle - rule.date.year : 0
      const suffix = nth > 0 ? (a.category === 'birthday' ? `（${nth} 岁）` : `（${nth} 周年）`) : ''
      events.push({
        uid: `anniv-${a.id}-${o.date}@otools`,
        title: `${prefix}${secret.title}${suffix}`,
        description: secret.note || undefined,
        date: o.date,
        alarms: days.map(dd => remindMinutes - dd * 1440),
      })
    }
    const origin = originDate(rule.date)
    if (a.remind_milestone && origin) {
      const limit = addDays(today, 730)
      for (const m of milestones(origin, today, rule.countFromOne, 0, 6).filter(x => x.date <= limit)) {
        events.push({
          uid: `anniv-${a.id}-m${m.day}@otools`,
          title: `${prefix}${secret.title} 第 ${m.day} 天`,
          date: m.date,
          alarms: [remindMinutes],
        })
      }
    }
  }
  return events
}

/* ---------------- 接口 ---------------- */

function randomCalToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function calUrl(req: Request, token: string) {
  return `${new URL(req.url).origin}/api/cal/${token}.ics`
}

/** 本人的订阅链接（未开启为 null） */
export async function getCalendar(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const row = await env.DB.prepare('SELECT cal_token_enc FROM users WHERE id = ?').bind(user.id).first<{ cal_token_enc: string | null }>()
  if (!row?.cal_token_enc)
    return { url: null }
  const { token } = await decryptJson<{ token: string }>(env.VAULT_KEY, user.id, row.cal_token_enc)
  return { url: calUrl(req, token) }
}

/** 开启或重新生成订阅链接（旧链接立即失效） */
export async function resetCalendar(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const token = randomCalToken()
  await env.DB.prepare('UPDATE users SET cal_token_hash = ?, cal_token_enc = ? WHERE id = ?')
    .bind(await sha256Hex(token), await encryptJson(env.VAULT_KEY, user.id, { token }), user.id)
    .run()
  return { url: calUrl(req, token) }
}

export async function disableCalendar(req: Request, env: Env) {
  const user = await requireUser(req, env)
  await env.DB.prepare('UPDATE users SET cal_token_hash = NULL, cal_token_enc = NULL WHERE id = ?').bind(user.id).run()
  return null
}

/** 公开：日历应用定期拉取 */
export async function serveCalendar(_req: Request, env: Env, params: Record<string, string>) {
  const token = params.token.replace(/\.ics$/, '')
  if (!/^[\w-]{20,64}$/.test(token))
    throw new ApiError(404, '订阅链接无效')
  const user = await env.DB.prepare('SELECT id, disabled FROM users WHERE cal_token_hash = ?').bind(await sha256Hex(token)).first<{ id: number, disabled: number }>()
  if (!user || user.disabled)
    return new Response('订阅链接无效或已重新生成', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  const nowSec = Math.floor(Date.now() / 1000)
  const body = buildCalendar('OTools 待办与纪念日', await userEvents(env, user.id, nowSec), nowSec)
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="otools.ics"',
      'Cache-Control': 'private, max-age=300',
      'X-Robots-Tag': 'noindex',
    },
  })
}
