import type { Env, SessionUser } from './lib'
import { optionalUser, requireUser } from './auth'
import { fromBase64 } from './crypto'
import { ApiError, isUniqueViolation, now } from './lib'
import { CODE_CHARS, CODE_LENGTH, normalizeCode, randomPasteCode } from './paste'
import { assertNotLimited, clientKey, recordFailure } from './ratelimit'

/**
 * 文件快传：文件存 R2，元数据存 D1。
 * - 上传：网页版直接把文件作为请求体流式写入 R2（最大 100 MB）；小程序用 uploadFile 的表单上传（最大 50 MB，需整体读入内存）
 * - 下载：先用取件码换一个 10 分钟有效的签名链接，浏览器 / 小程序直接下载这个链接
 * - 过期：定时任务（见 index.ts 的 scheduled）批量删除过期的 R2 对象与记录；访问时遇到过期的也会顺手删除
 */

interface FileRow {
  id: number
  user_id: number
  code: string
  r2_key: string
  name: string
  size: number
  mime: string
  burn_after_read: number
  burned: number
  downloads: number
  expires_at: number
  created_at: number
}

/** 有效期：1 小时 / 1 天 / 3 天 / 7 天。最长 7 天，节省存储空间 */
export const FILE_TTLS = [3600, 86400, 3 * 86400, 7 * 86400]
export const MAX_FILE_SIZE = 100 * 1024 * 1024
export const MAX_FORM_FILE_SIZE = 50 * 1024 * 1024
/** 每个用户同时保留的文件数与总大小 */
const MAX_FILES_PER_USER = 50
const MAX_BYTES_PER_USER = 1024 * 1024 * 1024
/** 阅后即焚的文件被下载后，再保留几分钟用于完成本次下载，之后由定时任务删除 */
const BURN_GRACE = 5 * 60
const DOWNLOAD_TOKEN_TTL = 10 * 60
const PICKUP_WINDOW = 10 * 60

export { CODE_CHARS, CODE_LENGTH }

function bucket(env: Env) {
  if (!env.FILES)
    throw new ApiError(503, '服务器尚未开通 R2 存储，文件快传暂不可用，请联系管理员')
  return env.FILES
}

function toSummary(row: FileRow) {
  return {
    code: row.code,
    name: row.name,
    size: row.size,
    mime: row.mime,
    burnAfterRead: !!row.burn_after_read,
    burned: !!row.burned,
    downloads: row.downloads,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }
}

/** 文件名：去掉路径与控制字符，限制长度（保留扩展名） */
export function sanitizeName(raw: string) {
  // eslint-disable-next-line no-control-regex
  let name = raw.replace(/^.*[\\/]/, '').replace(/[\u0000-\u001F\u007F]/g, '').trim()
  if (!name || name === '.' || name === '..')
    name = 'file'
  if (name.length > 200) {
    const dot = name.lastIndexOf('.')
    const ext = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : ''
    name = name.slice(0, 200 - ext.length) + ext
  }
  return name
}

/** Content-Disposition：ASCII 兜底名 + RFC 5987 的 UTF-8 文件名 */
export function contentDisposition(name: string) {
  const fallback = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

/* ---------------- 下载签名 ---------------- */

const hmacKeys = new Map<string, Promise<CryptoKey>>()
function hmacKey(env: Env) {
  let key = hmacKeys.get(env.VAULT_KEY)
  if (!key) {
    key = crypto.subtle.importKey('raw', fromBase64(env.VAULT_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
    hmacKeys.set(env.VAULT_KEY, key)
  }
  return key
}

function toHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')
}

/** 签名内容带上用途前缀，与其他用途的签名区分 */
function tokenMessage(code: string, exp: number, owner: boolean) {
  return new TextEncoder().encode(`otools-file-download:${code}:${exp}:${owner ? 1 : 0}`)
}

export async function signDownload(env: Env, code: string, owner: boolean, t = now()) {
  const exp = t + DOWNLOAD_TOKEN_TTL
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env), tokenMessage(code, exp, owner))
  return `${exp}.${owner ? 1 : 0}.${toHex(sig)}`
}

export async function verifyDownload(env: Env, code: string, token: string, t = now()) {
  const [expStr, ownerStr, sig] = token.split('.')
  const exp = Number(expStr)
  if (!exp || exp < t || !/^[01]$/.test(ownerStr) || !/^[\da-f]{64}$/.test(sig || ''))
    return null
  const bytes = new Uint8Array(sig.match(/../g)!.map(h => Number.parseInt(h, 16)))
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(env), bytes, tokenMessage(code, exp, ownerStr === '1'))
  return ok ? { owner: ownerStr === '1' } : null
}

/* ---------------- 上传 ---------------- */

async function insertRow(env: Env, user: SessionUser, meta: { key: string, name: string, size: number, mime: string, burn: boolean, ttl: number }) {
  const t = now()
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await env.DB.prepare(
        `INSERT INTO files (user_id, code, r2_key, name, size, mime, burn_after_read, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      ).bind(user.id, randomPasteCode(), meta.key, meta.name, meta.size, meta.mime, meta.burn ? 1 : 0, t + meta.ttl, t).first<FileRow>()
    }
    catch (e) {
      if (!isUniqueViolation(e))
        throw e
    }
  }
  throw new ApiError(500, '生成取件码失败，请重试')
}

async function checkQuota(env: Env, userId: number, size: number) {
  const usage = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM files WHERE user_id = ? AND expires_at > ? AND burned = 0')
    .bind(userId, now())
    .first<{ n: number, bytes: number }>()
  if ((usage?.n ?? 0) >= MAX_FILES_PER_USER)
    throw new ApiError(400, `最多同时保留 ${MAX_FILES_PER_USER} 个文件，请先删除一些`)
  if ((usage?.bytes ?? 0) + size > MAX_BYTES_PER_USER)
    throw new ApiError(400, '存储空间不足：每人最多同时保留 1 GB，请先删除一些文件')
}

function parseOptions(get: (k: string) => string | null) {
  const ttl = Number(get('expiresIn'))
  if (!FILE_TTLS.includes(ttl))
    throw new ApiError(400, '有效期不正确')
  return { ttl, burn: get('burnAfterRead') === 'true' || get('burnAfterRead') === '1' }
}

function sanitizeMime(mime: string | null | undefined) {
  const m = (mime || '').split(';')[0].trim().toLowerCase()
  return /^[\w.+-]+\/[\w.+-]+$/.test(m) ? m : 'application/octet-stream'
}

/**
 * 上传。两种方式：
 * - 请求体就是文件本身（网页版），文件名放在 X-File-Name（URL 编码），参数放在 query
 * - multipart/form-data（小程序 uploadFile），文件字段名 file，参数作为表单字段
 */
export async function uploadFile(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const r2 = bucket(env)
  const url = new URL(req.url)
  const contentType = req.headers.get('Content-Type') || ''
  const key = `files/${user.id}/${crypto.randomUUID()}`

  let meta: { name: string, size: number, mime: string, ttl: number, burn: boolean }
  if (contentType.startsWith('multipart/form-data')) {
    const declared = Number(req.headers.get('Content-Length') || 0)
    if (declared > MAX_FORM_FILE_SIZE + 64 * 1024)
      throw new ApiError(413, `小程序上传单个文件最大 ${MAX_FORM_FILE_SIZE / 1024 / 1024} MB`)
    const form = await req.formData()
    const file = form.get('file')
    if (!file || typeof file === 'string')
      throw new ApiError(400, '没有收到文件')
    if (file.size > MAX_FORM_FILE_SIZE)
      throw new ApiError(413, `小程序上传单个文件最大 ${MAX_FORM_FILE_SIZE / 1024 / 1024} MB`)
    const opts = parseOptions(k => (form.get(k) as string | null) ?? url.searchParams.get(k))
    meta = { name: sanitizeName(String(form.get('name') || file.name || 'file')), size: file.size, mime: sanitizeMime(file.type), ...opts }
    if (!meta.size)
      throw new ApiError(400, '不能上传空文件')
    await checkQuota(env, user.id, meta.size)
    await r2.put(key, file.stream(), { httpMetadata: { contentType: meta.mime } })
  }
  else {
    const size = Number(req.headers.get('Content-Length'))
    if (!size)
      throw new ApiError(411, '缺少文件大小（Content-Length），或文件为空')
    if (size > MAX_FILE_SIZE)
      throw new ApiError(413, `单个文件最大 ${MAX_FILE_SIZE / 1024 / 1024} MB`)
    if (!req.body)
      throw new ApiError(400, '没有收到文件')
    const opts = parseOptions(k => url.searchParams.get(k))
    let name = req.headers.get('X-File-Name') || 'file'
    try {
      name = decodeURIComponent(name)
    }
    catch {}
    meta = { name: sanitizeName(name), size, mime: sanitizeMime(contentType), ...opts }
    await checkQuota(env, user.id, size)
    // 流式写入，不占用 Worker 内存
    await r2.put(key, req.body, { httpMetadata: { contentType: meta.mime } })
  }

  try {
    const row = await insertRow(env, user, { key, ...meta })
    return toSummary(row!)
  }
  catch (e) {
    // 记录写入失败时不要留下孤儿对象
    await r2.delete(key).catch(() => {})
    throw e
  }
}

/* ---------------- 列表、删除 ---------------- */

export async function listFiles(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const { results } = await env.DB.prepare('SELECT * FROM files WHERE user_id = ? AND expires_at > ? AND burned = 0 ORDER BY created_at DESC, id DESC')
    .bind(user.id, now())
    .all<FileRow>()
  return results.map(toSummary)
}

async function removeRows(env: Env, rows: Pick<FileRow, 'id' | 'r2_key'>[]) {
  if (!rows.length)
    return
  // R2 一次最多删除 1000 个对象
  for (let i = 0; i < rows.length; i += 1000)
    await env.FILES?.delete(rows.slice(i, i + 1000).map(r => r.r2_key))
  const ids = rows.map(r => r.id)
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90)
    await env.DB.prepare(`DELETE FROM files WHERE id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).run()
  }
}

export async function deleteFile(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const row = await env.DB.prepare('SELECT * FROM files WHERE code = ? AND user_id = ?').bind(normalizeCode(params.code), user.id).first<FileRow>()
  if (!row)
    throw new ApiError(404, '文件不存在')
  await removeRows(env, [row])
  return null
}

/** 删除用户时一并清理其文件 */
export async function deleteUserFiles(env: Env, userId: number) {
  const { results } = await env.DB.prepare('SELECT id, r2_key FROM files WHERE user_id = ?').bind(userId).all<FileRow>()
  await removeRows(env, results)
}

/**
 * 定时清理：删除过期、以及阅后即焚已被下载的文件
 * @returns 本次删除的文件数
 */
export async function cleanupExpiredFiles(env: Env) {
  let total = 0
  for (let round = 0; round < 10; round++) {
    const { results } = await env.DB.prepare('SELECT id, r2_key FROM files WHERE expires_at <= ? LIMIT 500').bind(now()).all<FileRow>()
    if (!results.length)
      break
    await removeRows(env, results)
    total += results.length
  }
  return total
}

/* ---------------- 取件与下载 ---------------- */

const PICKUP_LIMIT_ANONYMOUS = 10
const PICKUP_LIMIT_USER = 30

/** 凭取件码查看文件信息并换取下载链接；无需登录，猜错按 IP / 账号限流 */
export async function getFileInfo(req: Request, env: Env, params: Record<string, string>) {
  const user = await optionalUser(req, env)
  const code = normalizeCode(params.code)
  const limitKey = user ? `file:user:${user.id}` : `file:ip:${clientKey(req.headers.get('CF-Connecting-IP') || '')}`
  await assertNotLimited(env, limitKey, user ? PICKUP_LIMIT_USER : PICKUP_LIMIT_ANONYMOUS)
  const row = await env.DB.prepare('SELECT * FROM files WHERE code = ?').bind(code).first<FileRow>()
  const t = now()
  if (!row || row.expires_at <= t || row.burned) {
    if (row && row.expires_at <= t)
      await removeRows(env, [row])
    await recordFailure(env, limitKey, PICKUP_WINDOW)
    throw new ApiError(404, row?.burned ? '文件已被下载并销毁' : '取件码不存在或已过期')
  }
  const isOwner = !!user && row.user_id === user.id
  const token = await signDownload(env, row.code, isOwner, t)
  return {
    ...toSummary(row),
    isOwner,
    /** 相对路径，前端拼上站点地址；10 分钟内有效 */
    downloadPath: `/api/files/${row.code}/download?t=${encodeURIComponent(token)}`,
  }
}

/** 下载链接是在浏览器里直接打开的，出错时返回可读的文字而不是 JSON */
export async function downloadFile(req: Request, env: Env, params: Record<string, string>) {
  try {
    return await serveDownload(req, env, params)
  }
  catch (e) {
    if (e instanceof ApiError)
      return new Response(e.message, { status: e.status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
    throw e
  }
}

/** 下载：校验签名；阅后即焚的文件被他人下载时原子地标记为已销毁，只有第一个请求能拿到 */
async function serveDownload(req: Request, env: Env, params: Record<string, string>) {
  const r2 = bucket(env)
  const code = normalizeCode(params.code)
  const auth = await verifyDownload(env, code, new URL(req.url).searchParams.get('t') || '')
  if (!auth)
    throw new ApiError(403, '下载链接无效或已过期，请重新输入取件码')
  const t = now()
  let row = await env.DB.prepare('SELECT * FROM files WHERE code = ?').bind(code).first<FileRow>()
  if (!row || row.expires_at <= t || row.burned)
    throw new ApiError(404, '文件不存在、已过期或已被销毁')

  if (!auth.owner) {
    row = row.burn_after_read
      ? await env.DB.prepare('UPDATE files SET burned = 1, downloads = downloads + 1, expires_at = MIN(expires_at, ?) WHERE id = ? AND burned = 0 RETURNING *')
          .bind(t + BURN_GRACE, row.id)
          .first<FileRow>()
      : await env.DB.prepare('UPDATE files SET downloads = downloads + 1 WHERE id = ? RETURNING *').bind(row.id).first<FileRow>()
    if (!row)
      throw new ApiError(404, '文件已被下载并销毁')
  }

  // 阅后即焚只允许一次完整下载，不支持断点续传
  const ranged = !row.burn_after_read && req.headers.has('Range')
  const object = await r2.get(row.r2_key, ranged ? { range: req.headers } : undefined)
  if (!object)
    throw new ApiError(404, '文件已被删除')
  const headers = new Headers({
    // 一律作为附件下载，避免 HTML / SVG 等在本站域名下被直接打开
    'Content-Type': row.mime,
    'Content-Disposition': contentDisposition(row.name),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': row.burn_after_read ? 'none' : 'bytes',
  })
  const range = (object as R2ObjectBody & { range?: { offset?: number, length?: number } }).range
  if (ranged && range && range.offset !== undefined && range.length !== undefined) {
    headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`)
    headers.set('Content-Length', String(range.length))
    return new Response(object.body, { status: 206, headers })
  }
  headers.set('Content-Length', String(object.size))
  return new Response(object.body, { headers })
}
