// @vitest-environment node
import { clientKey } from './ratelimit'

describe('clientKey', () => {
  it('iPv4 原样使用', () => {
    expect(clientKey('1.2.3.4')).toBe('1.2.3.4')
  })

  it('iPv6 归并到 /64 网段', () => {
    expect(clientKey('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64')
    expect(clientKey('2001:DB8:1:2:bbbb:cccc:dddd:eeee')).toBe('2001:db8:1:2::/64')
    expect(clientKey('2001:db8::1')).toBe('2001:db8:0:0::/64')
    expect(clientKey('2001:0db8:0001:0002::1')).toBe('2001:db8:1:2::/64')
  })

  it('缺少 IP 时使用固定键', () => {
    expect(clientKey('')).toBe('unknown')
  })
})
