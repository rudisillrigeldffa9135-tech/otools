import type { Env } from './lib'
import { requireUser } from './auth'

/**
 * 我的 IP：直接使用 Cloudflare 为每个请求附带的连接信息（request.cf），
 * 不依赖任何第三方 IP 库或接口，也没有调用次数限制。
 */
export async function myIp(req: Request, env: Env) {
  await requireUser(req, env)
  const cf = (req.cf || {}) as Partial<IncomingRequestCfProperties>
  const ip = req.headers.get('CF-Connecting-IP') || ''
  return {
    ip,
    version: ip.includes(':') ? 6 : 4,
    country: cf.country || '',
    isEUCountry: cf.isEUCountry === '1',
    continent: cf.continent || '',
    region: cf.region || '',
    city: cf.city || '',
    postalCode: cf.postalCode || '',
    timezone: cf.timezone || '',
    latitude: cf.latitude || '',
    longitude: cf.longitude || '',
    asn: cf.asn || 0,
    asOrganization: cf.asOrganization || '',
    /** 处理本次请求的 Cloudflare 数据中心（机场代码） */
    colo: cf.colo || '',
    httpProtocol: cf.httpProtocol || '',
    tlsVersion: cf.tlsVersion || '',
    userAgent: req.headers.get('User-Agent') || '',
    acceptLanguage: req.headers.get('Accept-Language') || '',
  }
}
