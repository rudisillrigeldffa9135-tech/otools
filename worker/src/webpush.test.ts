// @vitest-environment node
import { b64urlDecode, b64urlEncode, encryptPayload, vapidJwt } from './webpush'

const enc = new TextEncoder()

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

/** 按 RFC 8291 以浏览器（接收方）的身份解密 */
async function decryptAsBrowser(body: Uint8Array, uaKeys: CryptoKeyPair, uaPublic: Uint8Array, auth: Uint8Array) {
  const salt = body.slice(0, 16)
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16)
  const idlen = body[20]
  const asPublic = body.slice(21, 21 + idlen)
  const ciphertext = body.slice(21 + idlen)
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaKeys.privateKey, 256))
  const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPublic, ...asPublic])
  const ikm = await hkdf(auth, ecdh, info, 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext))
  return { rs, idlen, text: new TextDecoder().decode(plain.slice(0, plain.lastIndexOf(2))), delimiter: plain[plain.length - 1] }
}

describe('推送内容加密（RFC 8291）', () => {
  it('浏览器端可以正确解密，记录头格式正确', async () => {
    const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
    const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey) as ArrayBuffer)
    const auth = crypto.getRandomValues(new Uint8Array(16))
    const message = JSON.stringify({ title: '待办提醒', body: '交周报 · 今天 15:00' })
    const body = await encryptPayload({ endpoint: 'https://push.example/x', p256dh: b64urlEncode(uaPublic), auth: b64urlEncode(auth) }, enc.encode(message))
    const r = await decryptAsBrowser(body, ua, uaPublic, auth)
    expect(r).toEqual({ rs: 4096, idlen: 65, text: message, delimiter: 2 })
  })

  it('base64url 编解码', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(65))
    expect(b64urlDecode(b64urlEncode(bytes))).toEqual(bytes)
    expect(b64urlEncode(new Uint8Array([251, 255]))).toBe('-_8')
  })
})

describe('推送签名（VAPID）', () => {
  it('用私钥签名的 JWT 可用公钥验证，载荷正确', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
    const jwt = await vapidJwt('https://fcm.googleapis.com', { privateKey: JSON.stringify(jwk), publicKey: '', subject: 'https://otools.example' }, 1_800_000_000)
    const [h, p, s] = jwt.split('.')
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h)))).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(p)))).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_800_000_000 + 12 * 3600, sub: 'https://otools.example' })
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, b64urlDecode(s), enc.encode(`${h}.${p}`))
    expect(ok).toBe(true)
  })
})
