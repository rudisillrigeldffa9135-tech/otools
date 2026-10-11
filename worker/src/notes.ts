import type { Env } from './lib'
import { requireUser } from './auth'
import { decryptJson, encryptJson } from './crypto'
import { derivePreview, deriveTitle } from '../../src/pages-tools/notes/note-text'
import { ApiError, now, readJson } from './lib'

/**
 * Markdown 便签：标题与正文用用户密钥加密存储。
 * 前端自动保存时带上 baseVersion，版本不一致说明在其他设备上改过，返回 409 由用户选择。
 */

interface NoteRow {
  id: number
  user_id: number
  data: string
  size: number
  pinned: number
  version: number
  created_at: number
  updated_at: number
}

interface NoteSecret {
  title: string
  content: string
}

export const MAX_NOTE_LENGTH = 100_000
const MAX_NOTES_PER_USER = 500

function parseId(id: string) {
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0)
    throw new ApiError(400, '无效的便签 ID')
  return n
}

function parseContent(value: unknown) {
  if (typeof value !== 'string')
    throw new ApiError(400, '便签内容格式不正确')
  if (value.length > MAX_NOTE_LENGTH)
    throw new ApiError(400, `便签不能超过 ${MAX_NOTE_LENGTH} 个字符`)
  return value
}

async function encrypt(env: Env, userId: number, content: string) {
  try {
    return await encryptJson(env.VAULT_KEY, userId, { title: deriveTitle(content), content } satisfies NoteSecret)
  }
  catch (e) {
    console.error(e)
    throw new ApiError(500, '服务端加密失败，请检查 VAULT_KEY 配置')
  }
}

async function decrypt(env: Env, row: NoteRow) {
  try {
    return await decryptJson<NoteSecret>(env.VAULT_KEY, row.user_id, row.data)
  }
  catch (e) {
    console.error(e)
    throw new ApiError(500, '解密失败，VAULT_KEY 可能被更换过')
  }
}

function meta(row: NoteRow) {
  return {
    id: row.id,
    size: row.size,
    pinned: !!row.pinned,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function getRow(env: Env, userId: number, id: number) {
  const row = await env.DB.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').bind(id, userId).first<NoteRow>()
  if (!row)
    throw new ApiError(404, '便签不存在或已删除')
  return row
}

/** 列表：置顶在前，其余按修改时间倒序；只返回标题与预览 */
export async function listNotes(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const { results } = await env.DB.prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC, id DESC')
    .bind(user.id)
    .all<NoteRow>()
  return Promise.all(results.map(async (row) => {
    const secret = await decrypt(env, row)
    return { ...meta(row), title: secret.title, preview: derivePreview(secret.content) }
  }))
}

export async function getNote(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const row = await getRow(env, user.id, parseId(params.id))
  const secret = await decrypt(env, row)
  return { ...meta(row), title: secret.title, content: secret.content }
}

export async function createNote(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const body = await readJson(req)
  const content = parseContent(body.content ?? '')
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM notes WHERE user_id = ?').bind(user.id).first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_NOTES_PER_USER)
    throw new ApiError(400, `最多保存 ${MAX_NOTES_PER_USER} 条便签，请先删除一些`)
  const t = now()
  const row = await env.DB.prepare(
    'INSERT INTO notes (user_id, data, size, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
  ).bind(user.id, await encrypt(env, user.id, content), content.length, body.pinned === true ? 1 : 0, t, t).first<NoteRow>()
  return { ...meta(row!), title: deriveTitle(content) }
}

/**
 * 修改：content 与 pinned 可以分别传。
 * 修改正文时需带 baseVersion（编辑开始时的版本），与当前版本不一致返回 409；force 为 true 时直接覆盖。
 */
export async function updateNote(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id)
  const body = await readJson(req)
  const row = await getRow(env, user.id, id)
  const t = now()

  if (typeof body.pinned === 'boolean' && body.content === undefined) {
    const updated = await env.DB.prepare('UPDATE notes SET pinned = ? WHERE id = ? RETURNING *').bind(body.pinned ? 1 : 0, id).first<NoteRow>()
    return meta(updated!)
  }

  const content = parseContent(body.content)
  const base = Number(body.baseVersion)
  if (body.force !== true && base !== row.version)
    throw new ApiError(409, '这条便签已在其他设备上修改过')
  // 条件更新：并发保存时只有一个能成功
  const updated = await env.DB.prepare(
    `UPDATE notes SET data = ?, size = ?, version = version + 1, updated_at = ?${typeof body.pinned === 'boolean' ? ', pinned = ?' : ''}
      WHERE id = ? AND version = ? RETURNING *`,
  ).bind(...[await encrypt(env, user.id, content), content.length, t, ...(typeof body.pinned === 'boolean' ? [body.pinned ? 1 : 0] : []), id, row.version]).first<NoteRow>()
  if (!updated)
    throw new ApiError(409, '这条便签已在其他设备上修改过')
  return { ...meta(updated), title: deriveTitle(content) }
}

export async function deleteNote(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const res = await env.DB.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').bind(parseId(params.id), user.id).run()
  if (!res.meta.changes)
    throw new ApiError(404, '便签不存在或已删除')
  return null
}
