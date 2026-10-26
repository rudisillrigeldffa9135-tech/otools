import type { AnnivRule } from '../../src/pages-tools/anniversary/calc'
import type { Env } from './lib'
import { nextRemind, normalizeDate } from '../../src/pages-tools/anniversary/calc'
import { requireUser } from './auth'
import { decryptJson, encryptJson } from './crypto'
import { ApiError, now, readJson } from './lib'
import { parseSharePassword, randomShareCode, safeEqual, SHARE_LIMIT, SHARE_TTLS, SHARE_WINDOW } from './notes'
import { assertNotLimited, clientKey, recordFailure } from './ratelimit'

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
    background: row.bg_key ? bgUrl(row.bg_key) : null,
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

/* ---------------- 只读分享 ---------------- */

/** 作者本人可见的分享密码（明文） */
async function sharePasswordOf(env: Env, row: AnnivRow) {
  return row.share_password ? (await decryptJson<{ p: string }>(env.VAULT_KEY, row.user_id, row.share_password)).p : null
}

async function shareMeta(env: Env, row: AnnivRow) {
  const a = await toAnniv(env, row)
  return { id: a.id, shareCode: a.shareCode, shareExpiresAt: a.shareExpiresAt, shareLocked: a.shareLocked, sharePassword: await sharePasswordOf(env, row) }
}

/** 本人的分享设置（含密码明文） */
export async function getShare(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  return shareMeta(env, await getRow(env, user.id, parseId(params.id)))
}

/** 开启或修改分享：已有链接时保留，只改有效期 / 密码；renew 为 true 时换新链接 */
export async function shareAnniversary(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const row = await getRow(env, user.id, parseId(params.id))
  const body = await readJson(req)
  const ttl = Number(body.expiresIn ?? 0)
  if (!SHARE_TTLS.includes(ttl))
    throw new ApiError(400, '有效期不正确')
  const password = parseSharePassword(body.password)
  const active = !!row.share_code && (!row.share_expires_at || row.share_expires_at > now())
  const code = !active || body.renew === true ? randomShareCode() : row.share_code!
  const stored = password === undefined ? row.share_password : password ? await encryptJson(env.VAULT_KEY, user.id, { p: password }) : null
  const updated = await env.DB.prepare('UPDATE anniversaries SET share_code = ?, share_expires_at = ?, share_password = ? WHERE id = ? AND user_id = ? RETURNING *')
    .bind(code, ttl ? now() + ttl : 0, stored, row.id, user.id)
    .first<AnnivRow>()
  return shareMeta(env, updated!)
}

export async function unshareAnniversary(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const row = await getRow(env, user.id, parseId(params.id))
  const updated = await env.DB.prepare('UPDATE anniversaries SET share_code = NULL, share_expires_at = 0, share_password = NULL WHERE id = ? RETURNING *').bind(row.id).first<AnnivRow>()
  return shareMeta(env, updated!)
}

/**
 * 公开查看：凭分享码（设了密码时请求头 X-Share-Password）；不返回备注。
 * 无效分享码与错误密码按 IP 限流。
 */
export async function getSharedAnniversary(req: Request, env: Env, params: Record<string, string>) {
  const limitKey = `anniv-share:ip:${clientKey(req.headers.get('CF-Connecting-IP') || '')}`
  await assertNotLimited(env, limitKey, SHARE_LIMIT)
  const code = params.code
  const row = /^[A-Z0-9]{6,32}$/i.test(code)
    ? await env.DB.prepare('SELECT * FROM anniversaries WHERE share_code = ?').bind(code).first<AnnivRow>()
    : null
  if (!row || (row.share_expires_at && row.share_expires_at <= now())) {
    await recordFailure(env, limitKey, SHARE_WINDOW)
    throw new ApiError(404, '分享不存在、已取消或已过期')
  }
  if (row.share_password) {
    let given = req.headers.get('X-Share-Password') || ''
    try {
      given = decodeURIComponent(given)
    }
    catch {}
    if (!given)
      throw new ApiError(403, '这条分享需要访问密码')
    if (!safeEqual(given, (await sharePasswordOf(env, row))!)) {
      await recordFailure(env, limitKey, SHARE_WINDOW)
      throw new ApiError(403, '访问密码错误')
    }
  }
  const a = await toAnniv(env, row)
  return {
    title: a.title,
    emoji: a.emoji,
    category: a.category,
    color: a.color,
    date: a.date,
    repeat: a.repeat,
    countFromOne: a.countFromOne,
    leapRule: a.leapRule,
    feb29Rule: a.feb29Rule,
    time: a.time,
    background: row.bg_key ? bgUrl(row.bg_key) : null,
    shareExpiresAt: row.share_expires_at,
  }
}

/* ---------------- 背景图 ---------------- */

export const MAX_BG_BYTES = 2 * 1024 * 1024
const MAX_BG_PER_USER = 50
const BG_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** 背景图地址：key 里含随机 UUID，无法猜到；更换后地址随之改变，可以长期缓存 */
export function bgUrl(key: string) {
  return `/api/anniv-bg/${key.split('/').pop()}`
}

/** 上传背景图：请求体就是图片本身（前端已压缩），最大 2 MB */
export async function uploadBackground(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  if (!env.FILES)
    throw new ApiError(503, '服务器尚未开通 R2 存储，暂时不能上传背景图')
  const row = await getRow(env, user.id, parseId(params.id))
  const type = (req.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase()
  const ext = BG_TYPES[type]
  if (!ext)
    throw new ApiError(400, '只支持 JPG、PNG、WebP 图片')
  const size = Number(req.headers.get('Content-Length') || 0)
  if (size > MAX_BG_BYTES)
    throw new ApiError(413, '图片不能超过 2 MB')
  const data = new Uint8Array(await req.arrayBuffer())
  if (!data.length || data.length > MAX_BG_BYTES)
    throw new ApiError(data.length ? 413 : 400, data.length ? '图片不能超过 2 MB' : '没有收到图片')
  // 简单校验文件头，避免把其他内容当图片存
  const isJpeg = data[0] === 0xFF && data[1] === 0xD8
  const isPng = data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47
  const isWebp = data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50
  if (!(ext === 'jpg' ? isJpeg : ext === 'png' ? isPng : isWebp))
    throw new ApiError(400, '图片文件不正确')
  if (!row.bg_key) {
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM anniversaries WHERE user_id = ? AND bg_key IS NOT NULL').bind(user.id).first<{ n: number }>()
    if ((count?.n ?? 0) >= MAX_BG_PER_USER)
      throw new ApiError(400, `最多给 ${MAX_BG_PER_USER} 个纪念日设置背景图`)
  }
  const key = `keep/anniv/${crypto.randomUUID()}.${ext}`
  await env.FILES.put(key, data, { httpMetadata: { contentType: type } })
  await env.DB.prepare('UPDATE anniversaries SET bg_key = ?, updated_at = ? WHERE id = ?').bind(key, now(), row.id).run()
  if (row.bg_key)
    await env.FILES.delete(row.bg_key).catch(() => {})
  return { background: bgUrl(key) }
}

export async function deleteBackground(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const row = await getRow(env, user.id, parseId(params.id))
  if (row.bg_key) {
    await env.DB.prepare('UPDATE anniversaries SET bg_key = NULL, updated_at = ? WHERE id = ?').bind(now(), row.id).run()
    await env.FILES?.delete(row.bg_key).catch(() => {})
  }
  return null
}

/** 公开读取背景图（分享页也要用）；文件名是随机 UUID */
export async function serveBackground(_req: Request, env: Env, params: Record<string, string>) {
  const name = params.name
  if (!/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(name) || !env.FILES)
    return new Response('Not Found', { status: 404 })
  const key = `keep/anniv/${name}`
  const used = await env.DB.prepare('SELECT 1 FROM anniversaries WHERE bg_key = ?').bind(key).first()
  const obj = used ? await env.FILES.get(key) : null
  if (!obj)
    return new Response('Not Found', { status: 404 })
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
