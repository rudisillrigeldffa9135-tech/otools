import { describe, expect, it } from 'vitest'
import { isPrivateHost, normalizeHost, normalizePort } from './webshell-target'

describe('webShell 连接目标校验', () => {
  it('规范化地址', () => {
    expect(normalizeHost(' Example.COM. ')).toBe('example.com')
    expect(normalizeHost('1.2.3.4')).toBe('1.2.3.4')
    expect(normalizeHost('[2001:db8::1]')).toBe('2001:db8::1')
    expect(normalizeHost('my_host-1.example')).toBe('my_host-1.example')
    for (const bad of ['', 'a b', 'http://x.com', 'x.com/path', '-bad.com', 'a..b', 'x:y:z!'])
      expect(() => normalizeHost(bad)).toThrow()
  })

  it('端口', () => {
    expect(normalizePort(undefined)).toBe(22)
    expect(normalizePort('2222')).toBe(2222)
    for (const bad of [0, 65536, 1.5, 'abc', 25])
      expect(() => normalizePort(bad)).toThrow()
  })

  it('内网与本机地址', () => {
    for (const h of ['localhost', 'a.localhost', 'nas.local', '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:192.168.1.1'])
      expect(isPrivateHost(h), h).toBe(true)
    for (const h of ['example.com', '8.8.8.8', '172.32.0.1', '100.128.0.1', '2001:db8::1', '::ffff:8.8.8.8'])
      expect(isPrivateHost(h), h).toBe(false)
  })
})
