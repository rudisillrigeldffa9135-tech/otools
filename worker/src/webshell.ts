/**
 * WebShell 接口
 * - 加密数据同步：主密码参数、加密条目（服务端只存密文）
 * - 连接：先用登录态换一次性票据，再凭票据建立 WebSocket ↔ TCP 中转（由 Durable Object WebShellRelay 承载）
 * - 在线检测：从 Cloudflare 向服务器的 SSH 端口发起 TCP 连接，测量是否可达与耗时
 */
import type { Env } from './lib'
import { connect } from 'cloudflare:sockets'
import { requireUser } from './auth'
import { randomToken, sha256Hex } from './crypto'
import { ApiError, now, readJson, str } from './lib'
import { assertNotLimited, recordFailure } from './ratelimit'
import { isPrivateHost, normalizeHost, normalizePort } from './webshell-target'

const ITEM_KINDS = new Set(['host', 'group', 'snippet', 'key', 'known_host', 'settings'])
const MAX_ITEMS = 3000
const MAX_ITEM_SIZE = 256 * 1024
const TICKET_TTL = 30
/** 每人同时打开的中转连接数上限 */
export const MAX_ACTIVE_SESSIONS = 20
/** 中转连接超过这么久没有心跳，视为已断开（Durable Object 每分钟更新一次 last_seen） */
const SESSION_STALE = 180
const LOG_RETENTION = 30 * 86400

/* ---------------- 地址校验 ---------------- */

function target(env: Env, body: Record<string, unknown>) {
  const host = normalizeHost(body.host)
  const port = normalizePort(body.port)
  if (env.WEBSHELL_ALLOW_PRIVATE !== 'true' && isPrivateHost(host))
    throw new ApiError(400, '无法连接内网或本机地址，请使用服务器的公网 IP 或域名（内网服务器可经公网跳板机连接）')
  return { host, port }
}

/* ---------------- 主密码与加密条目 ---------------- */

interface VaultRow {
  kdf: string
  wrapped_key: string
  updated_at: number
}

function vaultInput(body: Record<string, unknown>) {
  const kdf = str(body.kdf, '密钥参数', { required: true, max: 1000 })
  const wrappedKey = str(body.wrappedKey, '数据密钥', { required: true, max: 1000 })
  try {
    JSON.parse(kdf)
  }
  catch {
    throw new ApiError(400, '密钥参数格式不正确')
  }
  return { kdf, wrappedKey }
}

export async function getVault(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const row = await env.DB.prepare('SELECT kdf, wrapped_key, updated_at FROM webshell_vaults WHERE user_id = ?').bind(user.id).first<VaultRow>()
  return row ? { kdf: row.kdf, wrappedKey: row.wrapped_key, updatedAt: row.updated_at } : null
}

export async function createVault(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const { kdf, wrappedKey } = vaultInput(await readJson(req))
  const t = now()
  const res = await env.DB.prepare('INSERT INTO webshell_vaults (user_id, kdf, wrapped_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id) DO NOTHING')
    .bind(user.id, kdf, wrappedKey, t, t)
    .run()
  if (!res.meta.changes)
    throw new ApiError(409, '已经设置过主密码，请刷新页面')
  return { updatedAt: t }
}

/** 修改主密码：数据密钥不变，只替换用新主密码加密后的数据密钥；expectUpdatedAt 防止两台设备同时修改 */
export async function updateVault(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const body = await readJson(req)
  const { kdf, wrappedKey } = vaultInput(body)
  const t = now()
  const res = await env.DB.prepare('UPDATE webshell_vaults SET kdf = ?, wrapped_key = ?, updated_at = ? WHERE user_id = ? AND updated_at = ?')
    .bind(kdf, wrappedKey, t, user.id, Number(body.expectUpdatedAt) || 0)
    .run()
  if (!res.meta.changes)
    throw new ApiError(409, '主密码已在其他设备上修改过，请刷新后重试')
  return { updatedAt: t }
}

/** 忘记主密码时重置：删除全部加密数据 */
export async function resetVault(req: Request, env: Env) {
  const user = await requireUser(req, env)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM webshell_items WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM webshell_vaults WHERE user_id = ?').bind(user.id),
  ])
  return null
}

interface ItemRow {
  id: string
  kind: string
  data: string
  rev: number
  updated_at: number
}

export async function listItems(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const { results } = await env.DB.prepare('SELECT id, kind, data, rev, updated_at FROM webshell_items WHERE user_id = ? ORDER BY updated_at').bind(user.id).all<ItemRow>()
  return results.map(r => ({ id: r.id, kind: r.kind, data: r.data, rev: r.rev, updatedAt: r.updated_at }))
}

function itemId(value: string) {
  if (!/^[\w-]{8,64}$/.test(value))
    throw new ApiError(400, '条目 ID 格式不正确')
  return value
}

/**
 * 新建或更新条目。rev 为 0 表示新建；否则必须与服务端当前版本一致，不一致返回 409，
 * 前端拿到最新数据后再决定如何合并。
 */
export async function putItem(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = itemId(params.id)
  const body = await readJson(req)
  const kind = str(body.kind, '类型', { required: true, max: 20 })
  if (!ITEM_KINDS.has(kind))
    throw new ApiError(400, '条目类型不正确')
  const data = str(body.data, '数据', { required: true, max: MAX_ITEM_SIZE })
  const rev = Number(body.rev) || 0
  const t = now()
  if (rev === 0) {
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM webshell_items WHERE user_id = ?').bind(user.id).first<{ n: number }>()
    if ((count?.n ?? 0) >= MAX_ITEMS)
      throw new ApiError(400, `最多保存 ${MAX_ITEMS} 个条目`)
    const res = await env.DB.prepare('INSERT INTO webshell_items (user_id, id, kind, data, rev, updated_at) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT (user_id, id) DO NOTHING')
      .bind(user.id, id, kind, data, t)
      .run()
    if (!res.meta.changes)
      throw new ApiError(409, '条目已存在')
    return { rev: 1, updatedAt: t }
  }
  const res = await env.DB.prepare('UPDATE webshell_items SET data = ?, rev = rev + 1, updated_at = ? WHERE user_id = ? AND id = ? AND kind = ? AND rev = ?')
    .bind(data, t, user.id, id, kind, rev)
    .run()
  if (!res.meta.changes)
    throw new ApiError(409, '数据已在其他设备上修改，请刷新后重试')
  return { rev: rev + 1, updatedAt: t }
}

export async function deleteItem(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  await env.DB.prepare('DELETE FROM webshell_items WHERE user_id = ? AND id = ?').bind(user.id, itemId(params.id)).run()
  return null
}

/* ---------------- 连接 ---------------- */

/** 签发一次性连接票据；同一用户 10 分钟内最多 200 次 */
export async function createTicket(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const { host, port } = target(env, await readJson(req))
  const limitKey = `webshell:ticket:${user.id}`
  await assertNotLimited(env, limitKey, 200)
  await recordFailure(env, limitKey, 600)
  const active = await env.DB.prepare('SELECT COUNT(*) AS n FROM webshell_sessions WHERE user_id = ? AND ended_at = 0 AND last_seen > ?')
    .bind(user.id, now() - SESSION_STALE)
    .first<{ n: number }>()
  if ((active?.n ?? 0) >= MAX_ACTIVE_SESSIONS)
    throw new ApiError(429, `同时最多 ${MAX_ACTIVE_SESSIONS} 个连接，请先关闭一些会话`)
  const ticket = randomToken()
  const t = now()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM webshell_tickets WHERE expires_at <= ?').bind(t),
    env.DB.prepare('INSERT INTO webshell_tickets (token_hash, user_id, host, port, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(await sha256Hex(ticket), user.id, host, port, t + TICKET_TTL),
  ])
  return { ticket, expiresIn: TICKET_TTL }
}

/** WebSocket 中转入口：核销票据、记录连接，然后交给一个新的 Durable Object 处理 */
export async function relay(req: Request, env: Env) {
  if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
    throw new ApiError(426, '需要 WebSocket 连接')
  if (!env.WEBSHELL_RELAY)
    throw new ApiError(503, '服务端未启用 WebShell 中转')
  const ticket = new URL(req.url).searchParams.get('t') || ''
  const row = ticket
    ? await env.DB.prepare('DELETE FROM webshell_tickets WHERE token_hash = ? RETURNING user_id, host, port, expires_at')
        .bind(await sha256Hex(ticket))
        .first<{ user_id: number, host: string, port: number, expires_at: number }>()
    : null
  if (!row || row.expires_at <= now())
    throw new ApiError(401, '连接票据无效或已过期，请重新连接')
  const t = now()
  const log = await env.DB.prepare('INSERT INTO webshell_sessions (user_id, host, port, client_ip, started_at, last_seen) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(row.user_id, row.host, row.port, req.headers.get('CF-Connecting-IP') || '', t, t)
    .first<{ id: number }>()
  const url = new URL('https://relay/')
  url.searchParams.set('host', row.host)
  url.searchParams.set('port', String(row.port))
  url.searchParams.set('log', String(log?.id ?? 0))
  const stub = env.WEBSHELL_RELAY.get(env.WEBSHELL_RELAY.newUniqueId())
  return stub.fetch(new Request(url, { headers: req.headers }))
}

/** 连接失败的原因转成中文提示 */
export function describeConnectError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  if (/refused/i.test(msg))
    return '服务器拒绝连接，请检查端口与 SSH 服务是否开启'
  if (/timed? ?out/i.test(msg))
    return '连接超时，请检查地址、端口与防火墙'
  if (/cannot connect to the specified address|proxy request failed|blocked|not allowed/i.test(msg))
    return '无法连接：端口未开放、被防火墙拦截，或是内网 / Cloudflare 网段的地址'
  if (/dns|resolve|lookup|ENOTFOUND/i.test(msg))
    return '域名解析失败'
  return `无法连接：${msg}`
}

/** 带超时地建立 TCP 连接 */
export async function openSocket(host: string, port: number, timeoutMs: number) {
  const socket = connect({ hostname: host, port })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      socket.opened,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out')), timeoutMs)
      }),
    ])
    return socket
  }
  catch (e) {
    socket.close().catch(() => {})
    throw e
  }
  finally {
    if (timer)
      clearTimeout(timer)
  }
}

/**
 * 在线检测：最多 30 个地址，每批 6 个并发（Workers 同时外连上限），单个超时 4 秒。
 * 只建立 TCP 连接立即关闭，不进行 SSH 握手。
 */
export async function probe(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const body = await readJson(req)
  if (!Array.isArray(body.targets) || body.targets.length > 30)
    throw new ApiError(400, '一次最多检测 30 个地址')
  const limitKey = `webshell:probe:${user.id}`
  await assertNotLimited(env, limitKey, 120)
  await recordFailure(env, limitKey, 600)
  const targets = body.targets.map((x: any) => {
    try {
      return target(env, x ?? {})
    }
    catch (e) {
      return { error: e instanceof ApiError ? e.message : '地址不正确' }
    }
  })
  const out: { ok: boolean, ms?: number, error?: string }[] = []
  for (let i = 0; i < targets.length; i += 6) {
    out.push(...await Promise.all(targets.slice(i, i + 6).map(async (x: any) => {
      if (x.error)
        return { ok: false, error: x.error }
      const start = Date.now()
      try {
        const socket = await openSocket(x.host, x.port, 4000)
        const ms = Date.now() - start
        socket.close().catch(() => {})
        return { ok: true, ms }
      }
      catch (e) {
        return { ok: false, error: describeConnectError(e) }
      }
    })))
  }
  return out
}

/** 本人最近 50 条连接记录 */
export async function listSessions(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const { results } = await env.DB.prepare(
    `SELECT id, host, port, client_ip, started_at, last_seen, ended_at, bytes_in, bytes_out, error
       FROM webshell_sessions WHERE user_id = ? ORDER BY id DESC LIMIT 50`,
  ).bind(user.id).all<Record<string, number | string>>()
  const stale = now() - SESSION_STALE
  return results.map(r => ({
    id: r.id,
    host: r.host,
    port: r.port,
    clientIp: r.client_ip,
    startedAt: r.started_at,
    endedAt: r.ended_at || (Number(r.last_seen) < stale ? r.last_seen : 0),
    bytesIn: r.bytes_in,
    bytesOut: r.bytes_out,
    error: r.error,
  }))
}

/** 定时清理：过期票据、30 天前的连接记录，长时间没有心跳的连接标记为已结束 */
export async function cleanupWebshell(env: Env) {
  const t = now()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM webshell_tickets WHERE expires_at <= ?').bind(t),
    env.DB.prepare('DELETE FROM webshell_sessions WHERE started_at <= ?').bind(t - LOG_RETENTION),
    env.DB.prepare('UPDATE webshell_sessions SET ended_at = last_seen WHERE ended_at = 0 AND last_seen <= ?').bind(t - SESSION_STALE),
  ])
}

export async function deleteUserWebshell(env: Env, userId: number) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM webshell_items WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM webshell_vaults WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM webshell_tickets WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM webshell_sessions WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM rate_limits WHERE key IN (?, ?)').bind(`webshell:ticket:${userId}`, `webshell:probe:${userId}`),
  ])
}
