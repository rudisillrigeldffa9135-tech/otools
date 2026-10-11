import { http } from '@/http/http'

export type Role = 'admin' | 'user'

export interface IAdminUser {
  id: number
  username: string
  nickname: string
  role: Role
  disabled: boolean
  /** 秒级时间戳 */
  createdAt: number
  /** 密码库条目数 */
  itemCount: number
  /** 短链接数 */
  linkCount: number
}

export interface ICreateUserForm {
  username: string
  password: string
  nickname?: string
  role?: Role
}

export interface IUpdateUserForm {
  nickname?: string
  role?: Role
  disabled?: boolean
  /** 填写则重置密码 */
  password?: string
}

export function listUsers() {
  return http.get<IAdminUser[]>('/admin/users')
}

export function createUser(data: ICreateUserForm) {
  return http.post<{ id: number }>('/admin/users', data)
}

export function updateUser(id: number, data: IUpdateUserForm) {
  return http.put<null>(`/admin/users/${id}`, data)
}

export function deleteUser(id: number) {
  return http.delete<null>(`/admin/users/${id}`)
}
