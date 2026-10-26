import { http } from '@/http/http'

export interface INotification {
  id: number
  /** todo / anniversary / milestone / test */
  kind: string
  refId: number | null
  title: string
  body: string
  /** 站内页面路径 */
  path: string
  read: boolean
  createdAt: number
}

export function listNotifications() {
  return http.get<{ items: INotification[], unread: number }>('/notifications')
}

export function getUnreadCount() {
  return http.get<{ unread: number }>('/notifications/unread', undefined, undefined, { hideErrorToast: true })
}

/** 标为已读；不传 ids 表示全部 */
export function readNotifications(ids?: number[]) {
  return http.post<null>('/notifications/read', { ids })
}

export function clearNotifications() {
  return http.delete<null>('/notifications')
}

export interface ITodayTodo {
  id: number
  title: string
  dueDate: string
  dueTime: string | null
  priority: number
  overdue: boolean
}

export interface ITodayAnniversary {
  id: number
  title: string
  emoji: string
  color: string
  kind: 'countdown' | 'today' | 'countup' | 'past'
  days: number
  nextDate: string | null
  nth: string
  pinned: boolean
}

export interface IToday {
  today: string
  todos: ITodayTodo[]
  /** 今天与逾期的待办总数 */
  todoCount: number
  anniversaries: ITodayAnniversary[]
  unread: number
}

export function getToday() {
  return http.get<IToday>('/today', { tzOffset: new Date().getTimezoneOffset() }, undefined, { hideErrorToast: true })
}

/* 浏览器推送 */

export function getPushKey() {
  return http.get<{ publicKey: string | null }>('/push/key')
}

export function subscribePush(sub: { endpoint: string, keys: { p256dh: string, auth: string } }) {
  return http.post<null>('/push/subscribe', sub)
}

export function unsubscribePush(endpoint: string) {
  return http.post<null>('/push/unsubscribe', { endpoint })
}

export function testPush() {
  return http.post<{ subscriptions: number }>('/push/test')
}

/* 日历订阅 */

export function getCalendar() {
  return http.get<{ url: string | null }>('/calendar')
}

/** 开启或重新生成（旧链接立即失效） */
export function resetCalendar() {
  return http.post<{ url: string }>('/calendar')
}

export function disableCalendar() {
  return http.delete<null>('/calendar')
}
