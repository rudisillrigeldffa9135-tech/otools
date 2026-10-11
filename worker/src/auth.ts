import type { Env, Role, SessionUser } from './lib'
import { hashPassword, randomToken, sha256Hex, verifyPassword } from './crypto'
import { ApiError, isUniqueViolation, now, password, pbkdf2Iterations, readJson, str, username } from './lib'

/** 会话有效期 7 天 */
export const SESSION_TTL = 7 * 24 * 3600
const MAX_FAILED_LOGINS = 5
const LOCK_SECONDS = 15 * 60

function bearerToken(req: Request) {
  const header = req.headers.get('Authorization') || ''
  const match = header.match(/^Bearer\s+(\S+)$/i)
  return match ? match[1] : ''
}

async function findSessionUser(env: Env, token: string) {
  return env.DB.prepare(
    `SELECT u.id, u.username, u.nickname, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0`,
  ).bind(await sha256Hex(token), now()).first<SessionUser>()
}

export async function requireUser(req: Request, env: Env): Promise<SessionUser> {
  const token = bearerToken(req)
  if (!token)
    throw new ApiError(401, '请先登录')
  const user = await findSessionUser(env, token)
  if (!user)
    throw new ApiError(401, '登录已过期，请重新登录')
  return user
}

/** 允许匿名访问的接口使用：已登录返回用户，未登录或会话失效返回 null */
export async function optionalUser(req: Request, env: Env): Promise<SessionUser | null> {
  const token = bearerToken(req)
  return token ? findSessionUser(env, token) : null
}

export async function requireAdmin(req: Request, env: Env) {
  const user = await requireUser(req, env)
  if (user.role !== 'admin')
    throw new ApiError(403, '需要管理员权限')
  return user
}

async function createSession(env: Env, userId: number) {
  const token = randomToken()
  const t = now()
  await env.DB.batch([
    // 顺手清理过期会话
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(t),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .bind(await sha256Hex(token), userId, t + SESSION_TTL, t),
  ])
  // 与前端单 token 模式的 ISingleTokenRes 一致
  return { token, expiresIn: SESSION_TTL }
}

/** 插入用户；onlyIfEmpty 为 true 时仅在用户表为空时插入（初始化管理员，避免并发重复初始化） */
export async function insertUser(env: Env, input: { username: string, password: string, nickname: string, role: Role }, onlyIfEmpty = false) {
  const t = now()
  const hash = await hashPassword(input.password, pbkdf2Iterations(env))
  const sql = onlyIfEmpty
    ? `INSERT INTO users (username, nickname, password_hash, role, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM users)`
    : `INSERT INTO users (username, nickname, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
  const res = await env.DB.prepare(sql)
    .bind(input.username, input.nickname || input.username, hash, input.role, t, t)
    .run()
  return res.meta.changes ? Number(res.meta.last_row_id) : 0
}

export async function status(_req: Request, env: Env) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>()
  return { initialized: (row?.n ?? 0) > 0, allowRegister: env.ALLOW_REGISTER === 'true' }
}

/** 首次部署：用户表为空时创建第一个管理员 */
export async function setup(req: Request, env: Env) {
  const body = await readJson(req)
  const id = await insertUser(env, {
    username: username(body.username),
    password: password(body.password),
    nickname: str(body.nickname, '昵称', { max: 32 }),
    role: 'admin',
  }, true)
  if (!id)
    throw new ApiError(409, '系统已初始化，请直接登录')
  return createSession(env, id)
}

export async function register(req: Request, env: Env) {
  if (env.ALLOW_REGISTER !== 'true')
    throw new ApiError(403, '未开放注册，请联系管理员创建账号')
  const body = await readJson(req)
  const input = {
    username: username(body.username),
    password: password(body.password),
    nickname: str(body.nickname, '昵称', { max: 32 }),
    role: 'user' as const,
  }
  // 用户表为空时注册的第一个人不应该是普通用户，引导走初始化
  if (!(await status(req, env)).initialized)
    throw new ApiError(409, '系统尚未初始化，请先创建管理员')
  try {
    return createSession(env, await insertUser(env, input))
  }
  catch (e) {
    if (isUniqueViolation(e))
      throw new ApiError(409, '用户名已存在')
    throw e
  }
}

export async function login(req: Request, env: Env) {
  const body = await readJson(req)
  const name = str(body.username, '用户名', { required: true, max: 32 }).trim()
  const pwd = str(body.password, '密码', { required: true, max: 128 })
  const user = await env.DB.prepare(
    'SELECT id, password_hash, disabled, failed_logins, locked_until FROM users WHERE username = ?',
  ).bind(name).first<{ id: number, password_hash: string, disabled: number, failed_logins: number, locked_until: number }>()

  const t = now()
  if (!user)
    throw new ApiError(400, '用户名或密码错误')
  if (user.locked_until > t)
    throw new ApiError(429, `密码错误次数过多，请 ${Math.ceil((user.locked_until - t) / 60)} 分钟后再试`)

  if (!(await verifyPassword(pwd, user.password_hash))) {
    const fails = user.failed_logins + 1
    const locked = fails >= MAX_FAILED_LOGINS
    await env.DB.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?')
      .bind(locked ? 0 : fails, locked ? t + LOCK_SECONDS : 0, user.id)
      .run()
    throw new ApiError(400, locked ? '密码错误次数过多，账号已锁定 15 分钟' : '用户名或密码错误')
  }
  if (user.disabled)
    throw new ApiError(403, '账号已被禁用，请联系管理员')

  if (user.failed_logins || user.locked_until)
    await env.DB.prepare('UPDATE users SET failed_logins = 0, locked_until = 0 WHERE id = ?').bind(user.id).run()
  return createSession(env, user.id)
}

/** 无需登录：token 已失效时前端也会调用，不能再返回 401，否则会和前端的 401 处理互相触发 */
export async function logout(req: Request, env: Env) {
  const token = bearerToken(req)
  if (token)
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run()
  return null
}

export async function userInfo(req: Request, env: Env) {
  const user = await requireUser(req, env)
  return { userId: user.id, username: user.username, nickname: user.nickname, role: user.role }
}

/** 修改自己的密码，并让其他设备上的会话失效 */
export async function changePassword(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const body = await readJson(req)
  const oldPwd = str(body.oldPassword, '原密码', { required: true, max: 128 })
  const newPwd = password(body.newPassword, '新密码')
  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string }>()
  if (!row || !(await verifyPassword(oldPwd, row.password_hash)))
    throw new ApiError(400, '原密码不正确')
  const currentHash = await sha256Hex(bearerToken(req))
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .bind(await hashPassword(newPwd, pbkdf2Iterations(env)), now(), user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(user.id, currentHash),
  ])
  return null
}
