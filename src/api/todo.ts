import type { RepeatRule } from '@/pages-tools/todo/repeat'
import { http } from '@/http/http'

export interface ITodoSubtask {
  id: string
  text: string
  done: boolean
}

export interface ITodo {
  id: number
  /** null 为收集箱 */
  listId: number | null
  title: string
  note: string
  subtasks: ITodoSubtask[]
  tags: string[]
  /** 'YYYY-MM-DD' */
  dueDate: string | null
  /** 'HH:mm' */
  dueTime: string | null
  /** 0 无，1 低，2 中，3 高 */
  priority: number
  done: boolean
  /** 完成时间（秒） */
  doneAt: number | null
  doneBy: number | null
  repeat: RepeatRule | null
  /** 提前多少分钟提醒，null 不提醒 */
  remind: number | null
  sort: number
  createdBy: number
  createdAt: number
  updatedAt: number
}

export interface IPerson {
  id: number
  username: string
  nickname: string
}

export interface ITodoList {
  id: number
  name: string
  color: string
  sort: number
  isOwner: boolean
  owner: IPerson
  members: IPerson[]
  createdAt: number
}

export interface ITodoOverview {
  lists: ITodoList[]
  todos: ITodo[]
  /** 待办里涉及的人（创建者、完成者），用于显示名字 */
  people: IPerson[]
  me: number
}

export type ITodoForm = Partial<Pick<ITodo, 'listId' | 'title' | 'note' | 'subtasks' | 'tags' | 'dueDate' | 'dueTime' | 'priority' | 'repeat' | 'remind' | 'sort'>>

/** 与 Date.getTimezoneOffset() 相同：北京时间为 -480 */
function tz() {
  return new Date().getTimezoneOffset()
}

export function getTodos(doneBefore?: number) {
  return http.get<ITodoOverview>('/todos', doneBefore ? { doneBefore } : undefined)
}

export function createTodo(data: ITodoForm) {
  return http.post<ITodo>('/todos', { ...data, tzOffset: tz() })
}

export function updateTodo(id: number, data: ITodoForm) {
  return http.put<ITodo>(`/todos/${id}`, { ...data, tzOffset: tz() })
}

/** 完成 / 取消完成；重复的待办完成时返回生成的下一次 */
export function completeTodo(id: number, done: boolean, removeNextId?: number) {
  return http.post<{ todo: ITodo, next: ITodo | null }>(`/todos/${id}/complete`, { done, removeNextId, tzOffset: tz() })
}

export function deleteTodo(id: number) {
  return http.delete<null>(`/todos/${id}`)
}

export function reorderTodos(ids: number[]) {
  return http.post<null>('/todos/reorder', { ids })
}

/** 清空已完成：listId 为空表示收集箱 */
export function clearDoneTodos(listId: number | null) {
  return http.delete<null>('/todos/done', { listId: listId ?? 'inbox' })
}

export function createTodoList(name: string, color = '') {
  return http.post<ITodoList>('/todo-lists', { name, color })
}

export function updateTodoList(id: number, data: { name?: string, color?: string }) {
  return http.put<ITodoList>(`/todo-lists/${id}`, data)
}

export function deleteTodoList(id: number) {
  return http.delete<null>(`/todo-lists/${id}`)
}

export function addTodoListMember(id: number, username: string) {
  return http.post<ITodoList>(`/todo-lists/${id}/members`, { username })
}

/** 移除成员；成员自己调用即退出清单 */
export function removeTodoListMember(id: number, userId: number) {
  return http.delete<null>(`/todo-lists/${id}/members/${userId}`)
}

export function addFocus(minutes: number, todoId?: number) {
  return http.post<null>('/todo-focus', { minutes, todoId })
}

export interface ITodoStats {
  /** 每天完成数 */
  days: Record<string, number>
  /** 每天专注分钟数 */
  focus: Record<string, number>
  totalDone: number
  totalFocus: number
  today: string
}

export function getTodoStats(days = 30) {
  return http.get<ITodoStats>('/todos/stats', { days, tzOffset: tz() })
}
