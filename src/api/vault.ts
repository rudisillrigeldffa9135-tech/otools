import { http } from '@/http/http'

/** 列表项：不含密码与备注 */
export interface IVaultSummary {
  id: number
  name: string
  url: string
  username: string
  /** 账号备注名，同一网站多个账号时用于区分，如「工作号」 */
  label: string
  /** 是否保存了两步验证（TOTP）密钥 */
  hasTotp: boolean
  /** 秒级时间戳 */
  createdAt: number
  updatedAt: number
}

export interface IVaultItem extends IVaultSummary {
  password: string
  notes: string
  /** 两步验证密钥：Base32 或 otpauth:// 链接 */
  totp: string
}

export interface IVaultForm {
  name: string
  url: string
  username: string
  label: string
  password: string
  notes: string
  totp: string
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

/** 密码体检的单条结果（不含密码本身） */
export interface IVaultHealthItem extends IVaultSummary {
  /** 没有填写密码 */
  empty: boolean
  /** 强度 0 极弱 ~ 4 很强 */
  level: 0 | 1 | 2 | 3 | 4
  reasons: string[]
  /** 与本条密码相同的其他条目 ID */
  reusedWith: number[]
  /** 相同密码的分组编号，0 表示没有重复 */
  reuseGroup: number
  /** 密码最后修改时间（秒） */
  passwordUpdatedAt: number
  passwordAgeDays: number
}

export function getVaultHealth() {
  return http.get<{ checkedAt: number, items: IVaultHealthItem[] }>('/vault/health')
}

/** 泄露检查：返回 { [id]: 在泄露数据中出现的次数 }，每次最多 40 条 */
export function checkVaultBreach(ids: number[]) {
  return http.post<Record<string, number>>('/vault/breach', { ids }, undefined, undefined, { hideErrorToast: true })
}
