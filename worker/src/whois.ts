import type { Env } from './lib'
import { requireUser } from './auth'
import { normalizeName } from './dns'
import { ApiError } from './lib'

/**
 * 域名 / IP 注册信息：使用 RDAP（WHOIS 的标准化 JSON 版本），经 rdap.org 自动转到对应注册局。
 * 部分后缀（如 .cn）的注册局没有开放 RDAP，此时会提示无法查询。
 */

interface RdapEntity {
  roles?: string[]
  handle?: string
  vcardArray?: [string, [string, Record<string, unknown>, string, unknown][]]
  publicIds?: { type: string, identifier: string }[]
  entities?: RdapEntity[]
  links?: { href: string, rel?: string }[]
}

interface RdapEvent {
  eventAction: string
  eventDate: string
}

export interface RdapResponse {
  objectClassName?: string
  ldhName?: string
  unicodeName?: string
  handle?: string
  name?: string
  type?: string
  country?: string
  startAddress?: string
  endAddress?: string
  ipVersion?: string
  cidr0_cidrs?: { v4prefix?: string, v6prefix?: string, length: number }[]
  status?: string[]
  events?: RdapEvent[]
  entities?: RdapEntity[]
  nameservers?: { ldhName?: string }[]
  secureDNS?: { delegationSigned?: boolean }
  port43?: string
  links?: { href: string, rel?: string, type?: string }[]
}

function vcardField(e: RdapEntity, field: string) {
  const item = e.vcardArray?.[1]?.find(v => v[0] === field)
  if (!item)
    return ''
  const value = item[3]
  if (Array.isArray(value))
    return value.flat().filter(Boolean).join(' ').trim()
  return typeof value === 'string' ? value : ''
}

/** 递归找某个角色的联系人（注册商、注册人、滥用投诉联系人等） */
function findEntity(entities: RdapEntity[] | undefined, role: string): RdapEntity | undefined {
  for (const e of entities ?? []) {
    if (e.roles?.includes(role))
      return e
    const inner = findEntity(e.entities, role)
    if (inner)
      return inner
  }
  return undefined
}

function contactOf(e?: RdapEntity) {
  if (!e)
    return null
  const c = {
    name: vcardField(e, 'fn'),
    org: vcardField(e, 'org'),
    email: vcardField(e, 'email'),
    phone: vcardField(e, 'tel'),
    country: (e.vcardArray?.[1]?.find(v => v[0] === 'adr')?.[1] as { cc?: string } | undefined)?.cc || '',
  }
  return Object.values(c).some(Boolean) ? c : null
}

function eventDate(events: RdapEvent[] | undefined, action: string) {
  return events?.find(e => e.eventAction === action)?.eventDate ?? ''
}

/** 把 RDAP 的域名结果整理成前端直接展示的结构 */
export function parseDomain(r: RdapResponse) {
  const registrar = findEntity(r.entities, 'registrar')
  return {
    kind: 'domain' as const,
    name: (r.ldhName || '').toLowerCase(),
    unicodeName: r.unicodeName || '',
    registrar: registrar ? (vcardField(registrar, 'fn') || registrar.handle || '') : '',
    registrarIanaId: registrar?.publicIds?.find(p => /iana/i.test(p.type))?.identifier ?? '',
    registrarUrl: registrar?.links?.find(l => l.rel === 'about' || l.rel === 'related')?.href ?? '',
    abuse: contactOf(findEntity(registrar?.entities, 'abuse')),
    registrant: contactOf(findEntity(r.entities, 'registrant')),
    registeredAt: eventDate(r.events, 'registration'),
    expiresAt: eventDate(r.events, 'expiration'),
    updatedAt: eventDate(r.events, 'last changed'),
    status: r.status ?? [],
    nameservers: (r.nameservers ?? []).map(n => (n.ldhName || '').toLowerCase().replace(/\.$/, '')).filter(Boolean),
    dnssec: !!r.secureDNS?.delegationSigned,
  }
}

export function parseIp(r: RdapResponse) {
  const owner = findEntity(r.entities, 'registrant') || findEntity(r.entities, 'administrative')
  return {
    kind: 'ip' as const,
    handle: r.handle || '',
    name: r.name || '',
    type: r.type || '',
    country: r.country || '',
    range: r.startAddress && r.endAddress ? `${r.startAddress} - ${r.endAddress}` : '',
    cidrs: (r.cidr0_cidrs ?? []).map(c => `${c.v4prefix || c.v6prefix}/${c.length}`),
    owner: contactOf(owner),
    abuse: contactOf(findEntity(r.entities, 'abuse')),
    registeredAt: eventDate(r.events, 'registration'),
    updatedAt: eventDate(r.events, 'last changed'),
    status: r.status ?? [],
  }
}

async function rdap(path: string) {
  const res = await fetch(`https://rdap.org/${path}`, {
    headers: { accept: 'application/rdap+json, application/json' },
    redirect: 'follow',
    signal: AbortSignal.timeout(10000),
  })
  if (res.status === 404)
    return null
  if (!res.ok)
    throw new ApiError(502, `注册局查询服务返回 HTTP ${res.status}，请稍后重试`)
  return await res.json() as RdapResponse
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/

export async function whois(req: Request, env: Env) {
  await requireUser(req, env)
  let q = (new URL(req.url).searchParams.get('q') || '').trim()
  if (!q)
    throw new ApiError(400, '请输入域名或 IP')
  q = q.replace(/^\[|\]$/g, '')
  try {
    if (IPV4.test(q) || (q.includes(':') && /^[\da-f:.]+$/i.test(q))) {
      const r = await rdap(`ip/${q}`)
      if (!r)
        throw new ApiError(404, '没有查到这个 IP 的注册信息（可能是内网或保留地址）')
      return parseIp(r)
    }
    const name = normalizeName(q)
    const labels = name.split('.')
    if (labels.length < 2)
      throw new ApiError(400, '请输入完整的域名，如 example.com')
    // 输入的可能是子域名：逐级去掉最左边的部分，直到查到已注册的域名
    for (let i = 0; i <= Math.min(labels.length - 2, 3); i++) {
      const r = await rdap(`domain/${labels.slice(i).join('.')}`)
      if (r)
        return parseDomain(r)
    }
    throw new ApiError(404, `没有查到 ${name} 的注册信息：可能未注册，或该后缀（.${labels[labels.length - 1]}）的注册局未开放 RDAP 查询`)
  }
  catch (e) {
    if (e instanceof ApiError)
      throw e
    console.error('RDAP 查询失败', e)
    throw new ApiError(502, e instanceof Error && e.name === 'TimeoutError' ? '注册局查询超时，请稍后重试' : '注册局查询服务暂时不可用')
  }
}
