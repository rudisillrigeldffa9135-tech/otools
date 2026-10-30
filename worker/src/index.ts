/**
 * OTools Cloudflare Worker 入口
 * - /api/*：认证、用户管理、密码库、短链、文本 / 文件快传、便签、我的 IP、DNS、汇率、域名注册信息等接口（D1 + R2 存储）
 * - /api/webshell/relay：WebShell 的 WebSocket ↔ SSH 服务器 TCP 中转（Durable Object WebShellRelay）
 * - /s/:code：短链跳转
 * - /r/:code：文本快传的纯文本页面（类似 GitHub Raw）
 * - 其余请求：交给静态资源（H5 构建产物 dist/build/h5），见 wrangler.jsonc 的 assets 配置
 * - 定时任务（wrangler.jsonc 的 triggers.crons）：清理过期的文件、快传、限流记录与会话
 */
import type { Env } from './lib'
import * as admin from './admin'
import * as anniversary from './anniversary'
import * as auth from './auth'
import * as calendar from './calendar'
import * as dns from './dns'
import * as files from './files'
import { ApiError, fail, now, ok } from './lib'
import * as network from './network'
import * as notes from './notes'
import * as notify from './notify'
import * as paste from './paste'
import * as rates from './rates'
import * as shortlink from './shortlink'
import * as todo from './todo'
import * as vault from './vault'
import * as webshell from './webshell'
import * as whois from './whois'

export { WebShellRelay } from './webshell-relay'

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
// 固定路径要排在 /:id 之前
route('GET', '/api/vault/health', vault.health)
route('POST', '/api/vault/breach', vault.breach)
route('GET', '/api/vault/:id', vault.getItem)
route('PUT', '/api/vault/:id', vault.updateItem)
route('DELETE', '/api/vault/:id', vault.deleteItem)

route('GET', '/api/links', shortlink.listLinks)
route('POST', '/api/links', shortlink.createLink)
route('PUT', '/api/links/:id', shortlink.updateLink)
route('DELETE', '/api/links/:id', shortlink.deleteLink)

route('GET', '/api/notes', notes.listNotes)
route('POST', '/api/notes', notes.createNote)
route('GET', '/api/notes/:id', notes.getNote)
route('GET', '/api/notes/:id/versions', notes.listVersions)
route('DELETE', '/api/notes/:id/versions', notes.clearVersions)
route('GET', '/api/notes/:id/versions/:vid', notes.getVersion)
route('POST', '/api/notes/:id/versions/:vid/restore', notes.restoreVersion)
route('PUT', '/api/notes/:id', notes.updateNote)
route('DELETE', '/api/notes/:id', notes.deleteNote)
route('POST', '/api/notes/:id/share', notes.shareNote)
route('DELETE', '/api/notes/:id/share', notes.unshareNote)
route('GET', '/api/shared/notes/:code', notes.getSharedNote)
route('GET', '/api/note-folders', notes.listFolders)
route('POST', '/api/note-folders', notes.createFolder)
route('PUT', '/api/note-folders/:id', notes.renameFolder)
route('DELETE', '/api/note-folders/:id', notes.deleteFolder)

// 待办：固定路径要排在 /:id 之前
route('GET', '/api/todos', todo.overview)
route('POST', '/api/todos', todo.createTodo)
route('POST', '/api/todos/reorder', todo.reorderTodos)
route('DELETE', '/api/todos/done', todo.clearDone)
route('GET', '/api/todos/stats', todo.stats)
route('PUT', '/api/todos/:id', todo.updateTodo)
route('DELETE', '/api/todos/:id', todo.deleteTodo)
route('POST', '/api/todos/:id/complete', todo.completeTodo)
route('POST', '/api/todo-focus', todo.addFocus)
route('POST', '/api/todo-lists', todo.createList)
route('PUT', '/api/todo-lists/:id', todo.updateList)
route('DELETE', '/api/todo-lists/:id', todo.deleteList)
route('POST', '/api/todo-lists/:id/members', todo.addMember)
route('DELETE', '/api/todo-lists/:id/members/:userId', todo.removeMember)

route('GET', '/api/anniversaries', anniversary.listAnniversaries)
route('POST', '/api/anniversaries', anniversary.createAnniversary)
route('PUT', '/api/anniversaries/:id', anniversary.updateAnniversary)
route('DELETE', '/api/anniversaries/:id', anniversary.deleteAnniversary)
route('GET', '/api/anniversaries/:id/share', anniversary.getShare)
route('POST', '/api/anniversaries/:id/share', anniversary.shareAnniversary)
route('DELETE', '/api/anniversaries/:id/share', anniversary.unshareAnniversary)
route('POST', '/api/anniversaries/:id/background', anniversary.uploadBackground)
route('DELETE', '/api/anniversaries/:id/background', anniversary.deleteBackground)
route('GET', '/api/anniv-bg/:name', anniversary.serveBackground)
route('GET', '/api/shared/anniversaries/:code', anniversary.getSharedAnniversary)

route('GET', '/api/today', notify.today)
route('GET', '/api/notifications', notify.listNotifications)
route('GET', '/api/notifications/unread', notify.unreadCount)
route('POST', '/api/notifications/read', notify.readNotifications)
route('DELETE', '/api/notifications', notify.clearNotifications)
route('GET', '/api/push/key', notify.pushKey)
route('POST', '/api/push/subscribe', notify.subscribePush)
route('POST', '/api/push/unsubscribe', notify.unsubscribePush)
route('POST', '/api/push/test', notify.testPush)
route('GET', '/api/calendar', calendar.getCalendar)
route('POST', '/api/calendar', calendar.resetCalendar)
route('DELETE', '/api/calendar', calendar.disableCalendar)
route('GET', '/api/cal/:token', calendar.serveCalendar)

// WebShell：数据端到端加密，服务端只存密文
route('GET', '/api/webshell/vault', webshell.getVault)
route('POST', '/api/webshell/vault', webshell.createVault)
route('PUT', '/api/webshell/vault', webshell.updateVault)
route('DELETE', '/api/webshell/vault', webshell.resetVault)
route('GET', '/api/webshell/items', webshell.listItems)
route('PUT', '/api/webshell/items/:id', webshell.putItem)
route('DELETE', '/api/webshell/items/:id', webshell.deleteItem)
route('POST', '/api/webshell/ticket', webshell.createTicket)
route('GET', '/api/webshell/relay', webshell.relay)
route('POST', '/api/webshell/probe', webshell.probe)
route('GET', '/api/webshell/sessions', webshell.listSessions)

route('GET', '/api/ip', network.myIp)
route('GET', '/api/dns', dns.lookup)

route('GET', '/api/files', files.listFiles)
route('POST', '/api/files', files.uploadFile)
route('GET', '/api/files/:code', files.getFileInfo)
route('GET', '/api/files/:code/download', files.downloadFile)
route('DELETE', '/api/files/:code', files.deleteFile)

route('GET', '/api/rates', rates.getRates)
route('GET', '/api/whois', whois.whois)

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
      const result = await r.handler(req, env, params)
      // 文件下载等接口直接返回 Response
      return result instanceof Response ? result : ok(result)
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

/** 定时任务：派发到点的提醒；清理过期文件（含 R2 对象）、快传、便签历史版本、通知、限流计数、缓存与会话 */
async function cleanup(env: Env) {
  const t = now()
  const removedFiles = await files.cleanupExpiredFiles(env)
  await notes.cleanupNoteVersions(env)
  await todo.cleanupTodos(env)
  const reminded = await notify.dispatchReminders(env)
  await notify.cleanupNotifications(env)
  await webshell.cleanupWebshell(env)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM pastes WHERE expires_at > 0 AND expires_at <= ?').bind(t),
    env.DB.prepare('DELETE FROM rate_limits WHERE reset_at <= ?').bind(t),
    // 缓存过期后仍保留一天，供上游故障时兜底
    env.DB.prepare('DELETE FROM cache WHERE expires_at <= ?').bind(t - 86400),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(t),
  ])
  if (removedFiles)
    console.log(`定时清理：删除过期文件 ${removedFiles} 个`)
  if (reminded)
    console.log(`提醒：发出 ${reminded} 条`)
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(cleanup(env))
  },

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
    // 文本快传纯文本页面：/r/<取件码或链接码>
    const raw = pathname.match(/^\/r\/([^/]+)\/?$/)
    if (raw && (req.method === 'GET' || req.method === 'HEAD')) {
      try {
        return await paste.rawPaste(req, env, decodeURIComponent(raw[1]))
      }
      catch (e) {
        console.error(e)
        return new Response('服务暂时不可用', { status: 500 })
      }
    }
    return env.ASSETS.fetch(req)
  },
} satisfies ExportedHandler<Env>
