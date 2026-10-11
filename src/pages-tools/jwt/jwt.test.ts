import { decodeJwt, durationText, jwtState, verifyHmac } from './jwt'

// jwt.io 的示例 token，密钥为 your-256-bit-secret
const SAMPLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

describe('decodeJwt', () => {
  it('解码头部与载荷，允许 Bearer 前缀与首尾空白', () => {
    const jwt = decodeJwt(`  Bearer ${SAMPLE}\n`)
    expect(jwt.header).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(jwt.payload).toEqual({ sub: '1234567890', name: 'John Doe', iat: 1516239022 })
  })

  it('支持载荷中的中文（UTF-8）', () => {
    const payload = btoa(String.fromCharCode(...new TextEncoder().encode('{"name":"张三"}'))).replace(/=+$/, '')
    expect(decodeJwt(`eyJhbGciOiJub25lIn0.${payload}.`).payload.name).toBe('张三')
  })

  it('段数不对或内容不是 JSON 时给出说明', () => {
    expect(() => decodeJwt('abc')).toThrow(/3 段/)
    expect(() => decodeJwt('a.b.c.d.e')).toThrow(/JWE/)
    expect(() => decodeJwt('aGVsbG8.aGVsbG8.x')).toThrow(/JSON/)
    expect(() => decodeJwt('a+b.c.d')).toThrow(/Base64URL/)
  })
})

describe('verifyHmac', () => {
  const jwt = decodeJwt(SAMPLE)

  it('密钥正确时校验通过，错误时不通过', () => {
    expect(verifyHmac(jwt, 'your-256-bit-secret')).toBe(true)
    expect(verifyHmac(jwt, 'wrong-secret')).toBe(false)
  })

  it('支持 Base64 编码的密钥', () => {
    expect(verifyHmac(jwt, btoa('your-256-bit-secret'), true)).toBe(true)
  })

  it('非 HMAC 算法给出说明', () => {
    expect(() => verifyHmac({ ...jwt, header: { alg: 'RS256' } }, 'x')).toThrow(/RS256/)
  })
})

describe('jwtState', () => {
  const now = 1_800_000_000
  it('按 exp / nbf 判断状态', () => {
    expect(jwtState({ exp: now + 3600 }, now).state).toBe('valid')
    expect(jwtState({ exp: now - 10 }, now).state).toBe('expired')
    expect(jwtState({ nbf: now + 60, exp: now + 3600 }, now).state).toBe('notYet')
    expect(jwtState({}, now).state).toBe('noExp')
  })

  it('时长文案', () => {
    expect(durationText(45)).toBe('45 秒')
    expect(durationText(3 * 3600 + 120)).toBe('3 小时 2 分钟')
    expect(durationText(2 * 86400 + 5 * 3600)).toBe('2 天 5 小时')
  })
})
