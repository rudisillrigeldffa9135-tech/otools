import { describe, expect, it } from 'vitest'
import { baseName, breadcrumbs, fillSnippet, formatHostPort, isTextLike, joinPath, looksBinary, modeToString, normalizePath, parentPath, parseHostInput, parseIdNames, parseOctalMode, parseSshConfig, shellQuote, snippetVars } from './util'

describe('导入 SSH 配置', () => {
  it('解析主机、默认值、跳板机', () => {
    const hosts = parseSshConfig(`
# 注释
Host *
  User admin
  ServerAliveInterval 30

Host web web-alias
  HostName 1.2.3.4
  Port 2222
  IdentityFile ~/.ssh/id_ed25519

Host db
  HostName=db.example.com
  User root
  ProxyJump jump@web:22

Host *.internal
  User ops

Match host foo
  User nobody

Host jump2
  ProxyJump none
`)
    expect(hosts.map(h => h.alias)).toEqual(['web', 'web-alias', 'db', 'jump2'])
    expect(hosts[0]).toEqual({ alias: 'web', host: '1.2.3.4', port: 2222, username: 'admin', identityFile: 'id_ed25519', proxyJump: '' })
    expect(hosts[2]).toMatchObject({ host: 'db.example.com', username: 'root', port: 22, proxyJump: 'web' })
    expect(hosts[3]).toMatchObject({ host: 'jump2', proxyJump: '' })
  })
})

describe('地址解析（含 IPv6）', () => {
  it('各种写法', () => {
    expect(parseHostInput('1.2.3.4')).toEqual({ host: '1.2.3.4', username: undefined, port: undefined })
    expect(parseHostInput('root@example.com:2222')).toEqual({ host: 'example.com', username: 'root', port: 2222 })
    expect(parseHostInput('ssh://ubuntu@1.2.3.4')).toMatchObject({ host: '1.2.3.4', username: 'ubuntu' })
    // 不带方括号的 IPv6 整体是地址，末尾的 :1 不是端口
    expect(parseHostInput('2001:db8::1')).toEqual({ host: '2001:db8::1', username: undefined, port: undefined })
    expect(parseHostInput('root@2408:8000:1:2::abcd')).toMatchObject({ host: '2408:8000:1:2::abcd', username: 'root', port: undefined })
    expect(parseHostInput('[2001:db8::1]:2222')).toMatchObject({ host: '2001:db8::1', port: 2222 })
    expect(parseHostInput('admin@[::1]')).toMatchObject({ host: '::1', username: 'admin', port: undefined })
  })

  it('显示', () => {
    expect(formatHostPort('2001:db8::1', 2222)).toBe('[2001:db8::1]:2222')
    expect(formatHostPort('2001:db8::1', 22)).toBe('2001:db8::1')
    expect(formatHostPort('example.com', 2222)).toBe('example.com:2222')
  })

  it('sSH 配置里 ProxyJump 是 IPv6', () => {
    const [h] = parseSshConfig('Host a\n  HostName 2001:db8::2\n  ProxyJump root@2001:db8::1\n')
    expect(h).toMatchObject({ host: '2001:db8::2', proxyJump: '2001:db8::1' })
  })
})

describe('快捷命令变量', () => {
  it('提取与填充', () => {
    const cmd = 'tail -n {{行数:100}} {{文件}} | grep {{ 关键字 }} # {{文件}}'
    expect(snippetVars(cmd)).toEqual([{ name: '行数', default: '100' }, { name: '文件', default: '' }, { name: '关键字', default: '' }])
    expect(fillSnippet(cmd, { 文件: '/var/log/syslog', 关键字: 'error' })).toBe('tail -n 100 /var/log/syslog | grep error # /var/log/syslog')
    expect(snippetVars('ls -la')).toEqual([])
  })
})

describe('远程路径', () => {
  it('拼接与规范化', () => {
    expect(joinPath('/home/u/', 'a.txt')).toBe('/home/u/a.txt')
    expect(joinPath('/home/u', '../x')).toBe('/home/x')
    expect(joinPath('/home/u', '/etc')).toBe('/etc')
    expect(normalizePath('//a/./b//')).toBe('/a/b')
    expect(parentPath('/a/b')).toBe('/a')
    expect(parentPath('/a')).toBe('/')
    expect(parentPath('/')).toBe('/')
    expect(baseName('/a/b.txt')).toBe('b.txt')
    expect(breadcrumbs('/var/log').map(b => b.path)).toEqual(['/', '/var', '/var/log'])
  })
})

describe('权限与其他', () => {
  it('权限转换', () => {
    expect(modeToString(0o755)).toBe('rwxr-xr-x')
    expect(modeToString(0o640)).toBe('rw-r-----')
    expect(parseOctalMode('0644')).toBe(0o644)
    expect(parseOctalMode('755')).toBe(0o755)
    expect(parseOctalMode('789')).toBeNull()
  })

  it('shell 转义', () => {
    expect(shellQuote(`it's a "test"`)).toBe(`'it'\\''s a "test"'`)
  })

  it('解析用户名', () => {
    const m = parseIdNames('root:x:0:0:root:/root:/bin/bash\nwww-data:x:33:33::/var/www:/usr/sbin/nologin\n')
    expect(m.get(0)).toBe('root')
    expect(m.get(33)).toBe('www-data')
  })

  it('文本判断', () => {
    expect(isTextLike('nginx.conf', 1000)).toBe(true)
    expect(isTextLike('Dockerfile', 1000)).toBe(true)
    expect(isTextLike('a.png', 1000)).toBe(false)
    expect(isTextLike('big.log', 3 * 1024 * 1024)).toBe(false)
    expect(looksBinary(new Uint8Array([104, 105, 0, 1]))).toBe(true)
    expect(looksBinary(new TextEncoder().encode('你好'))).toBe(false)
  })
})
