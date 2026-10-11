import type { Env, SessionUser } from './lib'
import { requireUser } from './auth'
import { decryptJson, encryptJson } from './crypto'
import { ApiError, isUniqueViolation, now, readJson, str } from './lib'

interface PasteRow {
  id: number
  user_id: number
  code: string
  content: string
  size: number
  burn_after_read: number
  views: number
  expires_at: number
  created_at: number
}

/** 可选有效期（秒）：10 分钟 / 1 小时 / 1 天 / 7 天 / 30 天 */
export const PASTE_TTLS = [600, 3600, 86400, 7 * 86400, 30 * 86400]
export const MAX_PASTE_LENGTH = 50_000
const MAX_PASTES_PER_USER = 200
const PREVIEW_LENGTH = 60
/** 取件码字符集：去掉 0/O/1/I 等易混淆字符，方便口头或手抄传递 */
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6

export function randomPasteCode() {
  const out: string[] = []
  const limit = 256 - (256 % CODE_CHARS.length)
  while (out.length < CODE_LENGTH) {
    for (const b of crypto.getRandomValues(new Uint8Array(CODE_LENGTH * 2))) {
      if (b < limit && out.length < CODE_LENGTH)
        out.push(CODE_CHARS[b % CODE_CHARS.length])
    }
  }
  return out.join('')
}

/** 用户输入的取件码：忽略大小写与空格 */
export function normalizeCode(value: string) {
  const code = value.replace(/\s+/g, '').toUpperCase()
  if (code.length !== CODE_LENGTH || [...code].some(c => !CODE_CHARS.includes(c)))
    throw new ApiError(400, '取件码格式不正确')
  return code
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
    burnAfterRead: !!row.burn_after_read,
    views: row.views,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }
}

/** 过期内容不保留：创建与查询列表时顺手清理 */
function cleanupExpired(env: Env) {
  return env.DB.prepare('DELETE FROM pastes WHERE expires_at <= ?').bind(now()).run()
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

  await cleanupExpired(env)
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM pastes WHERE user_id = ?').bind(user.id).first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_PASTES_PER_USER)
    throw new ApiError(400, `最多同时保留 ${MAX_PASTES_PER_USER} 条快传，请先删除一些`)

  const t = now()
  const encrypted = await encrypt(env, user.id, content)
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await env.DB.prepare(
        `INSERT INTO pastes (user_id, code, content, size, burn_after_read, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      ).bind(user.id, randomPasteCode(), encrypted, content.length, burn ? 1 : 0, t + ttl, t).first<PasteRow>()
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

/**
 * 按取件码提取：任何登录用户都可以。
 * 阅后即焚的内容被「创建者以外的人」提取后立即删除；创建者自己在其他设备上查看不会触发销毁。
 */
export async function getPaste(req: Request, env: Env, params: Record<string, string>) {
  const user: SessionUser = await requireUser(req, env)
  const code = normalizeCode(params.code)
  const row = await env.DB.prepare('SELECT * FROM pastes WHERE code = ?').bind(code).first<PasteRow>()
  const t = now()
  if (!row || row.expires_at <= t) {
    if (row)
      await env.DB.prepare('DELETE FROM pastes WHERE id = ?').bind(row.id).run()
    throw new ApiError(404, '取件码不存在或已过期')
  }

  const isOwner = row.user_id === user.id
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
