import { http } from '@/http/http'

/** 来自 Cloudflare 的连接信息，字段含义见 worker/src/network.ts */
export interface IMyIp {
  ip: string
  version: 4 | 6
  /** ISO 3166-1 国家代码，如 CN、US */
  country: string
  isEUCountry: boolean
  continent: string
  region: string
  city: string
  postalCode: string
  /** IANA 时区，如 Asia/Shanghai */
  timezone: string
  latitude: string
  longitude: string
  asn: number
  asOrganization: string
  /** Cloudflare 数据中心机场代码 */
  colo: string
  httpProtocol: string
  tlsVersion: string
  userAgent: string
  acceptLanguage: string
}

export function getMyIp() {
  return http.get<IMyIp>('/ip')
}
