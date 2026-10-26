/**
 * 待办的视图逻辑（纯函数）：按视图筛选、按日期分组、排序、截止日期的文字描述。
 */
import { addDays, diffDays, weekday } from '../datecalc/date'

export interface TodoLike {
  id: number
  listId: number | null
  title: string
  tags: string[]
  dueDate: string | null
  dueTime: string | null
  priority: number
  done: boolean
  doneAt: number | null
  sort: number
  createdAt: number
}

/** 视图：今天、未来 7 天、全部、收集箱、已完成、某个清单、某个标签 */
export type ViewKey = 'today' | 'week' | 'all' | 'inbox' | 'done' | `list:${number}` | `tag:${string}`
export type SortMode = 'smart' | 'due' | 'priority' | 'manual'

export interface TodoGroup<T> {
  key: string
  title: string
  /** 已逾期分组标红 */
  danger?: boolean
  items: T[]
}

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function isOverdue(t: Pick<TodoLike, 'dueDate' | 'done'>, today: string) {
  return !t.done && !!t.dueDate && t.dueDate < today
}

/** 「今天 18:30」「明天」「昨天」「10-30 周五」「2027-01-05」 */
export function dueLabel(dueDate: string | null, dueTime: string | null, today: string) {
  if (!dueDate)
    return ''
  const diff = diffDays(today, dueDate)
  let text: string
  if (diff === 0)
    text = '今天'
  else if (diff === 1)
    text = '明天'
  else if (diff === 2)
    text = '后天'
  else if (diff === -1)
    text = '昨天'
  else if (diff > 0 && diff < 7)
    text = WEEK[weekday(dueDate)]
  else if (dueDate.slice(0, 4) === today.slice(0, 4))
    text = `${dueDate.slice(5)} ${WEEK[weekday(dueDate)]}`
  else
    text = dueDate
  return dueTime ? `${text} ${dueTime}` : text
}

export function matchesView(t: TodoLike, view: ViewKey, today: string) {
  if (view === 'done')
    return t.done
  if (t.done)
    return false
  if (view === 'today')
    return !!t.dueDate && t.dueDate <= today
  if (view === 'week')
    return !!t.dueDate && t.dueDate <= addDays(today, 6)
  if (view === 'all')
    return true
  if (view === 'inbox')
    return t.listId === null
  if (view.startsWith('list:'))
    return t.listId === Number(view.slice(5))
  if (view.startsWith('tag:'))
    return t.tags.includes(view.slice(4))
  return false
}

/** 智能排序：有日期的在前（按日期、时间），同一天里高优先级在前，最后按手动顺序 */
function compareSmart(a: TodoLike, b: TodoLike) {
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate)
      return 1
    if (!b.dueDate)
      return -1
    return a.dueDate < b.dueDate ? -1 : 1
  }
  if (a.priority !== b.priority)
    return b.priority - a.priority
  if ((a.dueTime || '99') !== (b.dueTime || '99'))
    return (a.dueTime || '99') < (b.dueTime || '99') ? -1 : 1
  return a.sort - b.sort || b.createdAt - a.createdAt
}

export function sortTodos<T extends TodoLike>(items: T[], mode: SortMode): T[] {
  const list = [...items]
  if (mode === 'manual')
    return list.sort((a, b) => a.sort - b.sort || b.createdAt - a.createdAt)
  if (mode === 'priority')
    return list.sort((a, b) => b.priority - a.priority || compareSmart(a, b))
  return list.sort(compareSmart)
}

/**
 * 分组：智能排序时按日期分组（已逾期 / 今天 / 明天 / 未来几天逐日 / 以后 / 无日期），其他排序方式不分组。
 * 已完成的不在这里（单独折叠显示），「已完成」视图按完成时间倒序。
 */
export function groupTodos<T extends TodoLike>(items: T[], view: ViewKey, mode: SortMode, today: string): TodoGroup<T>[] {
  if (view === 'done') {
    const done = [...items].sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
    const groups = new Map<string, T[]>()
    for (const t of done) {
      const d = t.doneAt ? new Date(t.doneAt * 1000) : null
      const key = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '更早'
      groups.set(key, [...(groups.get(key) ?? []), t])
    }
    return [...groups].map(([key, list]) => ({ key, title: key === today ? '今天' : key === addDays(today, -1) ? '昨天' : key, items: list }))
  }
  const sorted = sortTodos(items, mode)
  if (mode !== 'smart')
    return [{ key: 'all', title: '', items: sorted }]

  const groups: TodoGroup<T>[] = []
  const push = (key: string, title: string, t: T, danger = false) => {
    let g = groups.find(x => x.key === key)
    if (!g) {
      g = { key, title, items: [], danger }
      groups.push(g)
    }
    g.items.push(t)
  }
  for (const t of sorted) {
    if (!t.dueDate) {
      push('none', '无日期', t)
      continue
    }
    const diff = diffDays(today, t.dueDate)
    if (diff < 0)
      push('overdue', '已逾期', t, true)
    else if (diff === 0)
      push('today', '今天', t)
    else if (diff === 1)
      push('tomorrow', '明天', t)
    else if (diff < 7)
      push(t.dueDate, `${t.dueDate.slice(5)} ${WEEK[weekday(t.dueDate)]}`, t)
    else
      push('later', '以后', t)
  }
  return groups
}

/** 各视图的未完成数量 */
export function viewCounts(todos: TodoLike[], today: string) {
  const counts: Record<string, number> = { today: 0, week: 0, all: 0, inbox: 0 }
  const weekEnd = addDays(today, 6)
  for (const t of todos) {
    if (t.done)
      continue
    counts.all++
    if (t.dueDate && t.dueDate <= today)
      counts.today++
    if (t.dueDate && t.dueDate <= weekEnd)
      counts.week++
    if (t.listId === null)
      counts.inbox++
    else
      counts[`list:${t.listId}`] = (counts[`list:${t.listId}`] ?? 0) + 1
    for (const tag of t.tags)
      counts[`tag:${tag}`] = (counts[`tag:${tag}`] ?? 0) + 1
  }
  return counts
}

/** 所有用过的标签（按使用次数） */
export function allTags(todos: TodoLike[]) {
  const map = new Map<string, number>()
  for (const t of todos) {
    for (const tag of t.tags)
      map.set(tag, (map.get(tag) ?? 0) + 1)
  }
  return [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag)
}

/** 四象限：1 重要且紧急、2 重要不紧急、3 紧急不重要、4 不重要不紧急 */
export type Quadrant = 1 | 2 | 3 | 4

/** 重要：中、高优先级；紧急：明天及以前到期（含逾期） */
export function quadrantOf(t: Pick<TodoLike, 'priority' | 'dueDate'>, today: string): Quadrant {
  const important = t.priority >= 2
  const urgent = !!t.dueDate && t.dueDate <= addDays(today, 1)
  if (important)
    return urgent ? 1 : 2
  return urgent ? 3 : 4
}

/** 在某个象限里新建待办时的默认值 */
export function quadrantDefaults(q: Quadrant, today: string) {
  return {
    priority: q === 1 ? 3 : q === 2 ? 2 : q === 3 ? 1 : 0,
    dueDate: q === 1 || q === 3 ? today : null,
  }
}

/** 连续完成天数：从今天（今天还没完成则从昨天）往前数，每天至少完成 1 项 */
export function streakOf(days: Record<string, number>, today: string) {
  let d = (days[today] ?? 0) > 0 ? today : addDays(today, -1)
  let n = 0
  while ((days[d] ?? 0) > 0 && n < 3650) {
    n++
    d = addDays(d, -1)
  }
  return n
}
