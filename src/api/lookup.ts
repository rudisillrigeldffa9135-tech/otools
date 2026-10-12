import { http } from '@/http/http'

/** 以 USD 为基准的汇率表 */
export interface IRates {
  base: 'USD'
  rates: Record<string, number>
  /** 数据源更新时间（秒） */
  updatedAt: number
  nextUpdateAt: number
  fetchedAt: number
  /** 上游暂时不可用，返回的是旧数据 */
  stale: boolean
}

export function getRates() {
  return http.get<IRates>('/rates')
}

export interface IContact {
  name: string
  org: string
  email: string
  phone: string
  country: string
}

export interface IDomainWhois {
  kind: 'domain'
  name: string
  unicodeName: string
  registrar: string
  registrarIanaId: string
  registrarUrl: string
  abuse: IContact | null
  registrant: IContact | null
  /** ISO 时间字符串，可能为空 */
  registeredAt: string
  expiresAt: string
  updatedAt: string
  status: string[]
  nameservers: string[]
  dnssec: boolean
}

export interface IIpWhois {
  kind: 'ip'
  handle: string
  name: string
  type: string
  country: string
  range: string
  cidrs: string[]
  owner: IContact | null
  abuse: IContact | null
  registeredAt: string
  updatedAt: string
  status: string[]
}

export function whois(q: string) {
  return http.get<IDomainWhois | IIpWhois>('/whois', { q }, undefined, { hideErrorToast: true })
}
