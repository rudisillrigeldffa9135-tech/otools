import type { Env } from './lib'
import { requireUser } from './auth'
import { ApiError, now, ok, readJson, str } from './lib'

export interface SubjectRow {
  id: number
  user_id: number
  type: string
  name: string
  masked_value: string
  secret_data: string
  sort: number
  created_at: number
  updated_at: number
}

export interface AccountRow {
  id: number
  user_id: number
  subject_id: number | null
  platform: string
  account_name: string
  login_url: string
  icon: string
  created_at: number
  updated_at: number
}

export interface AssetRow {
  id: number
  user_id: number
  account_id: number
  category: string
  name: string
  tags: string
  expire_at: number
  cost_cycle: string
  status: string
  extra: string
  created_at: number
  updated_at: number
}

function parseId(id: string, label = 'ID') {
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0)
    throw new ApiError(400, `无效的${label}`)
  return n
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  }
  catch {
    return fallback
  }
}

/** 格式化输出 */
function formatSubject(row: SubjectRow) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    maskedValue: row.masked_value,
    secretData: row.secret_data,
    sort: row.sort,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function formatAccount(row: AccountRow) {
  return {
    id: row.id,
    subjectId: row.subject_id,
    platform: row.platform,
    accountName: row.account_name,
    loginUrl: row.login_url,
    icon: row.icon,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function formatAsset(row: AssetRow) {
  return {
    id: row.id,
    accountId: row.account_id,
    category: row.category,
    name: row.name,
    tags: safeJsonParse<string[]>(row.tags, []),
    expireAt: row.expire_at,
    costCycle: row.cost_cycle,
    status: row.status,
    extra: safeJsonParse<Record<string, unknown>>(row.extra, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/* ---------------- 全量概览 ---------------- */

export async function overview(req: Request, env: Env) {
  const user = await requireUser(req, env)

  const [subjectsRes, accountsRes, assetsRes] = await Promise.all([
    env.DB.prepare(
      'SELECT * FROM whereis_subjects WHERE user_id = ?1 ORDER BY sort ASC, id ASC',
    ).bind(user.id).all<SubjectRow>(),
    env.DB.prepare(
      'SELECT * FROM whereis_accounts WHERE user_id = ?1 ORDER BY id ASC',
    ).bind(user.id).all<AccountRow>(),
    env.DB.prepare(
      'SELECT * FROM whereis_assets WHERE user_id = ?1 ORDER BY id DESC',
    ).bind(user.id).all<AssetRow>(),
  ])

  return ok({
    subjects: subjectsRes.results.map(formatSubject),
    accounts: accountsRes.results.map(formatAccount),
    assets: assetsRes.results.map(formatAsset),
  })
}

/* ---------------- 主体 Subject ---------------- */

export async function createSubject(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const body = await readJson(req)

  const type = str(body.type, '主体类型', { required: true, max: 30 })
  const name = str(body.name, '主体名称', { required: true, max: 100 })
  const maskedValue = str(body.maskedValue, '展示值', { max: 100 })
  const secretData = str(body.secretData, '保密信息', { max: 5000 })
  const sort = typeof body.sort === 'number' ? body.sort : 0
  const t = now()

  const res = await env.DB.prepare(
    `INSERT INTO whereis_subjects (user_id, type, name, masked_value, secret_data, sort, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`,
  ).bind(user.id, type, name, maskedValue, secretData, sort, t).run()

  return ok({ id: res.meta.last_row_id })
}

export async function updateSubject(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id, '主体 ID')
  const body = await readJson(req)

  const type = str(body.type, '主体类型', { required: true, max: 30 })
  const name = str(body.name, '主体名称', { required: true, max: 100 })
  const maskedValue = str(body.maskedValue, '展示值', { max: 100 })
  const secretData = str(body.secretData, '保密信息', { max: 5000 })
  const sort = typeof body.sort === 'number' ? body.sort : 0
  const t = now()

  const res = await env.DB.prepare(
    `UPDATE whereis_subjects
     SET type = ?1, name = ?2, masked_value = ?3, secret_data = ?4, sort = ?5, updated_at = ?6
     WHERE id = ?7 AND user_id = ?8`,
  ).bind(type, name, maskedValue, secretData, sort, t, id, user.id).run()

  if (!res.meta.changes)
    throw new ApiError(404, '主体不存在')

  return ok()
}

export async function deleteSubject(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id, '主体 ID')

  const res = await env.DB.prepare(
    'DELETE FROM whereis_subjects WHERE id = ?1 AND user_id = ?2',
  ).bind(id, user.id).run()

  if (!res.meta.changes)
    throw new ApiError(404, '主体不存在')

  return ok()
}

/* ---------------- 平台账号 Account ---------------- */

export async function createAccount(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const body = await readJson(req)

  const platform = str(body.platform, '平台名称', { required: true, max: 100 })
  const accountName = str(body.accountName, '账号名称', { max: 200 })
  const loginUrl = str(body.loginUrl, '登录入口', { max: 500 })
  const icon = str(body.icon, '图标', { max: 100 })
  const subjectId = body.subjectId ? parseId(String(body.subjectId), '主体 ID') : null
  const t = now()

  if (subjectId) {
    const subject = await env.DB.prepare(
      'SELECT id FROM whereis_subjects WHERE id = ?1 AND user_id = ?2',
    ).bind(subjectId, user.id).first()
    if (!subject)
      throw new ApiError(400, '关联的主体不存在')
  }

  const res = await env.DB.prepare(
    `INSERT INTO whereis_accounts (user_id, subject_id, platform, account_name, login_url, icon, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`,
  ).bind(user.id, subjectId, platform, accountName, loginUrl, icon, t).run()

  return ok({ id: res.meta.last_row_id })
}

export async function updateAccount(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id, '平台账号 ID')
  const body = await readJson(req)

  const platform = str(body.platform, '平台名称', { required: true, max: 100 })
  const accountName = str(body.accountName, '账号名称', { max: 200 })
  const loginUrl = str(body.loginUrl, '登录入口', { max: 500 })
  const icon = str(body.icon, '图标', { max: 100 })
  const subjectId = body.subjectId ? parseId(String(body.subjectId), '主体 ID') : null
  const t = now()

  if (subjectId) {
    const subject = await env.DB.prepare(
      'SELECT id FROM whereis_subjects WHERE id = ?1 AND user_id = ?2',
    ).bind(subjectId, user.id).first()
    if (!subject)
      throw new ApiError(400, '关联的主体不存在')
  }

  const res = await env.DB.prepare(
    `UPDATE whereis_accounts
     SET subject_id = ?1, platform = ?2, account_name = ?3, login_url = ?4, icon = ?5, updated_at = ?6
     WHERE id = ?7 AND user_id = ?8`,
  ).bind(subjectId, platform, accountName, loginUrl, icon, t, id, user.id).run()

  if (!res.meta.changes)
    throw new ApiError(404, '平台账号不存在')

  return ok()
}

export async function deleteAccount(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id, '平台账号 ID')

  const res = await env.DB.prepare(
    'DELETE FROM whereis_accounts WHERE id = ?1 AND user_id = ?2',
  ).bind(id, user.id).run()

  if (!res.meta.changes)
    throw new ApiError(404, '平台账号不存在')

  return ok()
}

/* ---------------- 具体资产 Asset ---------------- */

export async function createAsset(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const body = await readJson(req)

  const accountId = parseId(String(body.accountId), '平台账号 ID')
  const name = str(body.name, '资产名称', { required: true, max: 200 })
  const category = str(body.category, '资产类别', { required: true, max: 50 })
  const costCycle = str(body.costCycle, '费用周期', { max: 100 })
  const status = str(body.status, '状态', { max: 50 }) || 'active'
  const expireAt = typeof body.expireAt === 'number' ? body.expireAt : 0
  const tags = Array.isArray(body.tags) ? JSON.stringify(body.tags.map(t => String(t).slice(0, 30))) : '[]'
  const extra = body.extra && typeof body.extra === 'object' ? JSON.stringify(body.extra) : '{}'
  const t = now()

  // 验证平台账号属于该用户
  const acc = await env.DB.prepare(
    'SELECT id FROM whereis_accounts WHERE id = ?1 AND user_id = ?2',
  ).bind(accountId, user.id).first()
  if (!acc)
    throw new ApiError(400, '所选平台账号不存在')

  const res = await env.DB.prepare(
    `INSERT INTO whereis_assets (user_id, account_id, category, name, tags, expire_at, cost_cycle, status, extra, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`,
  ).bind(user.id, accountId, category, name, tags, expireAt, costCycle, status, extra, t).run()

  return ok({ id: res.meta.last_row_id })
}

export async function updateAsset(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id, '资产 ID')
  const body = await readJson(req)

  const accountId = parseId(String(body.accountId), '平台账号 ID')
  const name = str(body.name, '资产名称', { required: true, max: 200 })
  const category = str(body.category, '资产类别', { required: true, max: 50 })
  const costCycle = str(body.costCycle, '费用周期', { max: 100 })
  const status = str(body.status, '状态', { max: 50 }) || 'active'
  const expireAt = typeof body.expireAt === 'number' ? body.expireAt : 0
  const tags = Array.isArray(body.tags) ? JSON.stringify(body.tags.map(t => String(t).slice(0, 30))) : '[]'
  const extra = body.extra && typeof body.extra === 'object' ? JSON.stringify(body.extra) : '{}'
  const t = now()

  // 验证平台账号属于该用户
  const acc = await env.DB.prepare(
    'SELECT id FROM whereis_accounts WHERE id = ?1 AND user_id = ?2',
  ).bind(accountId, user.id).first()
  if (!acc)
    throw new ApiError(400, '所选平台账号不存在')

  const res = await env.DB.prepare(
    `UPDATE whereis_assets
     SET account_id = ?1, category = ?2, name = ?3, tags = ?4, expire_at = ?5, cost_cycle = ?6, status = ?7, extra = ?8, updated_at = ?9
     WHERE id = ?10 AND user_id = ?11`,
  ).bind(accountId, category, name, tags, expireAt, costCycle, status, extra, t, id, user.id).run()

  if (!res.meta.changes)
    throw new ApiError(404, '资产不存在')

  return ok()
}

export async function deleteAsset(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id, '资产 ID')

  const res = await env.DB.prepare(
    'DELETE FROM whereis_assets WHERE id = ?1 AND user_id = ?2',
  ).bind(id, user.id).run()

  if (!res.meta.changes)
    throw new ApiError(404, '资产不存在')

  return ok()
}
