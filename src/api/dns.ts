import { http } from '@/http/http'

export type DnsResolver = 'cloudflare' | 'google' | 'alidns'

export interface IDnsRecord {
  name: string
  type: string
  ttl: number
  data: string
}

export interface IDnsResult {
  type: string
  /** NOERROR、NXDOMAIN、SERVFAIL 等；网络错误时为 ERROR */
  status: string
  /** DNSSEC 验证通过 */
  ad: boolean
  answers: IDnsRecord[]
  authority: IDnsRecord[]
  error?: string
}

export interface IDnsLookup {
  /** 规范化后的查询域名（中文域名为 Punycode） */
  name: string
  resolver: string
  elapsed: number
  results: IDnsResult[]
}

export function dnsLookup(name: string, types: string[], resolver: DnsResolver) {
  return http.get<IDnsLookup>('/dns', { name, types: types.join(','), resolver })
}
