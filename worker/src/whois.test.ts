// @vitest-environment node
import type { RdapResponse } from './whois'
import { parseDomain, parseIp } from './whois'

const vcard = (fields: [string, Record<string, unknown>, string, unknown][]) => ['vcard', [['version', {}, 'text', '4.0'], ...fields]] as RdapResponse['entities'] extends (infer E)[] | undefined ? E extends { vcardArray?: infer V } ? V : never : never

describe('parseDomain', () => {
  it('提取注册商、时间、状态与 DNS', () => {
    const r: RdapResponse = {
      objectClassName: 'domain',
      ldhName: 'EXAMPLE.COM',
      status: ['client delete prohibited', 'client transfer prohibited'],
      events: [
        { eventAction: 'registration', eventDate: '1995-08-14T04:00:00Z' },
        { eventAction: 'expiration', eventDate: '2027-08-13T04:00:00Z' },
        { eventAction: 'last changed', eventDate: '2026-08-14T07:01:39Z' },
      ],
      entities: [{
        roles: ['registrar'],
        publicIds: [{ type: 'IANA Registrar ID', identifier: '376' }],
        vcardArray: vcard([['fn', {}, 'text', 'RESERVED-Internet Assigned Numbers Authority']]),
        entities: [{ roles: ['abuse'], vcardArray: vcard([['fn', {}, 'text', ''], ['email', {}, 'text', 'abuse@iana.org'], ['tel', { type: 'voice' }, 'uri', 'tel:+1.3108239358']]) }],
      }],
      nameservers: [{ ldhName: 'A.IANA-SERVERS.NET' }, { ldhName: 'B.IANA-SERVERS.NET' }],
      secureDNS: { delegationSigned: true },
    }
    expect(parseDomain(r)).toMatchObject({
      kind: 'domain',
      name: 'example.com',
      registrar: 'RESERVED-Internet Assigned Numbers Authority',
      registrarIanaId: '376',
      abuse: { email: 'abuse@iana.org', phone: 'tel:+1.3108239358' },
      registrant: null,
      registeredAt: '1995-08-14T04:00:00Z',
      expiresAt: '2027-08-13T04:00:00Z',
      nameservers: ['a.iana-servers.net', 'b.iana-servers.net'],
      dnssec: true,
    })
  })
})

describe('parseIp', () => {
  it('提取网段与归属', () => {
    const r: RdapResponse = {
      objectClassName: 'ip network',
      handle: '1.1.1.0 - 1.1.1.255',
      name: 'APNIC-LABS',
      type: 'ASSIGNED PORTABLE',
      country: 'AU',
      startAddress: '1.1.1.0',
      endAddress: '1.1.1.255',
      cidr0_cidrs: [{ v4prefix: '1.1.1.0', length: 24 }],
      entities: [{ roles: ['registrant'], vcardArray: vcard([['fn', {}, 'text', 'APNIC Research and Development'], ['adr', { cc: 'AU' }, 'text', ['', '', '6 Cordelia St', '', '', '', '']]]) }],
    }
    expect(parseIp(r)).toMatchObject({
      kind: 'ip',
      name: 'APNIC-LABS',
      country: 'AU',
      range: '1.1.1.0 - 1.1.1.255',
      cidrs: ['1.1.1.0/24'],
      owner: { name: 'APNIC Research and Development', country: 'AU' },
    })
  })
})

describe('dNS 服务器名', () => {
  it('去掉末尾的点', () => {
    expect(parseDomain({ ldhName: 'bbc.co.uk', nameservers: [{ ldhName: 'DNS0.BBC.CO.UK.' }, { ldhName: 'ns1.example.com' }] }).nameservers)
      .toEqual(['dns0.bbc.co.uk', 'ns1.example.com'])
  })
})
