import { http } from '@/http/http'

/** 列表项：不含密码与备注 */
export interface IVaultSummary {
  id: number
  name: string
  url: string
  username: string
  /** 账号备注名，同一网站多个账号时用于区分，如「工作号」 */
  label: string
  /** 秒级时间戳 */
  createdAt: number
  updatedAt: number
}

export interface IVaultItem extends IVaultSummary {
  password: string
  notes: string
}

export interface IVaultForm {
  name: string
  url: string
  username: string
  label: string
  password: string
  notes: string
}

export function listVault() {
  return http.get<IVaultSummary[]>('/vault')
}

export function getVaultItem(id: number) {
  return http.get<IVaultItem>(`/vault/${id}`)
}

export function createVaultItem(data: IVaultForm) {
  return http.post<{ id: number }>('/vault', { ...data })
}

export function updateVaultItem(id: number, data: IVaultForm) {
  return http.put<null>(`/vault/${id}`, { ...data })
}

export function deleteVaultItem(id: number) {
  return http.delete<null>(`/vault/${id}`)
}
