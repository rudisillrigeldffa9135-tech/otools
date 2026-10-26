import type { AnnivRule } from '../../src/pages-tools/anniversary/calc'
import type { Env } from './lib'
import { nextRemind, normalizeDate } from '../../src/pages-tools/anniversary/calc'
import { requireUser } from './auth'
import { decryptJson, encryptJson } from './crypto'
import { ApiError, now, readJson } from './lib'

/**
 * 纪念日：标题、备注、表情加密存储；日期规则明文保存，服务端据此计算下一次提醒（见定时任务）与日历订阅。
 */

export interface AnnivRow {
  id: number
  user_id: number
  data: string
  category: string
  color: string
  calendar: 'solar' | 'lunar' | 'weekday'
  year: number | null
  month: number
  day: number
  leap: number
  nth: number | null
  weekday: number | null
  repeat: number
  count_from_one: number
  leap_rule: string
  feb29_rule: string
  time: string | null
  pinned: number
  remind_days: string
  remind_milestone: number
  next_remind_at: number
  tz_offset: number
  share_code: string | null
  share_password: string | null
  share_expires_at: number
  bg_key: string | null
  sort: number
  created_at: number
  updated_at: number
}

export interface AnnivSecret {
  title: string
  note: string
  emoji: string
}

export const MAX_ANNIVERSARIES_PER_USER = 500
export const CATEGORIES = ['birthday', 'love', 'festival', 'work', 'study', 'life', 'other']
const COLORS = ['', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink', 'gray']
const REMIND_DAYS = [0, 1, 2, 3, 7, 15, 30]

function parseId(value: unknown) {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0)
    throw new ApiError(400, '无效的纪念日 ID')
  return n
}

export async function decryptAnniv(env: Env, row: Pick<AnnivRow, 'user_id' | 'data'>) {
  try {
    return await decryptJson<AnnivSecret>(env.VAULT_KEY, row.user_id, row.data)
  }
  catch (e) {
    console.error(e)
    throw new ApiError(500, '解密失败，VAULT_KEY 可能被更换过')
  }
}

export function ruleOf(row: AnnivRow): AnnivRule {
  return {
    date: {
      calendar: row.calendar,
      year: row.year,
      month: row.month,
      day: row.day,
      leap: !!row.leap,
      nth: row.nth ?? undefined,
      weekday: row.weekday ?? undefined,
    },
    repeat: !!row.repeat,
    countFromOne: !!row.count_from_one,
    leapRule: row.leap_rule === 'leapOnly' ? 'leapOnly' : 'normal',
    feb29Rule: row.feb29_rule === 'mar1' ? 'mar1' : 'feb28',
  }
}

/** 根据当前规则重新计算下一次提醒时间 */
export function computeNextRemind(row: AnnivRow, nowMs = Date.now()) {
  let days: number[] = []
  try {
    days = JSON.parse(row.remind_days)
  }
  catch {}
  return nextRemind(ruleOf(row), days, !!row.remind_milestone, row.time, row.tz_offset, nowMs)
}

export async function toAnniv(env: Env, row: AnnivRow) {
  const secret = await decryptAnniv(env, row)
  const rule = ruleOf(row)
  let remindDays: number[] = []
  try {
    remindDays = JSON.parse(row.remind_days)
  }
  catch {}
  return {
    id: row.id,
    title: secret.title,
    note: secret.note,
    emoji: secret.emoji,
    category: row.category,
    color: row.color,
    date: rule.date,
    repeat: rule.repeat,
    countFromOne: rule.countFromOne,
    leapRule: rule.leapRule,
    feb29Rule: rule.feb29Rule,
    time: row.time,
    pinned: !!row.pinned,
    remindDays,
    remindMilestone: !!row.remind_milestone,
    nextRemindAt: row.next_remind_at || null,
    shareCode: row.share_code && (!row.share_expires_at || row.share_expires_at > now()) ? row.share_code : null,
    shareExpiresAt: row.share_expires_at,
    shareLocked: !!row.share_password,
    hasBackground: !!row.bg_key,
    sort: row.sort,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/* ---------------- 字段校验 ---------------- */

function parseTitle(value: unknown) {
  const title = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  if (!title)
    throw new ApiError(400, '请填写名称')
  if (title.length > 50)
    throw new ApiError(400, '名称最多 50 个字')
  return title
}

function parseNote(value: unknown) {
  if (value === undefined || value === null)
    return ''
  if (typeof value !== 'string' || value.length > 1000)
    throw new ApiError(400, '备注最多 1000 个字')
  return value
}

function parseEmoji(value: unknown) {
  if (typeof value !== 'string')
    return ''
  return Array.from(value.trim()).slice(0, 2).join('')
}

function parseTime(value: unknown) {
  if (value === undefined || value === null || value === '')
    return null
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw new ApiError(400, '时间格式不正确')
  return value
}

function parseRemindDays(value: unknown) {
  if (!Array.isArray(value))
    return []
  return [...new Set(value.map(Number).filter(n => REMIND_DAYS.includes(n)))].sort((a, b) => a - b)
}

function parseTz(value: unknown) {
  const n = Number(value)
  return Number.isInteger(n) && n >= -14 * 60 && n <= 14 * 60 ? n : -480
}

/** 把请求体合并到已有行（新建时 base 为默认值） */
function mergeRow(base: Partial<AnnivRow>, body: Record<string, unknown>): Partial<AnnivRow> {
  const row: Partial<AnnivRow> = { ...base }
  if (body.date !== undefined) {
    const date = normalizeDate(body.date)
    if (!date)
      throw new ApiError(400, '日期不正确')
    Object.assign(row, {
      calendar: date.calendar,
      year: date.year,
      month: date.month,
      day: date.day,
      leap: date.leap ? 1 : 0,
      nth: date.nth ?? null,
      weekday: date.weekday ?? null,
    })
  }
  if (body.category !== undefined)
    row.category = CATEGORIES.includes(body.category as string) ? body.category as string : 'other'
  if (body.color !== undefined)
    row.color = COLORS.includes(body.color as string) ? body.color as string : ''
  if (body.repeat !== undefined)
    row.repeat = body.repeat === false ? 0 : 1
  if (body.countFromOne !== undefined)
    row.count_from_one = body.countFromOne === false ? 0 : 1
  if (body.leapRule !== undefined)
    row.leap_rule = body.leapRule === 'leapOnly' ? 'leapOnly' : 'normal'
  if (body.feb29Rule !== undefined)
    row.feb29_rule = body.feb29Rule === 'mar1' ? 'mar1' : 'feb28'
  if (body.time !== undefined)
    row.time = parseTime(body.time)
  if (body.pinned !== undefined)
    row.pinned = body.pinned === true ? 1 : 0
  if (body.remindDays !== undefined)
    row.remind_days = JSON.stringify(parseRemindDays(body.remindDays))
  if (body.remindMilestone !== undefined)
    row.remind_milestone = body.remindMilestone === true ? 1 : 0
  if (body.tzOffset !== undefined)
    row.tz_offset = parseTz(body.tzOffset)
  if (typeof body.sort === 'number' && Number.isFinite(body.sort))
    row.sort = body.sort
  // 没有起始年份时不能「只算一次」（不知道是哪一年）
  if (!row.year)
    row.repeat = 1
  return row
}

async function getRow(env: Env, userId: number, id: number) {
  const row = await env.DB.prepare('SELECT * FROM anniversaries WHERE id = ? AND user_id = ?').bind(id, userId).first<AnnivRow>()
  if (!row)
    throw new ApiError(404, '纪念日不存在或已删除')
  return row
}

/* ---------------- 接口 ---------------- */

export async function listAnniversaries(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const { results } = await env.DB.prepare('SELECT * FROM anniversaries WHERE user_id = ? ORDER BY pinned DESC, sort ASC, id ASC').bind(user.id).all<AnnivRow>()
  return Promise.all(results.map(r => toAnniv(env, r)))
}

const COLUMNS = ['category', 'color', 'calendar', 'year', 'month', 'day', 'leap', 'nth', 'weekday', 'repeat', 'count_from_one', 'leap_rule', 'feb29_rule', 'time', 'pinned', 'remind_days', 'remind_milestone', 'next_remind_at', 'tz_offset', 'sort'] as const

export async function createAnniversary(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const body = await readJson(req)
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM anniversaries WHERE user_id = ?').bind(user.id).first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_ANNIVERSARIES_PER_USER)
    throw new ApiError(400, `最多保存 ${MAX_ANNIVERSARIES_PER_USER} 个纪念日`)
  if (body.date === undefined)
    throw new ApiError(400, '请选择日期')
  const t = now()
  const row = mergeRow({
    category: 'other',
    color: '',
    repeat: 1,
    count_from_one: 1,
    leap_rule: 'normal',
    feb29_rule: 'feb28',
    time: null,
    pinned: 0,
    remind_days: '[]',
    remind_milestone: 0,
    tz_offset: -480,
    sort: t,
  }, body) as AnnivRow
  row.next_remind_at = computeNextRemind(row)?.at ?? 0
  const secret: AnnivSecret = { title: parseTitle(body.title), note: parseNote(body.note), emoji: parseEmoji(body.emoji) }
  const data = await encryptJson(env.VAULT_KEY, user.id, secret)
  const inserted = await env.DB.prepare(
    `INSERT INTO anniversaries (user_id, data, ${COLUMNS.join(', ')}, created_at, updated_at)
     VALUES (?, ?, ${COLUMNS.map(() => '?').join(', ')}, ?, ?) RETURNING *`,
  ).bind(user.id, data, ...COLUMNS.map(c => row[c] ?? null), t, t).first<AnnivRow>()
  return toAnniv(env, inserted!)
}

export async function updateAnniversary(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id)
  const old = await getRow(env, user.id, id)
  const body = await readJson(req)
  const row = mergeRow(old, body) as AnnivRow
  row.next_remind_at = computeNextRemind(row)?.at ?? 0
  const secret = await decryptAnniv(env, old)
  if (body.title !== undefined)
    secret.title = parseTitle(body.title)
  if (body.note !== undefined)
    secret.note = parseNote(body.note)
  if (body.emoji !== undefined)
    secret.emoji = parseEmoji(body.emoji)
  const updated = await env.DB.prepare(
    `UPDATE anniversaries SET data = ?, ${COLUMNS.map(c => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND user_id = ? RETURNING *`,
  ).bind(await encryptJson(env.VAULT_KEY, user.id, secret), ...COLUMNS.map(c => row[c] ?? null), now(), id, user.id).first<AnnivRow>()
  return toAnniv(env, updated!)
}

export async function deleteAnniversary(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const row = await getRow(env, user.id, parseId(params.id))
  if (row.bg_key)
    await env.FILES?.delete(row.bg_key).catch(() => {})
  await env.DB.prepare('DELETE FROM anniversaries WHERE id = ?').bind(row.id).run()
  return null
}

/** 删除用户时清理（含背景图） */
export async function deleteUserAnniversaries(env: Env, userId: number) {
  const { results } = await env.DB.prepare('SELECT bg_key FROM anniversaries WHERE user_id = ? AND bg_key IS NOT NULL').bind(userId).all<{ bg_key: string }>()
  if (results.length)
    await env.FILES?.delete(results.map(r => r.bg_key)).catch(() => {})
  await env.DB.prepare('DELETE FROM anniversaries WHERE user_id = ?').bind(userId).run()
}
