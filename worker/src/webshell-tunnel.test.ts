import { describe, expect, it } from 'vitest'
import { describeTunnelStatus } from './webshell-tunnel'

describe('describeTunnelStatus 握手失败提示', () => {
  it('跳转到 Access 登录页：区分是否带了服务令牌', () => {
    expect(describeTunnelStatus(302, 'https://team.cloudflareaccess.com/cdn-cgi/access/login')).toContain('请在服务器设置中填写服务令牌')
    expect(describeTunnelStatus(302, 'https://team.cloudflareaccess.com/cdn-cgi/access/login', true)).toContain('拒绝了服务令牌')
    expect(describeTunnelStatus(403, '', true)).toContain('拒绝了服务令牌')
  })
  it('tunnel 不在线与非 SSH 隧道', () => {
    expect(describeTunnelStatus(530)).toContain('Tunnel 不在线')
    expect(describeTunnelStatus(200)).toContain('不是 SSH 隧道')
  })
})
