import type { Env } from './lib'
import { requireUser } from './auth'
import { decryptJson, encryptJson } from './crypto'
import { derivePreview, deriveTitle } from '../../src/pages-tools/notes/note-text'
import { ApiError, now, readJson } from './lib'
import { assertNotLimited, clientKey, recordFailure } from './ratelimit'

/**
 * Markdown 便签：标题与正文用用户密钥加密存储。
 * 前端自动保存时带上 baseVersion，版本不一致说明在其他设备上改过，返回 409 由用户选择。
 * 另有文件夹（名称加密）、历史版本（保存修改前的密文）、分享（可选密码，密码用作者密钥加密）。
 */

interface NoteRow {
  id: number
  user_id: number
  data: string
  size: number
  pinned: number
  version: number
  folder_id: number | null
  share_code: string | null
  share_expires_at: number
  share_password: string | null
  created_at: number
  updated_at: number
}

interface FolderRow {
  id: number
  user_id: number
  name: string
  created_at: number
}

interface VersionRow {
  id: number
  note_id: number
  user_id: number
  data: string
  size: number
  bytes: number
  created_at: number
}

interface NoteSecret {
  title: string
  content: string
}

export const MAX_NOTE_LENGTH = 100_000
const MAX_NOTES_PER_USER = 500
/** 每人便签正文（密文）总量上限，防止写满数据库 */
export const MAX_NOTE_BYTES_PER_USER = 30 * 1024 * 1024

export const MAX_FOLDERS_PER_USER = 50
export const MAX_FOLDER_NAME = 30

/** 历史版本的限制：同一便签至少间隔 10 分钟才留一个快照、每条最多 30 个、保留 90 天、每人总量 20 MB */
export const SNAPSHOT_INTERVAL = 10 * 60
export const MAX_VERSIONS_PER_NOTE = 30
export const VERSION_RETENTION = 90 * 86400
export const MAX_HISTORY_BYTES_PER_USER = 20 * 1024 * 1024

export const MAX_SHARE_PASSWORD = 32

function parseId(id: string | number, label = '便签') {
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0)
    throw new ApiError(400, `无效的${label} ID`)
  return n
}

function parseContent(value: unknown) {
  if (typeof value !== 'string')
    throw new ApiError(400, '便签内容格式不正确')
  if (value.length > MAX_NOTE_LENGTH)
    throw new ApiError(400, `便签不能超过 ${MAX_NOTE_LENGTH} 个字符`)
  return value
}

async function encrypt<T extends object>(env: Env, userId: number, value: T) {
  try {
    return await encryptJson(env.VAULT_KEY, userId, value)
  }
  catch (e) {
    console.error(e)
    throw new ApiError(500, '服务端加密失败，请检查 VAULT_KEY 配置')
  }
}

async function decrypt<T>(env: Env, userId: number, data: string) {
  try {
    return await decryptJson<T>(env.VAULT_KEY, userId, data)
  }
  catch (e) {
    console.error(e)
    throw new ApiError(500, '解密失败，VAULT_KEY 可能被更换过')
  }
}

function encryptNote(env: Env, userId: number, content: string) {
  return encrypt(env, userId, { title: deriveTitle(content), content } satisfies NoteSecret)
}

function decryptNote(env: Env, row: { user_id: number, data: string }) {
  return decrypt<NoteSecret>(env, row.user_id, row.data)
}

function meta(row: NoteRow) {
  return {
    id: row.id,
    size: row.size,
    pinned: !!row.pinned,
    version: row.version,
    folderId: row.folder_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    /** 分享码；未分享或已过期为空 */
    shareCode: isShareActive(row) ? row.share_code : null,
    shareExpiresAt: row.share_expires_at,
    /** 分享是否设了密码 */
    shareLocked: !!row.share_password,
  }
}

/** 只给作者本人看的分享密码（明文） */
async function sharePasswordOf(env: Env, row: NoteRow) {
  return row.share_password ? (await decrypt<{ p: string }>(env, row.user_id, row.share_password)).p : null
}

function isShareActive(row: NoteRow) {
  return !!row.share_code && (!row.share_expires_at || row.share_expires_at > now())
}

async function getRow(env: Env, userId: number, id: number) {
  const row = await env.DB.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').bind(id, userId).first<NoteRow>()
  if (!row)
    throw new ApiError(404, '便签不存在或已删除')
  return row
}

/** 正文总量检查；exceptId 为正在修改的便签（不重复计算旧内容） */
async function checkStorage(env: Env, userId: number, newBytes: number, exceptId = 0) {
  const used = await env.DB.prepare('SELECT COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM notes WHERE user_id = ? AND id != ?')
    .bind(userId, exceptId)
    .first<{ bytes: number }>()
  if ((used?.bytes ?? 0) + newBytes > MAX_NOTE_BYTES_PER_USER)
    throw new ApiError(400, `便签总容量已满（每人 ${MAX_NOTE_BYTES_PER_USER / 1024 / 1024} MB），请删除一些不需要的便签`)
}

/** 文件夹 ID：null 表示未分类；其他值必须是本人的文件夹 */
async function parseFolderId(env: Env, userId: number, value: unknown) {
  if (value === null || value === 0)
    return null
  const id = parseId(value as number, '文件夹')
  const folder = await env.DB.prepare('SELECT id FROM note_folders WHERE id = ? AND user_id = ?').bind(id, userId).first()
  if (!folder)
    throw new ApiError(404, '文件夹不存在')
  return id
}

/** 列表：置顶在前，其余按修改时间倒序；只返回标题与预览 */
export async function listNotes(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const { results } = await env.DB.prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC, id DESC')
    .bind(user.id)
    .all<NoteRow>()
  return Promise.all(results.map(async (row) => {
    const secret = await decryptNote(env, row)
    return { ...meta(row), title: secret.title, preview: derivePreview(secret.content) }
  }))
}

export async function getNote(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const row = await getRow(env, user.id, parseId(params.id))
  const secret = await decryptNote(env, row)
  return { ...meta(row), title: secret.title, content: secret.content, sharePassword: await sharePasswordOf(env, row) }
}

export async function createNote(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const body = await readJson(req)
  const content = parseContent(body.content ?? '')
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM notes WHERE user_id = ?').bind(user.id).first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_NOTES_PER_USER)
    throw new ApiError(400, `最多保存 ${MAX_NOTES_PER_USER} 条便签，请先删除一些`)
  const folderId = body.folderId === undefined ? null : await parseFolderId(env, user.id, body.folderId)
  const data = await encryptNote(env, user.id, content)
  await checkStorage(env, user.id, data.length)
  const t = now()
  const row = await env.DB.prepare(
    'INSERT INTO notes (user_id, data, size, pinned, folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *',
  ).bind(user.id, data, content.length, body.pinned === true ? 1 : 0, folderId, t, t).first<NoteRow>()
  return { ...meta(row!), title: deriveTitle(content) }
}

/**
 * 修改：content、pinned、folderId 可以分别传。
 * 修改正文时需带 baseVersion（编辑开始时的版本），与当前版本不一致返回 409；force 为 true 时直接覆盖。
 */
export async function updateNote(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id)
  const body = await readJson(req)
  const row = await getRow(env, user.id, id)
  const t = now()

  // 只改置顶 / 文件夹，不动正文和版本号
  const sets: string[] = []
  const values: unknown[] = []
  if (typeof body.pinned === 'boolean') {
    sets.push('pinned = ?')
    values.push(body.pinned ? 1 : 0)
  }
  if (body.folderId !== undefined) {
    sets.push('folder_id = ?')
    values.push(await parseFolderId(env, user.id, body.folderId))
  }
  if (body.content === undefined) {
    if (!sets.length)
      return meta(row)
    const updated = await env.DB.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`)
      .bind(...values, id, user.id)
      .first<NoteRow>()
    return meta(updated!)
  }

  const content = parseContent(body.content)
  const base = Number(body.baseVersion)
  if (body.force !== true && base !== row.version)
    throw new ApiError(409, '这条便签已在其他设备上修改过')
  const data = await encryptNote(env, user.id, content)
  await checkStorage(env, user.id, data.length, id)
  // 条件更新：并发保存时只有一个能成功
  const updated = await env.DB.prepare(
    `UPDATE notes SET data = ?, size = ?, version = version + 1, updated_at = ?${sets.map(s => `, ${s}`).join('')}
      WHERE id = ? AND user_id = ? AND version = ? RETURNING *`,
  ).bind(data, content.length, t, ...values, id, user.id, row.version).first<NoteRow>()
  if (!updated)
    throw new ApiError(409, '这条便签已在其他设备上修改过')
  await snapshot(env, row, content)
  return { ...meta(updated), title: deriveTitle(content) }
}

export async function deleteNote(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id)
  const results = await env.DB.batch([
    env.DB.prepare('DELETE FROM note_versions WHERE note_id = ? AND user_id = ?').bind(id, user.id),
    env.DB.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').bind(id, user.id),
  ])
  if (!results[1].meta.changes)
    throw new ApiError(404, '便签不存在或已删除')
  return null
}

/* ---------------- 历史版本 ---------------- */

/**
 * 正文被修改后，把修改前的内容存为历史版本（直接复用旧密文）。
 * 同一便签距离上一个快照不到 10 分钟时不再保存，连续编辑只留编辑开始前的版本；内容没变或原来是空的也不保存。
 * @param force 恢复历史版本时，无论间隔多久都先保存当前内容
 */
async function snapshot(env: Env, old: NoteRow, newContent: string | null, force = false) {
  if (!old.size)
    return
  const t = now()
  if (!force) {
    const last = await env.DB.prepare('SELECT created_at FROM note_versions WHERE note_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(old.id)
      .first<{ created_at: number }>()
    if (last && t - last.created_at < SNAPSHOT_INTERVAL)
      return
  }
  if (newContent !== null && (await decryptNote(env, old)).content === newContent)
    return
  await env.DB.prepare('INSERT INTO note_versions (note_id, user_id, data, size, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(old.id, old.user_id, old.data, old.size, old.data.length, t)
    .run()
  await pruneVersions(env, old.user_id, old.id)
}

/** 超出数量或总量限制时，删除最旧的版本 */
export async function pruneVersions(env: Env, userId: number, noteId: number) {
  await env.DB.prepare(
    `DELETE FROM note_versions WHERE note_id = ? AND id NOT IN (
       SELECT id FROM note_versions WHERE note_id = ? ORDER BY created_at DESC, id DESC LIMIT ?)`,
  ).bind(noteId, noteId, MAX_VERSIONS_PER_NOTE).run()
  const total = await env.DB.prepare('SELECT COALESCE(SUM(bytes), 0) AS bytes FROM note_versions WHERE user_id = ?')
    .bind(userId)
    .first<{ bytes: number }>()
  let excess = (total?.bytes ?? 0) - MAX_HISTORY_BYTES_PER_USER
  if (excess <= 0)
    return
  const { results } = await env.DB.prepare('SELECT id, bytes FROM note_versions WHERE user_id = ? ORDER BY created_at ASC, id ASC LIMIT 500')
    .bind(userId)
    .all<Pick<VersionRow, 'id' | 'bytes'>>()
  const ids: number[] = []
  for (const v of results) {
    if (excess <= 0)
      break
    ids.push(v.id)
    excess -= v.bytes
  }
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90)
    await env.DB.prepare(`DELETE FROM note_versions WHERE id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).run()
  }
}

/** 定时清理：删除超过保留期的历史版本 */
export async function cleanupNoteVersions(env: Env) {
  await env.DB.prepare('DELETE FROM note_versions WHERE created_at <= ?').bind(now() - VERSION_RETENTION).run()
}

/** 历史版本列表（只有时间和大小，不解密，内容在查看时再取） */
export async function listVersions(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id)
  await getRow(env, user.id, id)
  const { results } = await env.DB.prepare('SELECT id, size, bytes, created_at FROM note_versions WHERE note_id = ? AND user_id = ? ORDER BY created_at DESC, id DESC')
    .bind(id, user.id)
    .all<VersionRow>()
  const usage = await env.DB.prepare('SELECT COALESCE(SUM(bytes), 0) AS bytes FROM note_versions WHERE user_id = ?').bind(user.id).first<{ bytes: number }>()
  return {
    items: results.map(v => ({ id: v.id, size: v.size, createdAt: v.created_at })),
    /** 本人全部历史版本占用的空间与上限（字节） */
    usedBytes: usage?.bytes ?? 0,
    maxBytes: MAX_HISTORY_BYTES_PER_USER,
    limits: { perNote: MAX_VERSIONS_PER_NOTE, intervalMinutes: SNAPSHOT_INTERVAL / 60, retentionDays: VERSION_RETENTION / 86400 },
  }
}

async function getVersionRow(env: Env, userId: number, noteId: number, versionId: string) {
  const v = await env.DB.prepare('SELECT * FROM note_versions WHERE id = ? AND note_id = ? AND user_id = ?')
    .bind(parseId(versionId, '版本'), noteId, userId)
    .first<VersionRow>()
  if (!v)
    throw new ApiError(404, '历史版本不存在或已过期')
  return v
}

export async function getVersion(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id)
  const v = await getVersionRow(env, user.id, id, params.vid)
  const secret = await decryptNote(env, v)
  return { id: v.id, size: v.size, createdAt: v.created_at, title: secret.title, content: secret.content }
}

/** 恢复到某个历史版本：先把当前内容存为一个版本，再用历史版本覆盖 */
export async function restoreVersion(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id)
  const row = await getRow(env, user.id, id)
  const v = await getVersionRow(env, user.id, id, params.vid)
  await checkStorage(env, user.id, v.data.length, id)
  await snapshot(env, row, null, true)
  const updated = await env.DB.prepare('UPDATE notes SET data = ?, size = ?, version = version + 1, updated_at = ? WHERE id = ? AND user_id = ? RETURNING *')
    .bind(v.data, v.size, now(), id, user.id)
    .first<NoteRow>()
  const secret = await decryptNote(env, updated!)
  return { ...meta(updated!), title: secret.title, content: secret.content, sharePassword: await sharePasswordOf(env, updated!) }
}

export async function clearVersions(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id)
  await getRow(env, user.id, id)
  await env.DB.prepare('DELETE FROM note_versions WHERE note_id = ? AND user_id = ?').bind(id, user.id).run()
  return null
}

/* ---------------- 文件夹 ---------------- */

function parseFolderName(value: unknown) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (!name)
    throw new ApiError(400, '请填写文件夹名称')
  if (name.length > MAX_FOLDER_NAME)
    throw new ApiError(400, `文件夹名称最多 ${MAX_FOLDER_NAME} 个字`)
  return name
}

async function folderList(env: Env, userId: number) {
  const { results } = await env.DB.prepare('SELECT * FROM note_folders WHERE user_id = ? ORDER BY created_at ASC, id ASC').bind(userId).all<FolderRow>()
  return Promise.all(results.map(async f => ({ id: f.id, name: (await decrypt<{ name: string }>(env, userId, f.name)).name, createdAt: f.created_at })))
}

async function assertNameFree(env: Env, userId: number, name: string, exceptId = 0) {
  const folders = await folderList(env, userId)
  if (folders.some(f => f.id !== exceptId && f.name.toLowerCase() === name.toLowerCase()))
    throw new ApiError(400, '已有同名文件夹')
  return folders
}

export async function listFolders(req: Request, env: Env) {
  const user = await requireUser(req, env)
  return folderList(env, user.id)
}

export async function createFolder(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const name = parseFolderName((await readJson(req)).name)
  const folders = await assertNameFree(env, user.id, name)
  if (folders.length >= MAX_FOLDERS_PER_USER)
    throw new ApiError(400, `最多 ${MAX_FOLDERS_PER_USER} 个文件夹`)
  const row = await env.DB.prepare('INSERT INTO note_folders (user_id, name, created_at) VALUES (?, ?, ?) RETURNING *')
    .bind(user.id, await encrypt(env, user.id, { name }), now())
    .first<FolderRow>()
  return { id: row!.id, name, createdAt: row!.created_at }
}

export async function renameFolder(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id, '文件夹')
  const name = parseFolderName((await readJson(req)).name)
  await assertNameFree(env, user.id, name, id)
  const row = await env.DB.prepare('UPDATE note_folders SET name = ? WHERE id = ? AND user_id = ? RETURNING *')
    .bind(await encrypt(env, user.id, { name }), id, user.id)
    .first<FolderRow>()
  if (!row)
    throw new ApiError(404, '文件夹不存在')
  return { id, name, createdAt: row.created_at }
}

/** 删除文件夹：其中的便签移到「未分类」，不会被删除 */
export async function deleteFolder(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id, '文件夹')
  const results = await env.DB.batch([
    env.DB.prepare('UPDATE notes SET folder_id = NULL WHERE folder_id = ? AND user_id = ?').bind(id, user.id),
    env.DB.prepare('DELETE FROM note_folders WHERE id = ? AND user_id = ?').bind(id, user.id),
  ])
  if (!results[1].meta.changes)
    throw new ApiError(404, '文件夹不存在')
  return null
}

/* ---------------- 分享 ---------------- */

/** 分享有效期（秒），0 表示永久 */
export const SHARE_TTLS = [0, 86400, 7 * 86400, 30 * 86400]
/** 分享码较长（约 71 位熵），且失败请求会被限流，无法被穷举 */
const SHARE_CODE_LENGTH = 12
const SHARE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

export function randomShareCode() {
  const out: string[] = []
  const limit = 256 - (256 % SHARE_CHARS.length)
  while (out.length < SHARE_CODE_LENGTH) {
    for (const b of crypto.getRandomValues(new Uint8Array(SHARE_CODE_LENGTH * 2))) {
      if (b < limit && out.length < SHARE_CODE_LENGTH)
        out.push(SHARE_CHARS[b % SHARE_CHARS.length])
    }
  }
  return out.join('')
}

/**
 * 分享密码：undefined 保持不变，'' 或 null 取消密码，其他为新密码
 * @returns undefined 表示不修改
 */
export function parseSharePassword(value: unknown) {
  if (value === undefined)
    return undefined
  if (value === null || value === '')
    return ''
  if (typeof value !== 'string' || /\s/.test(value) || value.length > MAX_SHARE_PASSWORD)
    throw new ApiError(400, `访问密码不能包含空格，最多 ${MAX_SHARE_PASSWORD} 位`)
  return value
}

/**
 * 开启或修改分享。已有分享码时保留原链接，只修改有效期 / 密码；renew 为 true 时换一个新链接（旧链接立即失效）
 */
export async function shareNote(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id)
  const body = await readJson(req)
  const ttl = Number(body.expiresIn ?? 0)
  if (!SHARE_TTLS.includes(ttl))
    throw new ApiError(400, '有效期不正确')
  const password = parseSharePassword(body.password)
  const row = await getRow(env, user.id, id)
  const code = !isShareActive(row) || body.renew === true ? randomShareCode() : row.share_code!
  const storedPassword = password === undefined
    ? row.share_password
    : password ? await encrypt(env, user.id, { p: password }) : null
  const updated = await env.DB.prepare('UPDATE notes SET share_code = ?, share_expires_at = ?, share_password = ? WHERE id = ? AND user_id = ? RETURNING *')
    .bind(code, ttl ? now() + ttl : 0, storedPassword, id, user.id)
    .first<NoteRow>()
  return { ...meta(updated!), sharePassword: await sharePasswordOf(env, updated!) }
}

export async function unshareNote(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id)
  await getRow(env, user.id, id)
  const updated = await env.DB.prepare('UPDATE notes SET share_code = NULL, share_expires_at = 0, share_password = NULL WHERE id = ? AND user_id = ? RETURNING *').bind(id, user.id).first<NoteRow>()
  return { ...meta(updated!), sharePassword: null }
}

const SHARE_LIMIT = 20
const SHARE_WINDOW = 10 * 60

/** 常量时间比较，避免按响应时间猜密码 */
function safeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++)
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

/**
 * 公开访问：凭分享码查看（只读，始终是最新内容）。
 * 设了密码时，密码放在请求头 X-Share-Password（不放在 URL 里，避免出现在日志和浏览记录中）；
 * 缺少或错误返回 403，错误次数与无效分享码一起按 IP 限流。
 */
export async function getSharedNote(req: Request, env: Env, params: Record<string, string>) {
  const limitKey = `note-share:ip:${clientKey(req.headers.get('CF-Connecting-IP') || '')}`
  await assertNotLimited(env, limitKey, SHARE_LIMIT)
  const code = params.code
  const row = /^[A-Z0-9]{6,32}$/i.test(code)
    ? await env.DB.prepare('SELECT * FROM notes WHERE share_code = ?').bind(code).first<NoteRow>()
    : null
  if (!row || !isShareActive(row)) {
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
  const secret = await decryptNote(env, row)
  return {
    title: secret.title,
    content: secret.content,
    updatedAt: row.updated_at,
    shareExpiresAt: row.share_expires_at,
  }
}
