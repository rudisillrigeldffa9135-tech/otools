import type { Env, SessionUser } from './lib'
import { optionalUser, requireUser } from './auth'
import { decryptJson, encryptJson } from './crypto'
import { ApiError, isUniqueViolation, now, readJson, str } from './lib'
import { assertNotLimited, clientKey, recordFailure } from './ratelimit'

interface PasteRow {
  id: number
  user_id: number
  code: string
  content: string
  size: number
  burn_after_read: number
  raw: number
  views: number
  expires_at: number
  created_at: number
}

/** 可选有效期（秒）：10 分钟 / 1 小时 / 1 天 / 7 天 / 30 天；0 表示永久有效 */
export const PASTE_TTLS = [600, 3600, 86400, 7 * 86400, 30 * 86400, 0]
export const MAX_PASTE_LENGTH = 50_000
const MAX_PASTES_PER_USER = 200
const PREVIEW_LENGTH = 60
/** 取件码字符集：去掉 0/O/1/I 等易混淆字符，方便口头或手抄传递 */
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6
/** 不需要取件码的快传用 16 位链接码（约 80 bit 随机），只能通过链接打开，无法穷举 */
export const LINK_CODE_LENGTH = 16

export function randomPasteCode(length = CODE_LENGTH) {
  const out: string[] = []
  const limit = 256 - (256 % CODE_CHARS.length)
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < limit && out.length < length)
        out.push(CODE_CHARS[b % CODE_CHARS.length])
    }
  }
  return out.join('')
}

/** 用户输入的取件码或链接码：忽略大小写与空格 */
export function normalizeCode(value: string) {
  const code = value.replace(/\s+/g, '').toUpperCase()
  if ((code.length !== CODE_LENGTH && code.length !== LINK_CODE_LENGTH) || [...code].some(c => !CODE_CHARS.includes(c)))
    throw new ApiError(400, '取件码格式不正确')
  return code
}

/** 是否已过期：expires_at 为 0 表示永久有效 */
function isExpired(row: PasteRow, t = now()) {
  return row.expires_at > 0 && row.expires_at <= t
}

async function encrypt(env: Env, userId: number, content: string) {
  try {
    return await encryptJson(env.VAULT_KEY, userId, { content })
  }
  catch (e) {
    console.error(e)
    throw new ApiError(500, '服务端加密失败，请检查 VAULT_KEY 配置')
  }
}

async function decrypt(env: Env, row: PasteRow) {
  try {
    return (await decryptJson<{ content: string }>(env.VAULT_KEY, row.user_id, row.content)).content
  }
  catch (e) {
    console.error(e)
    throw new ApiError(500, '解密失败，VAULT_KEY 可能被更换过')
  }
}

function toSummary(row: PasteRow) {
  return {
    code: row.code,
    size: row.size,
    /** 是否使用 6 位取件码；否则只能通过链接打开 */
    withCode: row.code.length === CODE_LENGTH,
    burnAfterRead: !!row.burn_after_read,
    raw: !!row.raw,
    views: row.views,
    /** null 表示永久有效 */
    expiresAt: row.expires_at || null,
    createdAt: row.created_at,
  }
}

/** 过期内容不保留：创建与查询列表时顺手清理 */
function cleanupExpired(env: Env) {
  return env.DB.prepare('DELETE FROM pastes WHERE expires_at > 0 AND expires_at <= ?').bind(now()).run()
}

export async function createPaste(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const body = await readJson(req)
  const content = str(body.content, '内容', { required: true, max: MAX_PASTE_LENGTH })
  if (!content.trim())
    throw new ApiError(400, '内容不能为空')
  const ttl = Number(body.expiresIn)
  if (!PASTE_TTLS.includes(ttl))
    throw new ApiError(400, '有效期不正确')
  const burn = body.burnAfterRead === true
  const raw = body.raw === true
  // 默认需要取件码，兼容旧版客户端
  const withCode = body.withCode !== false

  await cleanupExpired(env)
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM pastes WHERE user_id = ?').bind(user.id).first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_PASTES_PER_USER)
    throw new ApiError(400, `最多同时保留 ${MAX_PASTES_PER_USER} 条快传，请先删除一些`)

  const t = now()
  const encrypted = await encrypt(env, user.id, content)
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await env.DB.prepare(
        `INSERT INTO pastes (user_id, code, content, size, burn_after_read, raw, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      ).bind(
        user.id,
        randomPasteCode(withCode ? CODE_LENGTH : LINK_CODE_LENGTH),
        encrypted,
        content.length,
        burn ? 1 : 0,
        raw ? 1 : 0,
        ttl ? t + ttl : 0,
        t,
      ).first<PasteRow>()
      return toSummary(row!)
    }
    catch (e) {
      if (!isUniqueViolation(e))
        throw e
    }
  }
  throw new ApiError(500, '生成取件码失败，请重试')
}

/** 我的快传：附带内容预览（本人的内容，阅后即焚的也可以预览，不会触发销毁） */
export async function listPastes(req: Request, env: Env) {
  const user = await requireUser(req, env)
  await cleanupExpired(env)
  const { results } = await env.DB.prepare('SELECT * FROM pastes WHERE user_id = ? ORDER BY created_at DESC, id DESC')
    .bind(user.id)
    .all<PasteRow>()
  return Promise.all(results.map(async (row) => {
    const content = await decrypt(env, row)
    const preview = content.replace(/\s+/g, ' ').trim()
    return {
      ...toSummary(row),
      preview: preview.length > PREVIEW_LENGTH ? `${preview.slice(0, PREVIEW_LENGTH)}…` : preview,
    }
  }))
}

/** 取件码猜错的限流：匿名按 IP，登录用户按账号，10 分钟窗口 */
export const PICKUP_WINDOW = 10 * 60
export const PICKUP_LIMIT_ANONYMOUS = 10
export const PICKUP_LIMIT_USER = 30

/**
 * 按取件码提取：无需登录，任何拿到取件码的人都可以。
 * 阅后即焚的内容被「创建者以外的人」提取后立即删除；创建者自己在其他设备上查看不会触发销毁。
 * 取件码只有 6 位，为防止被穷举，提取失败的次数按 IP / 账号限流。
 */
export async function getPaste(req: Request, env: Env, params: Record<string, string>) {
  const user: SessionUser | null = await optionalUser(req, env)
  return pickup(req, env, normalizeCode(params.code), user)
}

async function pickup(req: Request, env: Env, code: string, user: SessionUser | null) {
  const limitKey = user ? `paste:user:${user.id}` : `paste:ip:${clientKey(req.headers.get('CF-Connecting-IP') || '')}`
  await assertNotLimited(env, limitKey, user ? PICKUP_LIMIT_USER : PICKUP_LIMIT_ANONYMOUS)

  const row = await env.DB.prepare('SELECT * FROM pastes WHERE code = ?').bind(code).first<PasteRow>()
  if (!row || isExpired(row)) {
    if (row)
      await env.DB.prepare('DELETE FROM pastes WHERE id = ?').bind(row.id).run()
    await recordFailure(env, limitKey, PICKUP_WINDOW)
    throw new ApiError(404, '取件码不存在或已过期')
  }

  const isOwner = !!user && row.user_id === user.id
  let current = row
  if (row.burn_after_read && !isOwner) {
    // DELETE ... RETURNING 保证并发提取时只有一个人能拿到
    const deleted = await env.DB.prepare('DELETE FROM pastes WHERE id = ? RETURNING *').bind(row.id).first<PasteRow>()
    if (!deleted)
      throw new ApiError(404, '内容已被提取并销毁')
    current = { ...deleted, views: deleted.views + 1 }
  }
  else if (!isOwner) {
    current = (await env.DB.prepare('UPDATE pastes SET views = views + 1 WHERE id = ? RETURNING *').bind(row.id).first<PasteRow>()) || row
  }

  return {
    ...toSummary(current),
    content: await decrypt(env, current),
    isOwner,
    /** 本次提取后是否已被销毁 */
    burned: !!row.burn_after_read && !isOwner,
  }
}

export async function deletePaste(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const code = normalizeCode(params.code)
  const res = await env.DB.prepare('DELETE FROM pastes WHERE code = ? AND user_id = ?').bind(code, user.id).run()
  if (!res.meta.changes)
    throw new ApiError(404, '快传不存在')
  return null
}

/** 纯文本页面的响应头：禁止浏览器把内容当作 HTML / 脚本执行 */
function textResponse(body: string | null, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'default-src \'none\'; sandbox',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
    },
  })
}

/**
 * 纯文本页面 /r/<取件码或链接码>：整个页面只有原文，类似 GitHub 的 Raw，可直接用于 curl / wget。
 * 浏览器打开时不带登录信息，所以总是按「他人提取」处理：阅后即焚的内容打开一次即销毁。
 * HEAD 请求只确认是否存在，不计数、不销毁。
 */
export async function rawPaste(req: Request, env: Env, value: string) {
  try {
    const code = normalizeCode(value)
    if (req.method === 'HEAD') {
      const row = await env.DB.prepare('SELECT * FROM pastes WHERE code = ?').bind(code).first<PasteRow>()
      return textResponse(null, row && !isExpired(row) ? 200 : 404)
    }
    const result = await pickup(req, env, code, null)
    return textResponse(result.content)
  }
  catch (e) {
    if (e instanceof ApiError)
      return textResponse(e.message, e.status)
    throw e
  }
}
