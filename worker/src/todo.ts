import type { RepeatRule } from '../../src/pages-tools/todo/repeat'
import type { Env, SessionUser } from './lib'
import { nextDue, normalizeRule, remindAt, todayIn } from '../../src/pages-tools/todo/repeat'
import { requireUser } from './auth'
import { decryptJson, encryptJson } from './crypto'
import { ApiError, now, readJson } from './lib'

/**
 * 待办事项与共享清单。
 * - 标题、备注、子任务、标签加密存放在 data；共享清单里的待办用清单所有者的密钥加密，所有成员都能经服务端解密查看
 * - 访问规则：收集箱（list_id 为空）只有创建者能看；清单里的待办，清单所有者和成员都能看、能改
 * - 只有清单所有者能改名、删除清单、管理成员；成员可以自己退出
 */

interface ListRow {
  id: number
  owner_id: number
  name: string
  color: string
  sort: number
  created_at: number
  updated_at: number
}

interface TodoRow {
  id: number
  list_id: number | null
  user_id: number
  key_owner_id: number
  data: string
  due_date: string | null
  due_time: string | null
  priority: number
  done: number
  done_at: number
  done_by: number | null
  repeat: string | null
  repeat_anchor: string | null
  remind: number | null
  remind_at: number
  reminded: number
  tz_offset: number
  sort: number
  created_at: number
  updated_at: number
}

export interface Subtask {
  id: string
  text: string
  done: boolean
}

interface TodoSecret {
  title: string
  note: string
  subtasks: Subtask[]
  tags: string[]
}

export const MAX_TODOS_PER_USER = 5000
export const MAX_LISTS_PER_USER = 100
export const MAX_MEMBERS_PER_LIST = 20
export const MAX_SUBTASKS = 50
export const MAX_TAGS = 10
export const MAX_TITLE = 500
export const MAX_NOTE = 5000
/** 已完成的待办保留多久 */
export const DONE_RETENTION = 180 * 86400
/** 列表接口默认返回最近多少天内完成的待办 */
const RECENT_DONE_DAYS = 30
const COLORS = ['', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink', 'gray']

function parseId(value: unknown, label = '待办') {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0)
    throw new ApiError(400, `无效的${label} ID`)
  return n
}

async function enc(env: Env, keyOwner: number, value: object) {
  try {
    return await encryptJson(env.VAULT_KEY, keyOwner, value)
  }
  catch (e) {
    console.error(e)
    throw new ApiError(500, '服务端加密失败，请检查 VAULT_KEY 配置')
  }
}

async function dec<T>(env: Env, keyOwner: number, data: string) {
  try {
    return await decryptJson<T>(env.VAULT_KEY, keyOwner, data)
  }
  catch (e) {
    console.error(e)
    throw new ApiError(500, '解密失败，VAULT_KEY 可能被更换过')
  }
}

/* ---------------- 字段校验 ---------------- */

function parseTitle(value: unknown) {
  const title = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  if (!title)
    throw new ApiError(400, '待办内容不能为空')
  if (title.length > MAX_TITLE)
    throw new ApiError(400, `待办内容最多 ${MAX_TITLE} 个字`)
  return title
}

function parseNote(value: unknown) {
  if (value === undefined || value === null)
    return ''
  if (typeof value !== 'string' || value.length > MAX_NOTE)
    throw new ApiError(400, `备注最多 ${MAX_NOTE} 个字`)
  return value
}

function parseSubtasks(value: unknown): Subtask[] {
  if (value === undefined || value === null)
    return []
  if (!Array.isArray(value) || value.length > MAX_SUBTASKS)
    throw new ApiError(400, `子任务最多 ${MAX_SUBTASKS} 个`)
  return value.map((v, i) => {
    const text = typeof v?.text === 'string' ? v.text.trim().slice(0, 300) : ''
    return { id: typeof v?.id === 'string' && v.id.length <= 32 ? v.id : `s${Date.now().toString(36)}${i}`, text, done: v?.done === true }
  }).filter(s => s.text)
}

function parseTags(value: unknown): string[] {
  if (value === undefined || value === null)
    return []
  if (!Array.isArray(value))
    throw new ApiError(400, '标签格式不正确')
  const tags = [...new Set(value.map(t => (typeof t === 'string' ? t.replace(/[\s#＃]/g, '').slice(0, 20) : '')).filter(Boolean))]
  if (tags.length > MAX_TAGS)
    throw new ApiError(400, `标签最多 ${MAX_TAGS} 个`)
  return tags
}

function parseDate(value: unknown) {
  if (value === undefined || value === null || value === '')
    return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))
    throw new ApiError(400, '日期格式不正确')
  return value
}

function parseTime(value: unknown) {
  if (value === undefined || value === null || value === '')
    return null
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw new ApiError(400, '时间格式不正确')
  return value
}

function parsePriority(value: unknown) {
  const n = Number(value ?? 0)
  if (![0, 1, 2, 3].includes(n))
    throw new ApiError(400, '优先级不正确')
  return n
}

/** 提前多少分钟提醒：null 不提醒，0 准时，最多提前 30 天 */
function parseRemind(value: unknown) {
  if (value === undefined || value === null || value === '')
    return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > 30 * 1440)
    throw new ApiError(400, '提醒时间不正确')
  return n
}

function parseTz(value: unknown) {
  const n = Number(value)
  return Number.isInteger(n) && n >= -14 * 60 && n <= 14 * 60 ? n : -480
}

function parseRepeat(value: unknown) {
  if (value === undefined || value === null || value === '')
    return null
  const rule = normalizeRule(value)
  if (!rule)
    throw new ApiError(400, '重复规则不正确')
  return rule
}

/* ---------------- 访问控制 ---------------- */

/** 本人能访问的清单：自己创建的 + 被邀请加入的 */
async function accessibleLists(env: Env, userId: number) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM todo_lists WHERE owner_id = ?1
      OR id IN (SELECT list_id FROM todo_list_members WHERE user_id = ?1)
      ORDER BY sort ASC, id ASC`,
  ).bind(userId).all<ListRow>()
  return results
}

async function getList(env: Env, userId: number, listId: number) {
  const row = await env.DB.prepare(
    `SELECT * FROM todo_lists WHERE id = ?1 AND (owner_id = ?2 OR id IN (SELECT list_id FROM todo_list_members WHERE user_id = ?2))`,
  ).bind(listId, userId).first<ListRow>()
  if (!row)
    throw new ApiError(404, '清单不存在，或你已不是成员')
  return row
}

async function getOwnedList(env: Env, userId: number, listId: number) {
  const row = await getList(env, userId, listId)
  if (row.owner_id !== userId)
    throw new ApiError(403, '只有清单的创建者可以这样做')
  return row
}

async function getTodoRow(env: Env, userId: number, id: number) {
  const row = await env.DB.prepare(
    `SELECT * FROM todos WHERE id = ?1 AND (
       (list_id IS NULL AND user_id = ?2)
       OR list_id IN (SELECT id FROM todo_lists WHERE owner_id = ?2 UNION SELECT list_id FROM todo_list_members WHERE user_id = ?2))`,
  ).bind(id, userId).first<TodoRow>()
  if (!row)
    throw new ApiError(404, '待办不存在或已删除')
  return row
}

/** 待办放在哪个清单就用谁的密钥：清单所有者；收集箱为本人 */
async function keyOwnerFor(env: Env, user: SessionUser, listId: number | null) {
  if (listId === null)
    return user.id
  return (await getList(env, user.id, listId)).owner_id
}

/* ---------------- 输出 ---------------- */

async function toTodo(env: Env, row: TodoRow) {
  const secret = await dec<TodoSecret>(env, row.key_owner_id, row.data)
  return {
    id: row.id,
    listId: row.list_id,
    title: secret.title,
    note: secret.note,
    subtasks: secret.subtasks ?? [],
    tags: secret.tags ?? [],
    dueDate: row.due_date,
    dueTime: row.due_time,
    priority: row.priority,
    done: !!row.done,
    doneAt: row.done_at || null,
    doneBy: row.done_by,
    repeat: row.repeat ? JSON.parse(row.repeat) as RepeatRule : null,
    remind: row.remind,
    sort: row.sort,
    createdBy: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function listView(env: Env, userId: number, row: ListRow) {
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.username, u.nickname FROM todo_list_members m JOIN users u ON u.id = m.user_id WHERE m.list_id = ? ORDER BY m.created_at`,
  ).bind(row.id).all<{ id: number, username: string, nickname: string }>()
  const owner = await env.DB.prepare('SELECT id, username, nickname FROM users WHERE id = ?').bind(row.owner_id).first<{ id: number, username: string, nickname: string }>()
  return {
    id: row.id,
    name: (await dec<{ name: string }>(env, row.owner_id, row.name)).name,
    color: row.color,
    sort: row.sort,
    isOwner: row.owner_id === userId,
    owner,
    members: results,
    createdAt: row.created_at,
  }
}

/* ---------------- 接口：总览 ---------------- */

/**
 * 一次返回全部清单与待办：未完成的全部返回，已完成的只返回最近 30 天（更早的用 doneBefore 分页查询）
 */
export async function overview(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const url = new URL(req.url)
  const lists = await accessibleLists(env, user.id)
  const listIds = lists.map(l => l.id)
  const doneBefore = Number(url.searchParams.get('doneBefore') || 0)
  const scope = `((list_id IS NULL AND user_id = ?1)${listIds.length ? ` OR list_id IN (${listIds.join(',')})` : ''})`
  const rows = doneBefore
    ? (await env.DB.prepare(`SELECT * FROM todos WHERE ${scope} AND done = 1 AND done_at < ?2 ORDER BY done_at DESC LIMIT 100`).bind(user.id, doneBefore).all<TodoRow>()).results
    : (await env.DB.prepare(`SELECT * FROM todos WHERE ${scope} AND (done = 0 OR done_at >= ?2)`).bind(user.id, now() - RECENT_DONE_DAYS * 86400).all<TodoRow>()).results
  // 共享清单里出现的其他人（创建者、完成者），用于显示名字
  const peopleIds = new Set<number>()
  for (const r of rows) {
    peopleIds.add(r.user_id)
    if (r.done_by)
      peopleIds.add(r.done_by)
  }
  const people = peopleIds.size
    ? (await env.DB.prepare(`SELECT id, username, nickname FROM users WHERE id IN (${[...peopleIds].join(',')})`).all<{ id: number, username: string, nickname: string }>()).results
    : []
  return {
    lists: doneBefore ? [] : await Promise.all(lists.map(l => listView(env, user.id, l))),
    todos: await Promise.all(rows.map(r => toTodo(env, r))),
    people,
    me: user.id,
  }
}

/* ---------------- 接口：待办 ---------------- */

export async function createTodo(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const body = await readJson(req)
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM todos WHERE user_id = ?').bind(user.id).first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_TODOS_PER_USER)
    throw new ApiError(400, `最多保存 ${MAX_TODOS_PER_USER} 条待办，请先清理已完成的`)
  const listId = body.listId === undefined || body.listId === null ? null : parseId(body.listId, '清单')
  const keyOwner = await keyOwnerFor(env, user, listId)
  const secret: TodoSecret = { title: parseTitle(body.title), note: parseNote(body.note), subtasks: parseSubtasks(body.subtasks), tags: parseTags(body.tags) }
  const dueDate = parseDate(body.dueDate)
  const dueTime = dueDate ? parseTime(body.dueTime) : null
  const repeat = dueDate ? parseRepeat(body.repeat) : null
  const remind = dueDate ? parseRemind(body.remind) : null
  const tz = parseTz(body.tzOffset)
  const t = now()
  const row = await env.DB.prepare(
    `INSERT INTO todos (list_id, user_id, key_owner_id, data, due_date, due_time, priority, repeat, repeat_anchor, remind, remind_at, tz_offset, sort, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  ).bind(
    listId,
    user.id,
    keyOwner,
    await enc(env, keyOwner, secret),
    dueDate,
    dueTime,
    parsePriority(body.priority),
    repeat ? JSON.stringify(repeat) : null,
    repeat ? dueDate : null,
    remind,
    remindAt(dueDate, dueTime, remind, tz),
    tz,
    // 新建的排在最前面
    typeof body.sort === 'number' ? body.sort : -Date.now() / 1000,
    t,
    t,
  ).first<TodoRow>()
  return toTodo(env, row!)
}

/** 修改：只传需要改的字段 */
export async function updateTodo(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id)
  const body = await readJson(req)
  const row = await getTodoRow(env, user.id, id)

  let keyOwner = row.key_owner_id
  let listId = row.list_id
  if (body.listId !== undefined) {
    listId = body.listId === null ? null : parseId(body.listId, '清单')
    // 共享清单里别人创建的待办，不能移到自己的收集箱（收集箱只属于创建者）
    if (listId === null && row.user_id !== user.id)
      throw new ApiError(400, '这是别人创建的待办，不能移到你的收集箱')
    keyOwner = listId === null ? row.user_id : await keyOwnerFor(env, user, listId)
  }
  const secret = await dec<TodoSecret>(env, row.key_owner_id, row.data)
  if (body.title !== undefined)
    secret.title = parseTitle(body.title)
  if (body.note !== undefined)
    secret.note = parseNote(body.note)
  if (body.subtasks !== undefined)
    secret.subtasks = parseSubtasks(body.subtasks)
  if (body.tags !== undefined)
    secret.tags = parseTags(body.tags)

  const dueDate = body.dueDate !== undefined ? parseDate(body.dueDate) : row.due_date
  const dueTime = !dueDate ? null : body.dueTime !== undefined ? parseTime(body.dueTime) : row.due_time
  let repeat = body.repeat !== undefined ? parseRepeat(body.repeat) : row.repeat ? JSON.parse(row.repeat) as RepeatRule : null
  if (!dueDate)
    repeat = null
  const remind = !dueDate ? null : body.remind !== undefined ? parseRemind(body.remind) : row.remind
  const tz = body.tzOffset !== undefined ? parseTz(body.tzOffset) : row.tz_offset
  const newRemindAt = remindAt(dueDate, dueTime, remind, tz)
  const anchor = repeat ? (body.dueDate !== undefined || body.repeat !== undefined || !row.repeat_anchor ? dueDate : row.repeat_anchor) : null

  const updated = await env.DB.prepare(
    `UPDATE todos SET list_id = ?, key_owner_id = ?, data = ?, due_date = ?, due_time = ?, priority = ?, repeat = ?, repeat_anchor = ?,
       remind = ?, remind_at = ?, reminded = CASE WHEN remind_at = ? THEN reminded ELSE 0 END, tz_offset = ?, sort = ?, updated_at = ?
     WHERE id = ? RETURNING *`,
  ).bind(
    listId,
    keyOwner,
    await enc(env, keyOwner, secret),
    dueDate,
    dueTime,
    body.priority !== undefined ? parsePriority(body.priority) : row.priority,
    repeat ? JSON.stringify(repeat) : null,
    anchor,
    remind,
    newRemindAt,
    newRemindAt,
    tz,
    typeof body.sort === 'number' && Number.isFinite(body.sort) ? body.sort : row.sort,
    now(),
    id,
  ).first<TodoRow>()
  return toTodo(env, updated!)
}

/**
 * 完成 / 取消完成。重复的待办完成时，会按规则生成下一次（子任务重置为未完成），返回 next。
 * 取消完成时可传 removeNextId，把刚才生成的下一次删掉（撤销操作）。
 */
export async function completeTodo(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const id = parseId(params.id)
  const body = await readJson(req)
  const row = await getTodoRow(env, user.id, id)
  const done = body.done !== false
  const t = now()

  if (!done) {
    const stmts = [env.DB.prepare('UPDATE todos SET done = 0, done_at = 0, done_by = NULL, updated_at = ? WHERE id = ?').bind(t, id)]
    // 统计里减掉当初完成的那一天
    if (row.done && row.done_by)
      stmts.push(env.DB.prepare('UPDATE todo_daily SET done = MAX(0, done - 1) WHERE user_id = ? AND day = ?').bind(row.done_by, todayIn(row.tz_offset, row.done_at * 1000)))
    if (body.removeNextId) {
      const nextId = parseId(body.removeNextId)
      // 只删同一条重复链上、在这次完成之后生成、还没完成的下一次，不能借此删除别的待办
      if (row.repeat && row.done) {
        stmts.push(env.DB.prepare(
          `DELETE FROM todos WHERE id = ? AND done = 0 AND repeat IS NOT NULL AND repeat_anchor = ? AND user_id = ?
             AND IFNULL(list_id, 0) = IFNULL(?, 0) AND created_at >= ? AND due_date > ?`,
        ).bind(nextId, row.repeat_anchor || row.due_date, row.user_id, row.list_id, row.done_at, row.due_date))
      }
    }
    await env.DB.batch(stmts)
    return { todo: await toTodo(env, (await getTodoRow(env, user.id, id))), next: null }
  }

  if (row.done)
    return { todo: await toTodo(env, row), next: null }

  let nextRow: TodoRow | null = null
  const rule = row.repeat ? normalizeRule(JSON.parse(row.repeat)) : null
  if (rule && row.due_date) {
    const tz = body.tzOffset !== undefined ? parseTz(body.tzOffset) : row.tz_offset
    const nextDate = nextDue(rule, row.due_date, todayIn(tz), row.repeat_anchor || row.due_date)
    if (nextDate) {
      const secret = await dec<TodoSecret>(env, row.key_owner_id, row.data)
      secret.subtasks = (secret.subtasks ?? []).map(s => ({ ...s, done: false }))
      nextRow = await env.DB.prepare(
        `INSERT INTO todos (list_id, user_id, key_owner_id, data, due_date, due_time, priority, repeat, repeat_anchor, remind, remind_at, tz_offset, sort, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      ).bind(
        row.list_id,
        row.user_id,
        row.key_owner_id,
        await enc(env, row.key_owner_id, secret),
        nextDate,
        row.due_time,
        row.priority,
        row.repeat,
        row.repeat_anchor || row.due_date,
        row.remind,
        remindAt(nextDate, row.due_time, row.remind, tz),
        tz,
        row.sort,
        t,
        t,
      ).first<TodoRow>()
    }
  }
  const updated = await env.DB.prepare('UPDATE todos SET done = 1, done_at = ?, done_by = ?, updated_at = ? WHERE id = ? RETURNING *')
    .bind(t, user.id, t, id)
    .first<TodoRow>()
  await env.DB.prepare('INSERT INTO todo_daily (user_id, day, done) VALUES (?, ?, 1) ON CONFLICT (user_id, day) DO UPDATE SET done = done + 1')
    .bind(user.id, todayIn(row.tz_offset, t * 1000))
    .run()
  return { todo: await toTodo(env, updated!), next: nextRow ? await toTodo(env, nextRow) : null }
}

export async function deleteTodo(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const row = await getTodoRow(env, user.id, parseId(params.id))
  await env.DB.prepare('DELETE FROM todos WHERE id = ?').bind(row.id).run()
  return null
}

/** 手动排序：按传入顺序重新编号（只处理自己能访问的） */
export async function reorderTodos(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const body = await readJson(req)
  if (!Array.isArray(body.ids) || body.ids.length > 1000)
    throw new ApiError(400, '排序数据不正确')
  const ids = body.ids.map(v => parseId(v))
  const lists = (await accessibleLists(env, user.id)).map(l => l.id)
  const scope = `((list_id IS NULL AND user_id = ?)${lists.length ? ` OR list_id IN (${lists.join(',')})` : ''})`
  const stmts = ids.map((id, i) => env.DB.prepare(`UPDATE todos SET sort = ? WHERE id = ? AND ${scope}`).bind(i, id, user.id))
  for (let i = 0; i < stmts.length; i += 100)
    await env.DB.batch(stmts.slice(i, i + 100))
  return null
}

/** 清空已完成：listId 为空表示收集箱 */
export async function clearDone(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const url = new URL(req.url)
  const raw = url.searchParams.get('listId')
  if (raw && raw !== 'inbox') {
    const list = await getList(env, user.id, parseId(raw, '清单'))
    await env.DB.prepare('DELETE FROM todos WHERE list_id = ? AND done = 1').bind(list.id).run()
  }
  else {
    await env.DB.prepare('DELETE FROM todos WHERE list_id IS NULL AND user_id = ? AND done = 1').bind(user.id).run()
  }
  return null
}

/* ---------------- 接口：清单 ---------------- */

function parseListName(value: unknown) {
  const name = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  if (!name)
    throw new ApiError(400, '请填写清单名称')
  if (name.length > 30)
    throw new ApiError(400, '清单名称最多 30 个字')
  return name
}

function parseColor(value: unknown) {
  return typeof value === 'string' && COLORS.includes(value) ? value : ''
}

export async function createList(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const body = await readJson(req)
  const name = parseListName(body.name)
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM todo_lists WHERE owner_id = ?').bind(user.id).first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_LISTS_PER_USER)
    throw new ApiError(400, `最多创建 ${MAX_LISTS_PER_USER} 个清单`)
  const t = now()
  const row = await env.DB.prepare('INSERT INTO todo_lists (owner_id, name, color, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *')
    .bind(user.id, await enc(env, user.id, { name }), parseColor(body.color), t, t, t)
    .first<ListRow>()
  return listView(env, user.id, row!)
}

export async function updateList(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const row = await getOwnedList(env, user.id, parseId(params.id, '清单'))
  const body = await readJson(req)
  const name = body.name !== undefined ? parseListName(body.name) : (await dec<{ name: string }>(env, row.owner_id, row.name)).name
  const updated = await env.DB.prepare('UPDATE todo_lists SET name = ?, color = ?, updated_at = ? WHERE id = ? RETURNING *')
    .bind(await enc(env, row.owner_id, { name }), body.color !== undefined ? parseColor(body.color) : row.color, now(), row.id)
    .first<ListRow>()
  return listView(env, user.id, updated!)
}

/** 删除清单：其中的待办一并删除 */
export async function deleteList(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const row = await getOwnedList(env, user.id, parseId(params.id, '清单'))
  await env.DB.batch([
    env.DB.prepare('DELETE FROM todos WHERE list_id = ?').bind(row.id),
    env.DB.prepare('DELETE FROM todo_list_members WHERE list_id = ?').bind(row.id),
    env.DB.prepare('DELETE FROM todo_lists WHERE id = ?').bind(row.id),
  ])
  return null
}

/** 邀请成员：按用户名添加，对方立即可以看到并编辑这个清单 */
export async function addMember(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const list = await getOwnedList(env, user.id, parseId(params.id, '清单'))
  const body = await readJson(req)
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  if (!username)
    throw new ApiError(400, '请填写对方的用户名')
  const target = await env.DB.prepare('SELECT id, disabled FROM users WHERE username = ?').bind(username).first<{ id: number, disabled: number }>()
  // 不区分「用户不存在」与「已停用」，避免被用来探测账号
  if (!target || target.disabled)
    throw new ApiError(404, '没有找到这个用户')
  if (target.id === user.id)
    throw new ApiError(400, '你已经是这个清单的创建者')
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM todo_list_members WHERE list_id = ?').bind(list.id).first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_MEMBERS_PER_LIST)
    throw new ApiError(400, `每个清单最多 ${MAX_MEMBERS_PER_LIST} 位成员`)
  await env.DB.prepare('INSERT OR IGNORE INTO todo_list_members (list_id, user_id, created_at) VALUES (?, ?, ?)').bind(list.id, target.id, now()).run()
  return listView(env, user.id, list)
}

/** 移除成员（创建者操作）或退出清单（成员自己操作） */
export async function removeMember(req: Request, env: Env, params: Record<string, string>) {
  const user = await requireUser(req, env)
  const list = await getList(env, user.id, parseId(params.id, '清单'))
  const memberId = parseId(params.userId, '成员')
  if (list.owner_id !== user.id && memberId !== user.id)
    throw new ApiError(403, '只有清单的创建者可以移除其他成员')
  await env.DB.prepare('DELETE FROM todo_list_members WHERE list_id = ? AND user_id = ?').bind(list.id, memberId).run()
  return null
}

/* ---------------- 番茄钟 ---------------- */

export async function addFocus(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const body = await readJson(req)
  const minutes = Number(body.minutes)
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180)
    throw new ApiError(400, '专注时长不正确')
  let todoId: number | null = null
  if (body.todoId) {
    todoId = parseId(body.todoId)
    await getTodoRow(env, user.id, todoId)
  }
  await env.DB.prepare('INSERT INTO todo_focus (user_id, todo_id, minutes, ended_at) VALUES (?, ?, ?, ?)').bind(user.id, todoId, minutes, now()).run()
  return null
}

/**
 * 统计：最近 N 天每天完成数与专注分钟数（按用户时区分天），以及连续完成天数
 */
export async function stats(req: Request, env: Env) {
  const user = await requireUser(req, env)
  const url = new URL(req.url)
  const days = Math.min(Math.max(Number(url.searchParams.get('days') || 30), 7), 365)
  const tz = parseTz(url.searchParams.get('tzOffset'))
  const since = now() - (days + 1) * 86400
  const shift = -tz * 60
  const done = await env.DB.prepare('SELECT day, done AS n FROM todo_daily WHERE user_id = ? AND day >= ? AND done > 0')
    .bind(user.id, todayIn(tz, since * 1000))
    .all<{ day: string, n: number }>()
  const focus = await env.DB.prepare(
    `SELECT date(ended_at + ?, 'unixepoch') AS day, SUM(minutes) AS m FROM todo_focus WHERE user_id = ? AND ended_at >= ? GROUP BY day`,
  ).bind(shift, user.id, since).all<{ day: string, m: number }>()
  const totals = await env.DB.prepare('SELECT COALESCE(SUM(done), 0) AS n FROM todo_daily WHERE user_id = ?').bind(user.id).first<{ n: number }>()
  const focusTotal = await env.DB.prepare('SELECT COALESCE(SUM(minutes), 0) AS m FROM todo_focus WHERE user_id = ?').bind(user.id).first<{ m: number }>()
  return {
    days: Object.fromEntries(done.results.map(r => [r.day, r.n])),
    focus: Object.fromEntries(focus.results.map(r => [r.day, r.m])),
    totalDone: totals?.n ?? 0,
    totalFocus: focusTotal?.m ?? 0,
    today: todayIn(tz),
  }
}

/* ---------------- 定时清理 ---------------- */

export async function cleanupTodos(env: Env) {
  await env.DB.prepare('DELETE FROM todos WHERE done = 1 AND done_at > 0 AND done_at < ?').bind(now() - DONE_RETENTION).run()
  await env.DB.prepare('DELETE FROM todo_focus WHERE ended_at < ?').bind(now() - 400 * 86400).run()
  await env.DB.prepare('DELETE FROM todo_daily WHERE day < ?').bind(todayIn(0, (now() - 400 * 86400) * 1000)).run()
}

/** 删除用户时：其创建的清单（含其中的待办）、成员关系、收集箱 */
export async function deleteUserTodos(env: Env, userId: number) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM todos WHERE list_id IN (SELECT id FROM todo_lists WHERE owner_id = ?)').bind(userId),
    env.DB.prepare('DELETE FROM todo_list_members WHERE list_id IN (SELECT id FROM todo_lists WHERE owner_id = ?)').bind(userId),
    env.DB.prepare('DELETE FROM todo_lists WHERE owner_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM todo_list_members WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM todos WHERE user_id = ? AND list_id IS NULL').bind(userId),
    env.DB.prepare('DELETE FROM todo_focus WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM todo_daily WHERE user_id = ?').bind(userId),
  ])
}
