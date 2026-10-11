/**
 * OTools Cloudflare Worker 入口
 * - /api/*：认证、用户管理、密码库、短链、文本快传、我的 IP 等接口（D1 存储）
 * - /s/:code：短链跳转
 * - 其余请求：交给静态资源（H5 构建产物 dist/build/h5），见 wrangler.jsonc 的 assets 配置
 */
import type { Env } from './lib'
import * as admin from './admin'
import * as auth from './auth'
import { ApiError, fail, ok } from './lib'
import * as network from './network'
import * as paste from './paste'
import * as shortlink from './shortlink'
import * as vault from './vault'

type Handler = (req: Request, env: Env, params: Record<string, string>) => Promise<unknown>

interface Route {
  method: string
  pattern: RegExp
  keys: string[]
  handler: Handler
}

const routes: Route[] = []

/** 注册路由，path 支持 :param 占位 */
function route(method: string, path: string, handler: Handler) {
  const keys: string[] = []
  const pattern = new RegExp(`^${path.replace(/:(\w+)/g, (_, key) => {
    keys.push(key)
    return '([^/]+)'
  })}$`)
  routes.push({ method, pattern, keys, handler })
}

route('GET', '/api/auth/status', auth.status)
route('POST', '/api/auth/setup', auth.setup)
route('POST', '/api/auth/register', auth.register)
route('POST', '/api/auth/login', auth.login)
route('GET', '/api/auth/logout', auth.logout)
route('GET', '/api/user/info', auth.userInfo)
route('POST', '/api/user/password', auth.changePassword)

route('GET', '/api/admin/users', admin.listUsers)
route('POST', '/api/admin/users', admin.createUser)
route('PUT', '/api/admin/users/:id', admin.updateUser)
route('DELETE', '/api/admin/users/:id', admin.deleteUser)

route('GET', '/api/vault', vault.listItems)
route('POST', '/api/vault', vault.createItem)
route('GET', '/api/vault/:id', vault.getItem)
route('PUT', '/api/vault/:id', vault.updateItem)
route('DELETE', '/api/vault/:id', vault.deleteItem)

route('GET', '/api/links', shortlink.listLinks)
route('POST', '/api/links', shortlink.createLink)
route('PUT', '/api/links/:id', shortlink.updateLink)
route('DELETE', '/api/links/:id', shortlink.deleteLink)

route('GET', '/api/ip', network.myIp)

route('GET', '/api/pastes', paste.listPastes)
route('POST', '/api/pastes', paste.createPaste)
route('GET', '/api/pastes/:code', paste.getPaste)
route('DELETE', '/api/pastes/:code', paste.deletePaste)

async function handleApi(req: Request, env: Env, pathname: string) {
  let pathMatched = false
  for (const r of routes) {
    const m = pathname.match(r.pattern)
    if (!m)
      continue
    pathMatched = true
    if (r.method !== req.method)
      continue
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]))
    try {
      return ok(await r.handler(req, env, params))
    }
    catch (e) {
      if (e instanceof ApiError)
        return fail(e.status, e.message)
      console.error(e)
      return fail(500, '服务器内部错误')
    }
  }
  return pathMatched ? fail(405, '请求方法不支持') : fail(404, '接口不存在')
}

export default {
  async fetch(req, env, ctx) {
    const { pathname } = new URL(req.url)
    if (pathname === '/api' || pathname.startsWith('/api/'))
      return handleApi(req, env, pathname)
    // 短链跳转：/s/<code>，允许末尾带一个斜杠
    const short = pathname.match(/^\/s\/([^/]+)\/?$/)
    if (short && (req.method === 'GET' || req.method === 'HEAD')) {
      try {
        return await shortlink.redirect(req, env, ctx, decodeURIComponent(short[1]))
      }
      catch (e) {
        console.error(e)
        return new Response('服务暂时不可用', { status: 500 })
      }
    }
    return env.ASSETS.fetch(req)
  },
} satisfies ExportedHandler<Env>
