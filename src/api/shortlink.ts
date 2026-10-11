import { http } from '@/http/http'

export interface IShortLink {
  id: number
  code: string
  /** 完整短链，如 https://xxx.workers.dev/s/abc123 */
  shortUrl: string
  /** 目标链接 */
  url: string
  /** 备注 */
  title: string
  clicks: number
  /** 以下均为秒级时间戳，0 表示无 */
  lastClickedAt: number
  /** 0 表示永久有效 */
  expiresAt: number
  disabled: boolean
  createdAt: number
  updatedAt: number
  /** 仅管理员查看全部时返回：创建者用户名 */
  owner?: string
}

export interface ICreateLinkForm {
  url: string
  /** 自定义后缀，留空则随机生成 */
  code?: string
  title?: string
  expiresAt?: number
}

export interface IUpdateLinkForm {
  url?: string
  title?: string
  expiresAt?: number
  disabled?: boolean
}

/** all 为 true 时查看所有用户的短链（仅管理员） */
export function listLinks(all = false) {
  return http.get<IShortLink[]>('/links', all ? { scope: 'all' } : undefined)
}

export function createLink(data: ICreateLinkForm) {
  return http.post<IShortLink>('/links', { ...data })
}

export function updateLink(id: number, data: IUpdateLinkForm) {
  return http.put<IShortLink>(`/links/${id}`, { ...data })
}

export function deleteLink(id: number) {
  return http.delete<null>(`/links/${id}`)
}
