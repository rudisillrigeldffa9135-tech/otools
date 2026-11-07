import { http } from '@/http/http'

export type SubjectType = 'phone' | 'email' | 'bankcard' | 'idcard' | 'entity' | 'other'

export interface ISubject {
  id: number
  type: SubjectType
  name: string
  maskedValue: string
  secretData: string
  sort: number
  createdAt: number
  updatedAt: number
}

export interface IAccount {
  id: number
  subjectId: number | null
  platform: string
  accountName: string
  loginUrl: string
  icon: string
  createdAt: number
  updatedAt: number
}

export type AssetCategory
  = | 'domain'
    | 'server'
    | 'subscription'
    | 'api_key'
    | 'footprint'
    | 'hardware'
    | 'other'

export interface IAsset {
  id: number
  accountId: number
  category: AssetCategory
  name: string
  tags: string[]
  expireAt: number
  costCycle: string
  status: 'active' | 'expiring' | 'expired' | 'lend' | 'archived'
  extra: Record<string, any>
  createdAt: number
  updatedAt: number
}

export interface IWhereisOverview {
  subjects: ISubject[]
  accounts: IAccount[]
  assets: IAsset[]
}

export interface ISubjectForm {
  type: SubjectType
  name: string
  maskedValue?: string
  secretData?: string
  sort?: number
}

export interface IAccountForm {
  subjectId?: number | null
  platform: string
  accountName?: string
  loginUrl?: string
  icon?: string
}

export interface IAssetForm {
  accountId: number
  category: AssetCategory
  name: string
  tags?: string[]
  expireAt?: number
  costCycle?: string
  status?: string
  extra?: Record<string, any>
}

/* ---------------- API 请求 ---------------- */

export function getWhereisOverview() {
  return http.get<IWhereisOverview>('/whereis/overview')
}

export function createSubject(data: ISubjectForm) {
  return http.post<{ id: number }>('/whereis/subjects', data)
}

export function updateSubject(id: number, data: ISubjectForm) {
  return http.put<null>(`/whereis/subjects/${id}`, data)
}

export function deleteSubject(id: number) {
  return http.delete<null>(`/whereis/subjects/${id}`)
}

export function createAccount(data: IAccountForm) {
  return http.post<{ id: number }>('/whereis/accounts', data)
}

export function updateAccount(id: number, data: IAccountForm) {
  return http.put<null>(`/whereis/accounts/${id}`, data)
}

export function deleteAccount(id: number) {
  return http.delete<null>(`/whereis/accounts/${id}`)
}

export function createAsset(data: IAssetForm) {
  return http.post<{ id: number }>('/whereis/assets', data)
}

export function updateAsset(id: number, data: IAssetForm) {
  return http.put<null>(`/whereis/assets/${id}`, data)
}

export function deleteAsset(id: number) {
  return http.delete<null>(`/whereis/assets/${id}`)
}
