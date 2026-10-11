// @vitest-environment node
import { normalizeName, reverseName } from './dns'

describe('normalizeName', () => {
  it.each([
    ['Example.COM', 'example.com'],
    ['https://www.example.com/path?q=1', 'www.example.com'],
    ['example.com:8080', 'example.com'],
    ['example.com.', 'example.com'],
    ['_sip._tcp.example.com', '_sip._tcp.example.com'],
    ['中文.com', 'xn--fiq228c.com'],
    ['http://例子.测试/abc', 'xn--fsqu00a.xn--0zwm56d'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeName(input)).toBe(expected)
  })

  it('非法域名', () => {
    expect(() => normalizeName('')).toThrow('请输入域名')
    expect(() => normalizeName('a..b')).toThrow('格式不正确')
    expect(() => normalizeName('a b.com')).toThrow('格式不正确')
    expect(() => normalizeName(`${'a'.repeat(64)}.com`)).toThrow('格式不正确')
  })

  it('pTR 可直接输入 IP', () => {
    expect(normalizeName('8.8.4.4', true)).toBe('4.4.8.8.in-addr.arpa')
    expect(normalizeName('[2001:db8::1]', true)).toBe('1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa')
  })
})

describe('reverseName', () => {
  it('非 IP 返回空', () => {
    expect(reverseName('example.com')).toBe('')
  })
  it('非法 IP', () => {
    expect(() => reverseName('1.2.3.256')).toThrow('IP')
    expect(() => reverseName('1::2::3')).toThrow('IP')
  })
})
