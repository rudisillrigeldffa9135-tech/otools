import type { Env } from './lib'
import { requireUser } from './auth'
import { ApiError } from './lib'

/**
 * DNS 查询：通过公共 DoH（DNS over HTTPS）的 JSON 接口查询，
 * 由 Worker 代发，前端（含小程序）无需再配置额外的合法域名。
 */

export const RECORD_TYPES: Record<string, number> = {
  A: 1,
  NS: 2,
  CNAME: 5,
  SOA: 6,
  PTR: 12,
  MX: 15,
  TXT: 16,
  AAAA: 28,
  SRV: 33,
  DS: 43,
  DNSKEY: 48,
  HTTPS: 65,
  CAA: 257,
}
const TYPE_NAMES = Object.fromEntries(Object.entries(RECORD_TYPES).map(([k, v]) => [v, k]))

export const RESOLVERS: Record<string, { name: string, url: string }> = {
  cloudflare: { name: 'Cloudflare', url: 'https://cloudflare-dns.com/dns-query' },
  google: { name: 'Google', url: 'https://dns.google/resolve' },
  alidns: { name: '阿里 DNS', url: 'https://dns.alidns.com/resolve' },
}

const STATUS: Record<number, string> = {
  0: 'NOERROR',
  1: 'FORMERR',
  2: 'SERVFAIL',
  3: 'NXDOMAIN',
  4: 'NOTIMP',
  5: 'REFUSED',
}

const MAX_TYPES = 10

/** IPv4 / IPv6 地址转反向解析域名 */
export function reverseName(ip: string) {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split('.').map(Number)
    if (parts.some(n => n > 255))
      throw new ApiError(400, 'IP 地址不正确')
    return `${parts.reverse().join('.')}.in-addr.arpa`
  }
  if (ip.includes(':')) {
    const [head, tail = ''] = ip.split('::')
    if (ip.split('::').length > 2)
      throw new ApiError(400, 'IP 地址不正确')
    const h = head ? head.split(':') : []
    const t = tail ? tail.split(':') : []
    const groups = ip.includes('::') ? [...h, ...Array.from({ length: 8 - h.length - t.length }).fill('0') as string[], ...t] : h
    if (groups.length !== 8 || groups.some(g => !/^[\da-f]{1,4}$/i.test(g)))
      throw new ApiError(400, 'IP 地址不正确')
    return `${groups.map(g => g.padStart(4, '0')).join('').toLowerCase().split('').reverse().join('.')}.ip6.arpa`
  }
  return ''
}

/**
 * 规范化用户输入：去掉协议、路径、端口，中文域名转 Punycode；
 * 查 PTR 时可以直接输入 IP。
 */
export function normalizeName(input: string, forPtr = false) {
  let s = input.trim().toLowerCase()
  if (!s)
    throw new ApiError(400, '请输入域名')
  if (s.includes('://'))
    s = s.slice(s.indexOf('://') + 3)
  s = s.split(/[/?#]/)[0]
  // 带方括号的 IPv6，或 host:port
  if (s.startsWith('['))
    s = s.slice(1, s.indexOf(']') > 0 ? s.indexOf(']') : undefined)
  else if (/^[^:]+:\d+$/.test(s))
    s = s.slice(0, s.lastIndexOf(':'))
  if (forPtr) {
    const rev = reverseName(s)
    if (rev)
      return rev
  }
  s = s.replace(/\.$/, '')
  // 中文等国际化域名转为 Punycode
  if (/[^\x20-\x7E]/.test(s)) {
    try {
      s = new URL(`http://${s}`).hostname
    }
    catch {
      throw new ApiError(400, '域名格式不正确')
    }
  }
  if (s.length > 253 || !s.split('.').every(l => /^[\w-]{1,63}$/.test(l)))
    throw new ApiError(400, '域名格式不正确')
  return s
}

interface DohAnswer {
  name: string
  type: number
  TTL: number
  data: string
}

export interface DnsRecord {
  name: string
  type: string
  ttl: number
  data: string
}

export interface DnsResult {
  type: string
  status: string
  /** DNSSEC 验证通过 */
  ad: boolean
  answers: DnsRecord[]
  /** NXDOMAIN / 无记录时，权威服务器返回的 SOA 等 */
  authority: DnsRecord[]
  error?: string
}

function mapRecords(list?: DohAnswer[]): DnsRecord[] {
  return (list ?? []).map(a => ({
    name: a.name.replace(/\.$/, ''),
    type: TYPE_NAMES[a.type] ?? `TYPE${a.type}`,
    ttl: a.TTL,
    // TXT 记录两边带引号，去掉便于阅读
    data: a.type === 16 ? a.data.replace(/^"|"$/g, '').replace(/" "/g, '') : a.data,
  }))
}

async function queryOne(name: string, type: string, resolver: string): Promise<DnsResult> {
  const url = `${RESOLVERS[resolver].url}?name=${encodeURIComponent(name)}&type=${RECORD_TYPES[type]}`
  try {
    const res = await fetch(url, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(6000) })
    if (!res.ok)
      return { type, status: 'ERROR', ad: false, answers: [], authority: [], error: `解析服务返回 HTTP ${res.status}` }
    const body = await res.json() as { Status: number, AD?: boolean, Answer?: DohAnswer[], Authority?: DohAnswer[] }
    return {
      type,
      status: STATUS[body.Status] ?? `RCODE${body.Status}`,
      ad: !!body.AD,
      answers: mapRecords(body.Answer),
      authority: mapRecords(body.Authority),
    }
  }
  catch (e) {
    console.error('DoH 查询失败', resolver, type, e)
    const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return { type, status: 'ERROR', ad: false, answers: [], authority: [], error: timeout ? '查询超时' : '无法连接解析服务' }
  }
}

export async function lookup(req: Request, env: Env) {
  await requireUser(req, env)
  const params = new URL(req.url).searchParams
  const resolver = params.get('resolver') || 'cloudflare'
  if (!RESOLVERS[resolver])
    throw new ApiError(400, '不支持的解析服务')
  const types = [...new Set((params.get('types') || 'A').toUpperCase().split(',').map(t => t.trim()).filter(Boolean))]
  if (!types.length || types.length > MAX_TYPES)
    throw new ApiError(400, `一次最多查询 ${MAX_TYPES} 种记录`)
  const bad = types.find(t => !RECORD_TYPES[t])
  if (bad)
    throw new ApiError(400, `不支持的记录类型：${bad}`)
  const name = normalizeName(params.get('name') || '', types.includes('PTR'))
  const started = Date.now()
  const results = await Promise.all(types.map(t => queryOne(name, t, resolver)))
  return { name, resolver: RESOLVERS[resolver].name, elapsed: Date.now() - started, results }
}
