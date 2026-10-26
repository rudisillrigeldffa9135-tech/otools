import type { Env } from './lib'
import { insertUser, requireAdmin } from './auth'
import { hashPassword } from './crypto'
import { ApiError, isUniqueViolation, now, password, pbkdf2Iterations, readJson, role, str, username } from './lib'
import { deleteUserFiles } from './files'
import { deleteUserTodos } from './todo'
import { deleteUserAnniversaries } from './anniversary'
import { deleteUserNotifications } from './notify'

interface UserRow {
  id: number
  username: string
  nickname: string
  role: string
  disabled: number
  created_at: number
  item_count: number
  link_count: number
}

function parseId(id: string) {
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0)
    throw new ApiError(400, '无效的用户 ID')
  return n
}

export async function listUsers(req: Request, env: Env) {
  await requireAdmin(req, env)
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.username, u.nickname, u.role, u.disabled, u.created_at,
            (SELECT COUNT(*) FROM vault_items v WHERE v.user_id = u.id) AS item_count,
            (SELECT COUNT(*) FROM short_links l WHERE l.user_id = u.id) AS link_count
       FROM users u ORDER BY u.id`,
  ).all<UserRow>()
  return results.map(u => ({
    id: u.id,
    username: u.username,
    nickname: u.nickname,
    role: u.role,
    disabled: !!u.disabled,
    createdAt: u.created_at,
    itemCount: u.item_count,
    linkCount: u.link_count,
  }))
}

export async function createUser(req: Request, env: Env) {
  await requireAdmin(req, env)
  const body = await readJson(req)
  try {
    const id = await insertUser(env, {
      username: username(body.username),
      password: password(body.password),
      nickname: str(body.nickname, '昵称', { max: 32 }),
      role: body.role === undefined ? 'user' : role(body.role),
    })
    return { id }
  }
  catch (e) {
    if (isUniqueViolation(e))
      throw new ApiError(409, '用户名已存在')
    throw e
  }
}

/** 可选字段：nickname / role / disabled / password（重置密码） */
export async function updateUser(req: Request, env: Env, params: Record<string, string>) {
  const admin = await requireAdmin(req, env)
  const id = parseId(params.id)
  const body = await readJson(req)

  const sets: string[] = []
  const values: unknown[] = []
  let revokeSessions = false

  if (body.nickname !== undefined) {
    sets.push('nickname = ?')
    values.push(str(body.nickname, '昵称', { max: 32 }))
  }
  if (body.role !== undefined) {
    const r = role(body.role)
    // 禁止管理员降级 / 禁用 / 删除自己，保证系统里始终至少有一个可用的管理员
    if (id === admin.id && r !== 'admin')
      throw new ApiError(400, '不能取消自己的管理员身份')
    sets.push('role = ?')
    values.push(r)
  }
  if (body.disabled !== undefined) {
    if (typeof body.disabled !== 'boolean')
      throw new ApiError(400, 'disabled 必须是布尔值')
    if (id === admin.id && body.disabled)
      throw new ApiError(400, '不能禁用自己')
    sets.push('disabled = ?')
    values.push(body.disabled ? 1 : 0)
    revokeSessions ||= body.disabled
  }
  if (body.password !== undefined && body.password !== '') {
    sets.push('password_hash = ?', 'failed_logins = 0', 'locked_until = 0')
    values.push(await hashPassword(password(body.password), pbkdf2Iterations(env)))
    revokeSessions = true
  }
  if (!sets.length)
    throw new ApiError(400, '没有需要修改的字段')

  sets.push('updated_at = ?')
  values.push(now())
  const stmts = [env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...values, id)]
  if (revokeSessions)
    stmts.push(env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id))
  const [res] = await env.DB.batch(stmts)
  if (!res.meta.changes)
    throw new ApiError(404, '用户不存在')
  return null
}

/** 删除用户及其全部会话、密码库、短链、快传数据 */
export async function deleteUser(req: Request, env: Env, params: Record<string, string>) {
  const admin = await requireAdmin(req, env)
  const id = parseId(params.id)
  if (id === admin.id)
    throw new ApiError(400, '不能删除自己')
  // 先删 R2 里的文件，再删数据库记录
  await deleteUserFiles(env, id)
  await deleteUserTodos(env, id)
  await deleteUserAnniversaries(env, id)
  await deleteUserNotifications(env, id)
  const results = await env.DB.batch([
    env.DB.prepare('DELETE FROM vault_items WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM short_links WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM pastes WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM note_versions WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM notes WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM note_folders WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM rate_limits WHERE key = ?').bind(`paste:user:${id}`),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id),
  ])
  if (!results[results.length - 1].meta.changes)
    throw new ApiError(404, '用户不存在')
  return null
}
