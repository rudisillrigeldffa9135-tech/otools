import type { AnnivRow } from './anniversary'
import type { Env } from './lib'
import type { PushTarget, VapidKeys } from './webpush'
import { nextOccurrence, summarize } from '../../src/pages-tools/anniversary/calc'
import { weekday } from '../../src/pages-tools/datecalc/date'
import { todayIn } from '../../src/pages-tools/todo/repeat'
import { dueLabel } from '../../src/pages-tools/todo/views'
import { computeNextRemind, decryptAnniv, ruleOf } from './anniversary'
import { requireUser } from './auth'
import { decryptJson, encryptJson } from './crypto'
import { ApiError, now, readJson } from './lib'
import { sendPush } from './webpush'

/**
 * 提醒：定时任务把到点的待办提醒、纪念日提醒、里程碑生成站内通知（加密保存），并推送到已订阅的浏览器。
 */

export interface NotifyContent {
  title: string
  body: string
  /** 站内页面路径，如 /pages-tools/todo/index */
  path: string
}

interface NotificationRow {
  id: number
  user_id: number
  kind: string
  ref_id: number | null
  data: string
  read_at: number
  created_at: number
}

interface PushRow {
  id: number
  user_id: number
  endpoint: string
  p256dh: string
  auth: string
  origin: string
  fail_count: number
}

const KEEP_DAYS = 30
const MAX_PER_USER = 200
const MAX_SUBSCRIPTIONS = 10
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function vapid(env: Env, subject: string): VapidKeys | null {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY)
    return null
  return { privateKey: env.VAPID_PRIVATE_KEY, publicKey: env.VAPID_PUBLIC_KEY, subject }
}

/** 生成站内通知并推送到该用户的所有浏览器 */
export async function notify(env: Env, userId: number, kind: string, refId: number | null, content: NotifyContent) {
  const t = now()
  await env.DB.prepare('INSERT INTO notifications (user_id, kind, ref_id, data, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, kind, refId, await encryptJson(env.VAULT_KEY, userId, content), t)
    .run()
  await push(env, userId, { ...content, tag: `${kind}-${refId ?? t}` })
}

async function push(env: Env, userId: number, content: NotifyContent & { tag: string }) {
  const { results } = await env.DB.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').bind(userId).all<PushRow>()
  for (const sub of results) {
    const keys = vapid(env, sub.origin)
    if (!keys)
      return
    const target: PushTarget = { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }
    const result = await sendPush(target, { title: content.title, body: content.body, url: `${sub.origin}/#${content.path}`, tag: content.tag }, keys)
    if (result === 'gone' || (result === 'error' && sub.fail_count >= 9))
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run()
    else if (result === 'error')
      await env.DB.prepare('UPDATE push_subscriptions SET fail_count = fail_count + 1 WHERE id = ?').bind(sub.id).run()
    else if (sub.fail_count)
      await env.DB.prepare('UPDATE push_subscriptions SET fail_count = 0 WHERE id = ?').bind(sub.id).run()
  }
}

/* ---------------- 定时任务：派发到点的提醒 ---------------- */

interface DueTodo {
  id: number
  list_id: number | null
  user_id: number
  key_owner_id: number
  data: string
  due_date: string
  due_time: string | null
  remind_at: number
  tz_offset: number
}

/** 提醒时间已过去超过这么久（例如服务暂停期间）的不再补发 */
const STALE = 6 * 3600

export async function dispatchReminders(env: Env, nowSec = now()) {
  let sent = 0
  // 待办
  const { results: todos } = await env.DB.prepare(
    'SELECT id, list_id, user_id, key_owner_id, data, due_date, due_time, remind_at, tz_offset FROM todos WHERE remind_at > 0 AND remind_at <= ? AND reminded = 0 AND done = 0 LIMIT 100',
  ).bind(nowSec).all<DueTodo>()
  for (const t of todos) {
    await env.DB.prepare('UPDATE todos SET reminded = 1 WHERE id = ?').bind(t.id).run()
    if (t.remind_at < nowSec - STALE)
      continue
    const { title } = await decryptJson<{ title: string }>(env.VAULT_KEY, t.key_owner_id, t.data)
    // 共享清单：提醒清单里的所有人
    const recipients = t.list_id
      ? (await env.DB.prepare('SELECT owner_id AS id FROM todo_lists WHERE id = ?1 UNION SELECT user_id FROM todo_list_members WHERE list_id = ?1').bind(t.list_id).all<{ id: number }>()).results.map(r => r.id)
      : [t.user_id]
    const body = `${dueLabel(t.due_date, t.due_time, todayIn(t.tz_offset, nowSec * 1000))} 到期`
    for (const uid of recipients) {
      await notify(env, uid, 'todo', t.id, { title: `待办：${title}`, body, path: '/pages-tools/todo/index' })
      sent++
    }
  }

  // 纪念日
  const { results: annivs } = await env.DB.prepare('SELECT * FROM anniversaries WHERE next_remind_at > 0 AND next_remind_at <= ? LIMIT 100').bind(nowSec).all<AnnivRow>()
  for (const a of annivs) {
    // 先算出这一次是什么提醒（按提醒时刻前一秒计算），再把下一次写回
    const plan = computeNextRemind(a, (a.next_remind_at - 1) * 1000)
    const next = computeNextRemind(a, nowSec * 1000 + 1000)
    await env.DB.prepare('UPDATE anniversaries SET next_remind_at = ? WHERE id = ?').bind(next?.at ?? 0, a.id).run()
    if (!plan || a.next_remind_at < nowSec - STALE)
      continue
    const { title, emoji } = await decryptAnniv(env, a)
    const name = `${emoji ? `${emoji} ` : ''}${title}`
    const rule = ruleOf(a)
    let content: NotifyContent
    if (plan.kind === 'milestone') {
      content = { title: `「${name}」第 ${plan.day} 天`, body: `${plan.date} ${WEEK[weekday(plan.date)]} · 里程碑`, path: '/pages-tools/anniversary/index' }
    }
    else {
      const occ = nextOccurrence(rule, plan.date)
      const nth = rule.repeat && rule.date.year && occ ? occ.cycle - rule.date.year : 0
      const nthText = nth > 0 ? (a.category === 'birthday' ? `${nth} 岁生日` : `${nth} 周年`) : ''
      content = plan.daysBefore === 0
        ? { title: `今天是「${name}」`, body: nthText || `${plan.date} ${WEEK[weekday(plan.date)]}`, path: '/pages-tools/anniversary/index' }
        : { title: `「${name}」还有 ${plan.daysBefore} 天`, body: `${plan.date} ${WEEK[weekday(plan.date)]}${nthText ? ` · ${nthText}` : ''}`, path: '/pages-tools/anniversary/index' }
    }
    await notify(env, a.user_id, plan.kind === 'milestone' ? 'milestone' : 'anniversary', a.id, content)
    sent++
  }
  return sent
}

/** 清理：30 天前的通知、每人只保留最近 200 条 */
export async function cleanupNotifications(env: Env) {
  await env.DB.prepare('DELETE FROM notifications WHERE created_at < ?').bind(now() - KEEP_DAYS * 86400).run()
  await env.DB.prepare(
    `DELETE FROM notifications WHERE id IN (
       SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn FROM notifications) WHERE rn > ?)`,
  ).bind(MAX_PER_USER).run()
}

/* ---------------- 接口：站内通知 ---------------- */

export async function listNotifications(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const { results } = await env.DB.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50').bind(user.id).all<NotificationRow>()
  const unread = await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at = 0').bind(user.id).first<{ n: number }>()
  return {
    items: await Promise.all(results.map(async (r) => {
      const c = await decryptJson<NotifyContent>(env.VAULT_KEY, user.id, r.data)
      return { id: r.id, kind: r.kind, refId: r.ref_id, title: c.title, body: c.body, path: c.path, read: !!r.read_at, createdAt: r.created_at }
    })),
    unread: unread?.n ?? 0,
  }
}

/** 未读数（顶栏铃铛用，不解密内容） */
export async function unreadCount(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at = 0').bind(user.id).first<{ n: number }>()
  return { unread: row?.n ?? 0 }
}

/** 标为已读：ids 为空表示全部 */
export async function readNotifications(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const body = await readJson(req)
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 200) : []
  if (ids.length)
    await env.DB.prepare(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at = 0 AND id IN (${ids.join(',')})`).bind(now(), user.id).run()
  else
    await env.DB.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at = 0').bind(now(), user.id).run()
  return null
}

export async function clearNotifications(req: Request, env: Env) {
  const user = await requireUser(req, env)
  await env.DB.prepare('DELETE FROM notifications WHERE user_id = ?').bind(user.id).run()
  return null
}

/* ---------------- 接口：浏览器推送订阅 ---------------- */

export async function pushKey(_req: Request, env: Env) {
  return { publicKey: env.VAPID_PUBLIC_KEY || null }
}

function b64urlField(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || !/^[\w-]+=*$/.test(value) || value.length > max)
    throw new ApiError(400, `${label}格式不正确`)
  return value
}

export async function subscribePush(req: Request, env: Env) {
  const user = await requireUser(req, env)
  if (!env.VAPID_PUBLIC_KEY)
    throw new ApiError(503, '服务器尚未配置浏览器推送')
  const body = await readJson(req)
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
  // 只接受各浏览器推送服务的 https 地址，避免被用来让服务端去请求任意地址
  let url: URL
  try {
    url = new URL(endpoint)
  }
  catch {
    throw new ApiError(400, '推送地址不正确')
  }
  if (url.protocol !== 'https:' || endpoint.length > 1000)
    throw new ApiError(400, '推送地址不正确')
  const keys = (body.keys ?? {}) as Record<string, unknown>
  const p256dh = b64urlField(keys.p256dh, '公钥', 200)
  const auth = b64urlField(keys.auth, '认证密钥', 100)
  const origin = new URL(req.url).origin
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').bind(user.id).first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_SUBSCRIPTIONS) {
    // 超出时删掉最早的一个（换过很多浏览器）
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = (SELECT id FROM push_subscriptions WHERE user_id = ? ORDER BY created_at LIMIT 1)').bind(user.id).run()
  }
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, origin, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, origin = excluded.origin, fail_count = 0`,
  ).bind(user.id, endpoint, p256dh, auth, origin, (req.headers.get('User-Agent') || '').slice(0, 200), now()).run()
  return null
}

export async function unsubscribePush(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const body = await readJson(req)
  if (typeof body.endpoint === 'string')
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').bind(user.id, body.endpoint).run()
  return null
}

/** 发一条测试通知（站内 + 推送） */
export async function testPush(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const subs = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').bind(user.id).first<{ n: number }>()
  await notify(env, user.id, 'test', null, { title: '测试通知', body: '收到这条说明提醒已经可以正常送达 🎉', path: '/pages/me/me' })
  return { subscriptions: subs?.n ?? 0 }
}

/* ---------------- 接口：首页「今日」 ---------------- */

export async function today(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const url = new URL(req.url)
  const tz = Number(url.searchParams.get('tzOffset') ?? -480)
  const day = todayIn(Number.isInteger(tz) ? tz : -480)
  const lists = (await env.DB.prepare('SELECT id FROM todo_lists WHERE owner_id = ?1 UNION SELECT list_id FROM todo_list_members WHERE user_id = ?1').bind(user.id).all<{ id: number }>()).results.map(r => r.id)
  const scope = `((list_id IS NULL AND user_id = ?)${lists.length ? ` OR list_id IN (${lists.join(',')})` : ''})`
  const { results: todoRows } = await env.DB.prepare(
    `SELECT id, key_owner_id, data, due_date, due_time, priority FROM todos WHERE ${scope} AND done = 0 AND due_date IS NOT NULL AND due_date <= ?
     ORDER BY due_date ASC, priority DESC, due_time ASC LIMIT 50`,
  ).bind(user.id, day).all<{ id: number, key_owner_id: number, data: string, due_date: string, due_time: string | null, priority: number }>()
  const todos = await Promise.all(todoRows.slice(0, 8).map(async t => ({
    id: t.id,
    title: (await decryptJson<{ title: string }>(env.VAULT_KEY, t.key_owner_id, t.data)).title,
    dueDate: t.due_date,
    dueTime: t.due_time,
    priority: t.priority,
    overdue: t.due_date < day,
  })))

  const { results: annRows } = await env.DB.prepare('SELECT * FROM anniversaries WHERE user_id = ?').bind(user.id).all<AnnivRow>()
  const anns = annRows
    .map((a) => {
      const s = summarize(ruleOf(a), day)
      return { a, s }
    })
    // 置顶的、30 天内的、今天的
    .filter(({ a, s }) => a.pinned || (s.kind !== 'countup' && s.days <= 30))
    .sort((x, y) => Number(y.a.pinned) - Number(x.a.pinned) || (x.s.kind === 'countup' ? 1 : 0) - (y.s.kind === 'countup' ? 1 : 0) || x.s.days - y.s.days)
    .slice(0, 6)
  const anniversaries = await Promise.all(anns.map(async ({ a, s }) => {
    const secret = await decryptAnniv(env, a)
    const nth = s.nth && s.nth > 0 ? (a.category === 'birthday' ? `${s.nth} 岁生日` : `${s.nth} 周年`) : ''
    return { id: a.id, title: secret.title, emoji: secret.emoji, color: a.color, kind: s.kind, days: s.days, nextDate: s.nextDate, nth, pinned: !!a.pinned }
  }))
  const unread = await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at = 0').bind(user.id).first<{ n: number }>()
  return { today: day, todos, todoCount: todoRows.length, anniversaries, unread: unread?.n ?? 0 }
}

/** 删除用户时 */
export async function deleteUserNotifications(env: Env, userId: number) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM notifications WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').bind(userId),
  ])
}
