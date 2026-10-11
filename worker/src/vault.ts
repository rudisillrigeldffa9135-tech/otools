import type { Env } from './lib'
import { requireUser } from './auth'
import { decryptJson, encryptJson } from './crypto'
import { ApiError, now, readJson, str } from './lib'

/** 加密部分：密码、备注与两步验证密钥 */
interface VaultSecret {
  password: string
  notes: string
  /** Base32 密钥或 otpauth:// 链接；旧数据没有此字段 */
  totp?: string
}

interface VaultRow {
  id: number
  name: string
  url: string
  username: string
  label: string
  has_totp: number
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

/** 两步验证密钥：Base32（允许空格分组）或 otpauth://totp/ 链接，具体解析由前端完成 */
function parseTotp(value: unknown) {
  const v = str(value, '两步验证密钥', { max: 1000 }).trim()
  if (v && !/^otpauth:\/\/totp\//i.test(v) && !/^[A-Z2-7=\s]+$/i.test(v))
    throw new ApiError(400, '两步验证密钥格式不正确，应为 Base32 密钥或 otpauth:// 链接')
  return v
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
      totp: parseTotp(body.totp),
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
    hasTotp: !!row.has_totp,
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
    'SELECT id, name, url, username, label, has_totp, created_at, updated_at FROM vault_items WHERE user_id = ? ORDER BY updated_at DESC, id DESC',
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
  // 旧数据没有 totp 字段
  return { ...toSummary(row), ...secret, totp: secret.totp ?? '' }
}

export async function createItem(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const input = parseBody(await readJson(req))
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM vault_items WHERE user_id = ?').bind(user.id).first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_ITEMS_PER_USER)
    throw new ApiError(400, `最多保存 ${MAX_ITEMS_PER_USER} 条`)
  const t = now()
  const res = await env.DB.prepare(
    'INSERT INTO vault_items (user_id, name, url, username, label, has_totp, secret, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(user.id, input.name, input.url, input.username, input.label, input.secret.totp ? 1 : 0, await encrypt(env, user.id, input.secret), t, t).run()
  return { id: Number(res.meta.last_row_id) }
}

export async function updateItem(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id)
  const input = parseBody(await readJson(req))
  const res = await env.DB.prepare(
    'UPDATE vault_items SET name = ?, url = ?, username = ?, label = ?, has_totp = ?, secret = ?, updated_at = ? WHERE id = ? AND user_id = ?',
  ).bind(input.name, input.url, input.username, input.label, input.secret.totp ? 1 : 0, await encrypt(env, user.id, input.secret), now(), id, user.id).run()
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
