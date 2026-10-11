import type { TotpConfig } from './totp'
import { base32Decode, formatCode, parseTotp, totp } from './totp'

const ascii = (s: string) => new Uint8Array(Array.from(s, c => c.charCodeAt(0)))

/** RFC 6238 附录 B 的测试向量（8 位） */
function rfc(algorithm: TotpConfig['algorithm'], secret: string): TotpConfig {
  return { secret: ascii(secret), digits: 8, period: 30, algorithm, issuer: '', account: '' }
}
const SHA1_KEY = '12345678901234567890'
const SHA256_KEY = '12345678901234567890123456789012'
const SHA512_KEY = '1234567890123456789012345678901234567890123456789012345678901234'

describe('totp RFC 6238 测试向量', () => {
  const cases: [number, string, string, string][] = [
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [1234567890, '89005924', '91819424', '93441116'],
    [20000000000, '65353130', '77737706', '47863826'],
  ]
  it.each(cases)('t=%i', (t, sha1, sha256, sha512) => {
    expect(totp(rfc('SHA1', SHA1_KEY), t * 1000).code).toBe(sha1)
    expect(totp(rfc('SHA256', SHA256_KEY), t * 1000).code).toBe(sha256)
    expect(totp(rfc('SHA512', SHA512_KEY), t * 1000).code).toBe(sha512)
  })

  it('剩余秒数按周期计算', () => {
    expect(totp(rfc('SHA1', SHA1_KEY), 59_000).remaining).toBe(1)
    expect(totp(rfc('SHA1', SHA1_KEY), 60_000).remaining).toBe(30)
  })
})

describe('base32Decode', () => {
  it('解码标准 Base32，忽略空格、大小写与填充', () => {
    expect(Array.from(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'))).toEqual(Array.from(ascii(SHA1_KEY)))
    expect(Array.from(base32Decode('gezd gnbv gy3t qojq gezd gnbv gy3t qojq'))).toEqual(Array.from(ascii(SHA1_KEY)))
    expect(Array.from(base32Decode('MZXW6==='))).toEqual(Array.from(ascii('foo')))
  })

  it('非法字符报错', () => {
    expect(() => base32Decode('ABC1')).toThrow(/A-Z/)
    expect(() => base32Decode('  ')).toThrow()
  })
})

describe('parseTotp', () => {
  it('纯密钥使用默认参数', () => {
    const c = parseTotp('JBSWY3DPEHPK3PXP')
    expect([c.digits, c.period, c.algorithm]).toEqual([6, 30, 'SHA1'])
  })

  it('解析 otpauth 链接中的参数、发行方与账号', () => {
    const c = parseTotp('otpauth://totp/GitHub:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&digits=8&period=60&algorithm=SHA256')
    expect(c).toMatchObject({ digits: 8, period: 60, algorithm: 'SHA256', issuer: 'GitHub', account: 'alice@example.com' })
  })

  it('label 没有发行方时使用 issuer 参数', () => {
    expect(parseTotp('otpauth://totp/bob?secret=JBSWY3DPEHPK3PXP&issuer=ACME')).toMatchObject({ issuer: 'ACME', account: 'bob' })
  })

  it('拒绝 hotp、缺少密钥与非法参数', () => {
    expect(() => parseTotp('otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP&counter=1')).toThrow(/时间/)
    expect(() => parseTotp('otpauth://totp/x?issuer=a')).toThrow(/secret/)
    expect(() => parseTotp('otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=4')).toThrow(/位数/)
    expect(() => parseTotp('otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&algorithm=MD5')).toThrow(/算法/)
  })
})

describe('formatCode', () => {
  it('6 位与 8 位分组显示', () => {
    expect(formatCode('123456')).toBe('123 456')
    expect(formatCode('12345678')).toBe('1234 5678')
  })
})
