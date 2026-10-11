import type { CipherOptions } from './cipher'
import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, createHash } from 'node:crypto'
import { decrypt, encodeBytes, encrypt, parseBytes } from './cipher'

const base: CipherOptions = {
  algorithm: 'AES',
  mode: 'CBC',
  padding: 'Pkcs7',
  keyType: 'raw',
  key: '0123456789abcdef',
  keyEncoding: 'utf8',
  iv: 'fedcba9876543210',
  ivEncoding: 'utf8',
  textEncoding: 'utf8',
  outputEncoding: 'base64',
}

const TEXT = '你好，OTools! 1234567890'

/** 用 Node 自带的 OpenSSL 计算期望值 */
function nodeEncrypt(algo: string, key: Buffer, iv: Buffer | null, text: string, autoPadding = true) {
  const c = createCipheriv(algo, key, iv)
  c.setAutoPadding(autoPadding)
  return Buffer.concat([c.update(text, 'utf8'), c.final()])
}

describe('与 OpenSSL 结果一致', () => {
  it.each([
    ['AES', 'CBC', 'aes-128-cbc', '0123456789abcdef', 'fedcba9876543210'],
    ['AES', 'ECB', 'aes-128-ecb', '0123456789abcdef', null],
    ['AES', 'CBC', 'aes-192-cbc', '0123456789abcdef01234567', 'fedcba9876543210'],
    ['AES', 'CBC', 'aes-256-cbc', '0123456789abcdef0123456789abcdef', 'fedcba9876543210'],
    ['DES', 'CBC', 'des-cbc', '12345678', '87654321'],
    ['3DES', 'CBC', 'des-ede3-cbc', '0123456789abcdef01234567', '87654321'],
    ['3DES', 'ECB', 'des-ede3', '0123456789abcdef01234567', null],
    ['3DES', 'CBC', 'des-ede-cbc', '0123456789abcdef', '87654321'],
  ] as const)('%s-%s %s', (algorithm, mode, nodeAlgo, key, iv) => {
    const o: CipherOptions = { ...base, algorithm, mode, key, iv: iv ?? '' }
    let expected: string
    try {
      expected = nodeEncrypt(nodeAlgo, Buffer.from(key), iv ? Buffer.from(iv) : null, TEXT).toString('base64')
    }
    catch {
      // 新版 OpenSSL 默认禁用了 DES，跳过对照只测往返
      expected = ''
    }
    const out = encrypt(TEXT, o)
    if (expected)
      expect(out).toBe(expected)
    expect(decrypt(out, o)).toBe(TEXT)
  })

  it('aES-CTR / CFB / OFB 不填充', () => {
    for (const [mode, nodeAlgo] of [['CTR', 'aes-128-ctr'], ['CFB', 'aes-128-cfb'], ['OFB', 'aes-128-ofb']] as const) {
      const o: CipherOptions = { ...base, mode, padding: 'NoPadding', outputEncoding: 'hex' }
      const expected = nodeEncrypt(nodeAlgo, Buffer.from(o.key), Buffer.from(o.iv), TEXT).toString('hex')
      expect(encrypt(TEXT, o)).toBe(expected)
      expect(decrypt(expected, o)).toBe(TEXT)
    }
  })

  it('hex / base64 编码的密钥与 IV', () => {
    const key = Buffer.from('00112233445566778899aabbccddeeff', 'hex')
    const iv = Buffer.alloc(16, 7)
    const o: CipherOptions = { ...base, key: key.toString('hex'), keyEncoding: 'hex', iv: iv.toString('base64'), ivEncoding: 'base64', outputEncoding: 'hex' }
    expect(encrypt(TEXT, o)).toBe(nodeEncrypt('aes-128-cbc', key, iv, TEXT).toString('hex'))
  })

  it('口令模式与 openssl enc -md md5 兼容', () => {
    const o: CipherOptions = { ...base, keyType: 'passphrase', key: 'secret' }
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    const out = encrypt(TEXT, o, salt)
    expect(out.startsWith('U2FsdGVkX1')).toBe(true)
    // EVP_BytesToKey(md5)
    const pass = Buffer.from('secret')
    const s = Buffer.from(salt)
    const d1 = createHash('md5').update(Buffer.concat([pass, s])).digest()
    const d2 = createHash('md5').update(Buffer.concat([d1, pass, s])).digest()
    const d3 = createHash('md5').update(Buffer.concat([d2, pass, s])).digest()
    const key = Buffer.concat([d1, d2])
    const iv = d3
    const raw = Buffer.from(out, 'base64')
    const dec = createDecipheriv('aes-256-cbc', key, iv)
    expect(Buffer.concat([dec.update(raw.subarray(16)), dec.final()]).toString('utf8')).toBe(TEXT)
    expect(decrypt(out, o)).toBe(TEXT)
  })
})

describe('错误提示', () => {
  it('密钥长度', () => {
    expect(() => encrypt('a', { ...base, key: 'short' })).toThrow('16 / 24 / 32 字节')
  })
  it('iV 长度', () => {
    expect(() => encrypt('a', { ...base, iv: '123' })).toThrow('IV 需要 16 字节')
  })
  it('密钥错误', () => {
    const out = encrypt(TEXT, base)
    expect(() => decrypt(out, { ...base, key: 'fedcba9876543210' })).toThrow(/解密失败|UTF-8/)
  })
  it('不填充时长度必须对齐', () => {
    expect(() => encrypt('abc', { ...base, padding: 'NoPadding' })).toThrow('整数倍')
  })
  it('非法 hex', () => {
    expect(() => parseBytes('xyz', 'hex', '密钥')).toThrow('十六进制')
  })
  it('口令模式密文格式', () => {
    expect(() => decrypt('aGVsbG8gd29ybGQgaGVsbG8gd29ybGQ=', { ...base, keyType: 'passphrase', key: 'x' })).toThrow('Salted__')
  })
})

describe('明文编码', () => {
  it('解密输出为 hex', () => {
    const out = encrypt('abc', base)
    expect(decrypt(out, { ...base, textEncoding: 'hex' })).toBe('616263')
  })
  it('encodeBytes', () => {
    const b = new Uint8Array([0, 255, 16])
    expect(encodeBytes(b, 'hex')).toBe('00ff10')
    expect(encodeBytes(b, 'base64')).toBe('AP8Q')
    expect(encodeBytes(new Uint8Array(16), 'utf8')).toHaveLength(16)
  })
})

describe('dES 经典测试向量', () => {
  it('fIPS 46 示例：133457799BBCDFF1 加密 0123456789ABCDEF', () => {
    const o: CipherOptions = { ...base, algorithm: 'DES', mode: 'ECB', padding: 'NoPadding', key: '133457799BBCDFF1', keyEncoding: 'hex', textEncoding: 'hex', outputEncoding: 'hex' }
    expect(encrypt('0123456789ABCDEF', o)).toBe('85e813540f0ab405')
    expect(decrypt('85E813540F0AB405', o)).toBe('0123456789abcdef')
  })
})
