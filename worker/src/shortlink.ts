import type { Env, SessionUser } from './lib'
import { requireUser } from './auth'
import { ApiError, isUniqueViolation, now, readJson, str } from './lib'

interface LinkRow {
  id: number
  user_id: number
  code: string
  url: string
  title: string
  clicks: number
  last_clicked_at: number
  expires_at: number
  disabled: number
  created_at: number
  updated_at: number
  owner?: string
}

const MAX_LINKS_PER_USER = 1000
const CODE_LENGTH = 6
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const MAX_EXPIRE_SECONDS = 10 * 365 * 24 * 3600

function parseId(id: string) {
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0)
    throw new ApiError(400, '无效的短链 ID')
  return n
}

/** 无偏差的随机短码 */
function randomCode() {
  const out: string[] = []
  const limit = 256 - (256 % CODE_CHARS.length)
  while (out.length < CODE_LENGTH) {
    for (const b of crypto.getRandomValues(new Uint8Array(CODE_LENGTH * 2))) {
      if (b < limit && out.length < CODE_LENGTH)
        out.push(CODE_CHARS[b % CODE_CHARS.length])
    }
  }
  return out.join('')
}

/** 只允许 http(s)，未写协议时补 https://；不允许指向本站短链，避免循环跳转 */
export function parseTarget(value: unknown, selfHost: string) {
  const raw = str(value, '链接', { required: true, max: 2000 }).trim()
  let url: URL
  try {
    url = new URL(/^[a-z][\w+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
  }
  catch {
    throw new ApiError(400, '链接格式不正确')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new ApiError(400, '只支持 http / https 链接')
  if (!url.hostname.includes('.') && url.hostname !== 'localhost')
    throw new ApiError(400, '链接格式不正确')
  if (url.host === selfHost && url.pathname.startsWith('/s/'))
    throw new ApiError(400, '不能指向本站的短链接')
  return url.toString()
}

function parseCode(value: unknown) {
  const code = str(value, '自定义后缀', { max: 32 }).trim()
  if (code && !/^[\w-]{3,32}$/.test(code))
    throw new ApiError(400, '自定义后缀需为 3~32 位字母、数字、下划线或短横线')
  return code
}

/** 过期时间：秒级时间戳，0 表示永久 */
function parseExpiresAt(value: unknown) {
  if (value === undefined || value === null || value === 0)
    return 0
  if (typeof value !== 'number' || !Number.isInteger(value))
    throw new ApiError(400, '过期时间格式不正确')
  const t = now()
  if (value <= t)
    throw new ApiError(400, '过期时间必须晚于当前时间')
  if (value > t + MAX_EXPIRE_SECONDS)
    throw new ApiError(400, '有效期最长 10 年')
  return value
}

function toItem(row: LinkRow, origin: string) {
  return {
    id: row.id,
    code: row.code,
    shortUrl: `${origin}/s/${row.code}`,
    url: row.url,
    title: row.title,
    clicks: row.clicks,
    lastClickedAt: row.last_clicked_at,
    expiresAt: row.expires_at,
    disabled: !!row.disabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.owner === undefined ? {} : { owner: row.owner }),
  }
}

/** 本人或管理员可以管理 */
async function findOwned(env: Env, user: SessionUser, id: number) {
  const row = await env.DB.prepare('SELECT * FROM short_links WHERE id = ?').bind(id).first<LinkRow>()
  if (!row || (row.user_id !== user.id && user.role !== 'admin'))
    throw new ApiError(404, '短链接不存在')
  return row
}

/** ?scope=all 时管理员可查看所有用户的短链（用于处理滥用） */
export async function listLinks(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const url = new URL(req.url)
  const all = url.searchParams.get('scope') === 'all'
  if (all && user.role !== 'admin')
    throw new ApiError(403, '需要管理员权限')
  const stmt = all
    ? env.DB.prepare(
        `SELECT l.*, u.username AS owner FROM short_links l JOIN users u ON u.id = l.user_id
          ORDER BY l.created_at DESC, l.id DESC`,
      )
    : env.DB.prepare('SELECT * FROM short_links WHERE user_id = ? ORDER BY created_at DESC, id DESC').bind(user.id)
  const { results } = await stmt.all<LinkRow>()
  return results.map(r => toItem(r, url.origin))
}

export async function createLink(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const origin = new URL(req.url)
  const body = await readJson(req)
  const target = parseTarget(body.url, origin.host)
  const custom = parseCode(body.code)
  const title = str(body.title, '备注', { max: 100 }).trim()
  const expiresAt = parseExpiresAt(body.expiresAt)

  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM short_links WHERE user_id = ?').bind(user.id).first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_LINKS_PER_USER)
    throw new ApiError(400, `最多创建 ${MAX_LINKS_PER_USER} 个短链接`)

  const t = now()
  // 随机短码碰撞时重试；自定义后缀冲突则直接提示
  for (let attempt = 0; attempt < (custom ? 1 : 5); attempt++) {
    const code = custom || randomCode()
    try {
      const row = await env.DB.prepare(
        `INSERT INTO short_links (user_id, code, url, title, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      ).bind(user.id, code, target, title, expiresAt, t, t).first<LinkRow>()
      return toItem(row!, origin.origin)
    }
    catch (e) {
      if (!isUniqueViolation(e))
        throw e
      if (custom)
        throw new ApiError(409, '该后缀已被使用，请换一个')
    }
  }
  throw new ApiError(500, '生成短码失败，请重试')
}

/** 可选字段：url / title / expiresAt / disabled；短码创建后不可修改 */
export async function updateLink(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const origin = new URL(req.url)
  const row = await findOwned(env, user, parseId(params.id))
  const body = await readJson(req)

  const sets: string[] = []
  const values: unknown[] = []
  if (body.url !== undefined) {
    sets.push('url = ?')
    values.push(parseTarget(body.url, origin.host))
  }
  if (body.title !== undefined) {
    sets.push('title = ?')
    values.push(str(body.title, '备注', { max: 100 }).trim())
  }
  if (body.expiresAt !== undefined) {
    sets.push('expires_at = ?')
    values.push(parseExpiresAt(body.expiresAt))
  }
  if (body.disabled !== undefined) {
    if (typeof body.disabled !== 'boolean')
      throw new ApiError(400, 'disabled 必须是布尔值')
    sets.push('disabled = ?')
    values.push(body.disabled ? 1 : 0)
  }
  if (!sets.length)
    throw new ApiError(400, '没有需要修改的字段')
  sets.push('updated_at = ?')
  values.push(now())
  const updated = await env.DB.prepare(`UPDATE short_links SET ${sets.join(', ')} WHERE id = ? RETURNING *`)
    .bind(...values, row.id)
    .first<LinkRow>()
  return toItem(updated!, origin.origin)
}

export async function deleteLink(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const row = await findOwned(env, user, parseId(params.id))
  await env.DB.prepare('DELETE FROM short_links WHERE id = ?').bind(row.id).run()
  return null
}

function messagePage(status: number, title: string, message: string) {
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>
:root{color-scheme:light dark;--bg:#f5f6f8;--card:#fff;--text:#1d2129;--muted:#86909c;--border:#e5e6eb}
@media (prefers-color-scheme:dark){:root{--bg:#111317;--card:#1b1e24;--text:#e6e8eb;--muted:#7d8590;--border:#2e333b}}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;
background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif}
.card{max-width:360px;width:100%;padding:32px 24px;border-radius:18px;background:var(--card);border:1px solid var(--border);text-align:center}
h1{font-size:20px;margin:0 0 8px}p{margin:0 0 20px;color:var(--muted);font-size:14px;line-height:1.6}
a{display:inline-block;padding:10px 20px;border-radius:10px;background:#4f6ef7;color:#fff;text-decoration:none;font-size:14px}
</style></head><body><div class="card"><h1>${title}</h1><p>${message}</p><a href="/">返回首页</a></div></body></html>`
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** GET /s/:code —— 302 跳转（不用 301，修改目标或停用后立即生效，点击数也能统计到） */
export async function redirect(req: Request, env: Env, ctx: ExecutionContext, code: string) {
  if (!/^[\w-]{3,32}$/.test(code))
    return messagePage(404, '短链接不存在', '请检查链接是否完整。')
  const row = await env.DB.prepare('SELECT id, url, expires_at, disabled FROM short_links WHERE code = ?')
    .bind(code)
    .first<Pick<LinkRow, 'id' | 'url' | 'expires_at' | 'disabled'>>()
  const t = now()
  if (!row)
    return messagePage(404, '短链接不存在', '请检查链接是否完整，或联系分享者。')
  if (row.disabled)
    return messagePage(410, '短链接已停用', '该短链接已被创建者或管理员停用。')
  if (row.expires_at && row.expires_at <= t)
    return messagePage(410, '短链接已过期', '该短链接已超过有效期。')
  // HEAD 请求（链接预检、爬虫探测）不计入点击
  if (req.method === 'GET') {
    ctx.waitUntil(
      env.DB.prepare('UPDATE short_links SET clicks = clicks + 1, last_clicked_at = ? WHERE id = ?').bind(t, row.id).run(),
    )
  }
  return new Response(null, {
    status: 302,
    headers: { 'location': row.url, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  })
}
