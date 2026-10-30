import { describe, expect, it } from 'vitest'
import { decodeFinalShellPassword, parseFinalShellFiles } from './finalshell'

describe('decodeFinalShellPassword', () => {
  // 两段密文由 FinalShell 对同一明文加密得到（随机头不同），均应还原为同一明文
  it('还原已知密文', () => {
    expect(decodeFinalShellPassword('OGNqLj1Le11Br3AIelAiPaDJpfhBzmEN')).toBe('beac3d85988e')
    expect(decodeFinalShellPassword('UU8hWV51DmVNgmX/pUd0LlaEo53VTa6s')).toBe('beac3d85988e')
  })

  it('空值返回空串', () => {
    expect(decodeFinalShellPassword('')).toBe('')
    expect(decodeFinalShellPassword('   ')).toBe('')
  })
})

describe('parseFinalShellFiles', () => {
  it('解析连接并按目录分组、解密密码', () => {
    const files = [
      {
        path: '生产环境/web_connection.json',
        text: JSON.stringify({ name: 'web', host: '1.2.3.4', port: 2222, user_name: 'root', password: 'OGNqLj1Le11Br3AIelAiPaDJpfhBzmEN', comment: '网站' }),
      },
      {
        path: '生产环境/数据库/db_connection.json',
        text: JSON.stringify({ name: 'db', host: '5.6.7.8', port: 22, user_name: 'admin', password: '' }),
      },
    ]
    const r = parseFinalShellFiles(files)
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ name: 'web', host: '1.2.3.4', port: 2222, username: 'root', password: 'beac3d85988e', note: '网站', group: '生产环境' })
    expect(r[1]).toMatchObject({ name: 'db', host: '5.6.7.8', port: 22, username: 'admin', group: '数据库' })
  })

  it('跳过没有 host、非 SSH 协议和非法 JSON', () => {
    const files = [
      { path: 'a.json', text: '{ not json' },
      { path: 'b.json', text: JSON.stringify({ name: '仅备注', comment: 'x' }) },
      { path: 'c.json', text: JSON.stringify({ host: '9.9.9.9', protocol: 'rdp' }) },
      { path: 'd.json', text: JSON.stringify({ host: '10.0.0.1', user_name: 'u' }) },
    ]
    const r = parseFinalShellFiles(files)
    expect(r).toHaveLength(1)
    expect(r[0].host).toBe('10.0.0.1')
  })

  it('没有用户名时为空、缺端口默认 22', () => {
    const r = parseFinalShellFiles([{ path: 'x.json', text: JSON.stringify({ host: 'h' }) }])
    expect(r[0]).toMatchObject({ host: 'h', port: 22, username: '', name: 'h' })
  })
})
