// @vitest-environment node
import { decryptJson, encryptJson, hashPassword, randomToken, sha256Hex, toBase64, verifyPassword } from './crypto'

const masterKey = toBase64(new Uint8Array(32).fill(7))

describe('worker crypto', () => {
  it('哈希后可校验正确密码，拒绝错误密码', async () => {
    const stored = await hashPassword('correct horse', 10_000)
    expect(stored.startsWith('pbkdf2$10000$')).toBe(true)
    expect(await verifyPassword('correct horse', stored)).toBe(true)
    expect(await verifyPassword('wrong horse', stored)).toBe(false)
    expect(await verifyPassword('correct horse', 'garbage')).toBe(false)
  })

  it('同一密码每次哈希的 salt 不同', async () => {
    expect(await hashPassword('x', 10_000)).not.toBe(await hashPassword('x', 10_000))
  })

  it('密码库加解密往返一致', async () => {
    const data = { password: 'p@ss 中文', notes: 'n' }
    const cipher = await encryptJson(masterKey, 1, data)
    expect(cipher.startsWith('v1.')).toBe(true)
    expect(cipher).not.toContain('p@ss')
    expect(await decryptJson(masterKey, 1, cipher)).toEqual(data)
  })

  it('其他用户的密钥无法解密', async () => {
    const cipher = await encryptJson(masterKey, 1, { a: 1 })
    await expect(decryptJson(masterKey, 2, cipher)).rejects.toThrow()
  })

  it('主密钥 VAULT_KEY 缺失或过短时报错', async () => {
    await expect(encryptJson('', 1, {})).rejects.toThrow(/VAULT_KEY/)
    await expect(encryptJson(toBase64(new Uint8Array(8)), 1, {})).rejects.toThrow(/VAULT_KEY/)
  })

  it('token 为 base64url，sha256 为 64 位十六进制', async () => {
    const token = randomToken()
    expect(token).toMatch(/^[\w-]{43}$/)
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
