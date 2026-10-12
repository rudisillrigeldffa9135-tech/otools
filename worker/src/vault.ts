import type { Env } from './lib'
import { requireUser } from './auth'
import { decryptJson, encryptJson } from './crypto'
import { evaluatePassword } from '../../src/pages-tools/vaultcheck/strength'
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
  password_updated_at: number
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

async function decryptSecret(env: Env, userId: number, row: VaultRow) {
  try {
    return await decryptJson<VaultSecret>(env.VAULT_KEY, userId, row.secret)
  }
  catch (e) {
    console.error(e)
    throw new ApiError(500, '解密失败，VAULT_KEY 可能被更换过')
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
  const secret = await decryptSecret(env, user.id, row)
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
    'INSERT INTO vault_items (user_id, name, url, username, label, has_totp, secret, password_updated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(user.id, input.name, input.url, input.username, input.label, input.secret.totp ? 1 : 0, await encrypt(env, user.id, input.secret), t, t, t).run()
  return { id: Number(res.meta.last_row_id) }
}

export async function updateItem(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id)
  const input = parseBody(await readJson(req))
  const old = await env.DB.prepare('SELECT * FROM vault_items WHERE id = ? AND user_id = ?').bind(id, user.id).first<VaultRow>()
  if (!old)
    throw new ApiError(404, '条目不存在')
  // 只有密码真的变了才更新「密码修改时间」，供密码体检判断是否长期未更换
  const t = now()
  const passwordChanged = (await decryptSecret(env, user.id, old)).password !== input.secret.password
  const res = await env.DB.prepare(
    'UPDATE vault_items SET name = ?, url = ?, username = ?, label = ?, has_totp = ?, secret = ?, password_updated_at = ?, updated_at = ? WHERE id = ? AND user_id = ?',
  ).bind(input.name, input.url, input.username, input.label, input.secret.totp ? 1 : 0, await encrypt(env, user.id, input.secret), passwordChanged ? t : old.password_updated_at, t, id, user.id).run()
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

/* ---------------- 密码体检 ---------------- */

/**
 * 在服务端逐条评估：强度、是否与其他条目重复、多久没改。
 * 返回结果里不含密码本身。
 */
export async function health(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const { results } = await env.DB.prepare('SELECT * FROM vault_items WHERE user_id = ? ORDER BY name, id')
    .bind(user.id)
    .all<VaultRow>()
  const secrets = await Promise.all(results.map(row => decryptSecret(env, user.id, row)))
  // 相同密码分组（空密码不算重复）
  const groups = new Map<string, number[]>()
  secrets.forEach((s, i) => {
    if (s.password)
      groups.set(s.password, [...(groups.get(s.password) ?? []), results[i].id])
  })
  const groupIndex = new Map<string, number>()
  let nextGroup = 1
  const t = now()
  return {
    checkedAt: t,
    items: results.map((row, i) => {
      const pw = secrets[i].password
      const same = pw ? groups.get(pw)! : []
      if (same.length > 1 && !groupIndex.has(pw))
        groupIndex.set(pw, nextGroup++)
      const strength = evaluatePassword(pw)
      const changedAt = row.password_updated_at || row.updated_at
      return {
        ...toSummary(row),
        empty: !pw,
        level: strength.level,
        reasons: strength.reasons,
        /** 与本条使用相同密码的其他条目 */
        reusedWith: same.filter(id => id !== row.id),
        reuseGroup: same.length > 1 ? groupIndex.get(pw)! : 0,
        passwordUpdatedAt: changedAt,
        passwordAgeDays: Math.floor((t - changedAt) / 86400),
      }
    }),
  }
}

const BREACH_BATCH = 40

async function sha1Hex(text: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text)))
  return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/**
 * 泄露检查（Have I Been Pwned 的 k-匿名接口）：只把 SHA-1 的前 5 位发给对方，
 * 对方返回该前缀下所有泄露过的哈希后缀，在本地比对。每次最多检查 40 条（免费套餐单次请求的子请求上限为 50）。
 */
export async function breach(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const body = await readJson(req)
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(Number).filter(n => Number.isInteger(n) && n > 0))] : []
  if (!ids.length || ids.length > BREACH_BATCH)
    throw new ApiError(400, `每次检查 1~${BREACH_BATCH} 条`)
  const { results } = await env.DB.prepare(`SELECT * FROM vault_items WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`)
    .bind(user.id, ...ids)
    .all<VaultRow>()
  const hashes = new Map<number, string>()
  for (const row of results) {
    const { password } = await decryptSecret(env, user.id, row)
    if (password)
      hashes.set(row.id, await sha1Hex(password))
  }
  const prefixes = [...new Set([...hashes.values()].map(h => h.slice(0, 5)))]
  const ranges = new Map<string, Map<string, number>>()
  await Promise.all(prefixes.map(async (prefix) => {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'OTools-Vault-Check' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok)
      throw new ApiError(502, `泄露数据库暂时无法访问（HTTP ${res.status}）`)
    const map = new Map<string, number>()
    for (const line of (await res.text()).split('\n')) {
      const [suffix, count] = line.trim().split(':')
      // 填充行的次数为 0
      if (suffix && Number(count) > 0)
        map.set(suffix, Number(count))
    }
    ranges.set(prefix, map)
  })).catch((e) => {
    if (e instanceof ApiError)
      throw e
    console.error('泄露检查失败', e)
    throw new ApiError(502, '泄露数据库暂时无法访问，请稍后重试')
  })
  return Object.fromEntries(ids.map((id) => {
    const h = hashes.get(id)
    return [id, h ? ranges.get(h.slice(0, 5))?.get(h.slice(5)) ?? 0 : 0]
  }))
}
