/**
 * Web Push（浏览器推送）：VAPID 签名（RFC 8292）+ 消息加密（RFC 8291，aes128gcm），只用 WebCrypto，不依赖第三方库。
 * VAPID 密钥对由部署脚本生成：私钥为 JWK（JSON），公钥为未压缩点（65 字节）的 base64url。
 */

export interface PushTarget {
  endpoint: string
  /** 浏览器提供的公钥（base64url，65 字节） */
  p256dh: string
  /** 浏览器提供的认证密钥（base64url，16 字节） */
  auth: string
}

export interface VapidKeys {
  publicKey: string
  /** JWK JSON */
  privateKey: string
  /** mailto: 或 https: 联系方式 */
  subject: string
}

export function b64urlEncode(bytes: Uint8Array | ArrayBuffer) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const b of arr)
    s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(str: string) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(s + '='.repeat((4 - s.length % 4) % 4))
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

const enc = new TextEncoder()

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

/** 加密推送内容（单条记录）；返回请求体 */
export async function encryptPayload(target: PushTarget, payload: Uint8Array, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const uaPublic = b64urlDecode(target.p256dh)
  const authSecret = b64urlDecode(target.auth)
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey) as ArrayBuffer)
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as any, local.privateKey, 256))
  const ikm = await hkdf(authSecret, ecdhSecret, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // 最后（也是唯一）一条记录：内容后面跟 0x02 分隔符
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))))
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = asPublic.length
  header.set(asPublic, 21)
  return concat(header, ciphertext)
}

const vapidKeyCache = new Map<string, Promise<CryptoKey>>()

/** VAPID JWT（ES256），有效期 12 小时 */
export async function vapidJwt(audience: string, keys: VapidKeys, nowSec = Math.floor(Date.now() / 1000)) {
  let key = vapidKeyCache.get(keys.privateKey)
  if (!key) {
    key = crypto.subtle.importKey('jwk', JSON.parse(keys.privateKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
    vapidKeyCache.set(keys.privateKey, key)
  }
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const body = b64urlEncode(enc.encode(JSON.stringify({ aud: audience, exp: nowSec + 12 * 3600, sub: keys.subject })))
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await key, enc.encode(`${header}.${body}`))
  return `${header}.${body}.${b64urlEncode(signature)}`
}

/**
 * 发送一条推送。返回 'ok'；订阅已失效（404 / 410）返回 'gone'，调用方应删除该订阅；其他失败返回 'error'
 */
export async function sendPush(target: PushTarget, data: unknown, keys: VapidKeys, ttl = 24 * 3600): Promise<'ok' | 'gone' | 'error'> {
  try {
    const url = new URL(target.endpoint)
    const jwt = await vapidJwt(url.origin, keys)
    const body = await encryptPayload(target, enc.encode(JSON.stringify(data)))
    const res = await fetch(target.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `vapid t=${jwt}, k=${keys.publicKey}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        'TTL': String(ttl),
        'Urgency': 'normal',
      },
      body,
    })
    if (res.status === 404 || res.status === 410)
      return 'gone'
    if (!res.ok) {
      console.warn('推送失败', res.status, (await res.text()).slice(0, 200))
      return 'error'
    }
    return 'ok'
  }
  catch (e) {
    console.warn('推送异常', e)
    return 'error'
  }
}
