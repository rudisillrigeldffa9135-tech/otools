import type { Env } from './lib'
import { requireUser } from './auth'
import { decryptJson, encryptJson } from './crypto'
import { ApiError, now, readJson, str } from './lib'

/** 加密部分：密码与备注 */
interface VaultSecret {
  password: string
  notes: string
}

interface VaultRow {
  id: number
  name: string
  url: string
  username: string
  label: string
  secret: string
  created_at: number
  updated_at: number
}

const MAX_ITEMS_PER_USER = 2000

function parseId(id: string) {
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0)
    throw new ApiError(400, '无效的条目 ID')
  return n
}

function parseBody(body: Record<string, unknown>) {
  return {
    name: str(body.name, '网站名称', { required: true, max: 100 }).trim(),
    url: str(body.url, '网址', { max: 500 }).trim(),
    username: str(body.username, '账号', { max: 200 }),
    label: str(body.label, '账号备注', { max: 30 }).trim(),
    secret: {
      password: str(body.password, '密码', { max: 1000 }),
      notes: str(body.notes, '备注', { max: 5000 }),
    } satisfies VaultSecret,
  }
}

function toSummary(row: VaultRow) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    username: row.username,
    label: row.label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function encrypt(env: Env, userId: number, secret: VaultSecret) {
  try {
    return await encryptJson(env.VAULT_KEY, userId, secret)
  }
  catch (e) {
    console.error(e)
    throw new ApiError(500, '服务端加密失败，请检查 VAULT_KEY 配置')
  }
}

/** 列表不返回密码与备注，需要时按条目单独获取 */
export async function listItems(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const { results } = await env.DB.prepare(
    'SELECT id, name, url, username, label, created_at, updated_at FROM vault_items WHERE user_id = ? ORDER BY updated_at DESC, id DESC',
  ).bind(user.id).all<VaultRow>()
  return results.map(toSummary)
}

export async function getItem(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const row = await env.DB.prepare('SELECT * FROM vault_items WHERE id = ? AND user_id = ?')
    .bind(parseId(params.id), user.id)
    .first<VaultRow>()
  if (!row)
    throw new ApiError(404, '条目不存在')
  let secret: VaultSecret
  try {
    secret = await decryptJson<VaultSecret>(env.VAULT_KEY, user.id, row.secret)
  }
  catch (e) {
    console.error(e)
    throw new ApiError(500, '解密失败，VAULT_KEY 可能被更换过')
  }
  return { ...toSummary(row), ...secret }
}

export async function createItem(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const input = parseBody(await readJson(req))
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM vault_items WHERE user_id = ?').bind(user.id).first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_ITEMS_PER_USER)
    throw new ApiError(400, `最多保存 ${MAX_ITEMS_PER_USER} 条`)
  const t = now()
  const res = await env.DB.prepare(
    'INSERT INTO vault_items (user_id, name, url, username, label, secret, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(user.id, input.name, input.url, input.username, input.label, await encrypt(env, user.id, input.secret), t, t).run()
  return { id: Number(res.meta.last_row_id) }
}

export async function updateItem(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id)
  const input = parseBody(await readJson(req))
  const res = await env.DB.prepare(
    'UPDATE vault_items SET name = ?, url = ?, username = ?, label = ?, secret = ?, updated_at = ? WHERE id = ? AND user_id = ?',
  ).bind(input.name, input.url, input.username, input.label, await encrypt(env, user.id, input.secret), now(), id, user.id).run()
  if (!res.meta.changes)
    throw new ApiError(404, '条目不存在')
  return null
}

export async function deleteItem(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const res = await env.DB.prepare('DELETE FROM vault_items WHERE id = ? AND user_id = ?')
    .bind(parseId(params.id), user.id)
    .run()
  if (!res.meta.changes)
    throw new ApiError(404, '条目不存在')
  return null
}
