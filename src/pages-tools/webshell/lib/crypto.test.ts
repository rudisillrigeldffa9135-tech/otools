import { describe, expect, it } from 'vitest'
import { changeVaultPassword, createVault, decryptItem, encryptItem, fromBase64, toBase64, unlockVault } from './crypto'

// 测试里用较少的迭代次数，避免耗时
const N = 1000

describe('webshell 端到端加密', () => {
  it('base64 往返', () => {
    const b = new Uint8Array(70000).map((_, i) => i % 256)
    expect(fromBase64(toBase64(b))).toEqual(b)
  })

  it('设置、解锁、加解密条目', async () => {
    const { blob, key } = await createVault('correct horse', N)
    expect(JSON.parse(blob.kdf)).toMatchObject({ alg: 'PBKDF2-SHA256', iterations: N })
    const data = await encryptItem(key, 'id-12345678', 'host', { name: '服务器', password: 'p@ss' })
    expect(data.startsWith('v1.')).toBe(true)
    expect(data).not.toContain('p@ss')

    const key2 = await unlockVault(blob, 'correct horse')
    expect(await decryptItem(key2, 'id-12345678', 'host', data)).toEqual({ name: '服务器', password: 'p@ss' })
    // 日常使用的密钥不可导出
    expect(key2.extractable).toBe(false)
  })

  it('主密码错误', async () => {
    const { blob } = await createVault('right', N)
    await expect(unlockVault(blob, 'wrong')).rejects.toThrow('主密码不正确')
  })

  it('密文不能挪用到其他条目或类型', async () => {
    const { key } = await createVault('pw', N)
    const data = await encryptItem(key, 'id-aaaaaaaa', 'host', { a: 1 })
    await expect(decryptItem(key, 'id-bbbbbbbb', 'host', data)).rejects.toThrow()
    await expect(decryptItem(key, 'id-aaaaaaaa', 'key', data)).rejects.toThrow()
  })

  it('修改主密码后旧数据仍可解密', async () => {
    const { blob, key } = await createVault('old', N)
    const data = await encryptItem(key, 'id-12345678', 'snippet', { cmd: 'ls' })
    const next = await changeVaultPassword(blob, 'old', 'new', N)
    await expect(unlockVault(next, 'old')).rejects.toThrow()
    const k = await unlockVault(next, 'new')
    expect(await decryptItem(k, 'id-12345678', 'snippet', data)).toEqual({ cmd: 'ls' })
  })
})
