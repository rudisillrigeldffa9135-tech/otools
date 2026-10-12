/**
 * 纯 Web Crypto 实现，Workers / Node 20+ 通用（便于 vitest 直接测试）
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Workers 的 PBKDF2 上限是 100000 次迭代 */
export const DEFAULT_PBKDF2_ITERATIONS = 100_000

export function toBase64(bytes: Uint8Array) {
  let bin = ''
  for (const b of bytes)
    bin += String.fromCharCode(b)
  return btoa(bin)
}

export function fromBase64(str: string) {
  const bin = atob(str)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++)
    bytes[i] = bin.charCodeAt(i)
  return bytes
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length)
    return false
  let diff = 0
  for (let i = 0; i < a.length; i++)
    diff |= a[i] ^ b[i]
  return diff === 0
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return new Uint8Array(bits)
}

/** 结果格式：pbkdf2$<迭代次数>$<salt>$<hash>，迭代次数随哈希保存，日后调整不影响旧密码 */
export async function hashPassword(password: string, iterations = DEFAULT_PBKDF2_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(password, salt, iterations)
  return `pbkdf2$${iterations}$${toBase64(salt)}$${toBase64(hash)}`
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iterations, salt, hash] = stored.split('$')
  if (scheme !== 'pbkdf2' || !iterations || !salt || !hash)
    return false
  const actual = await pbkdf2(password, fromBase64(salt), Number(iterations))
  return timingSafeEqual(actual, fromBase64(hash))
}

/** 32 字节随机 token（base64url） */
export function randomToken() {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function sha256Hex(text: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)))
  return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 由主密钥（VAULT_KEY，base64 编码的 32 字节）经 HKDF 为每个用户派生独立的 AES-GCM 密钥，
 * 某个用户的密文即便被搬到另一个用户名下也无法解密。
 */
const keyCache = new Map<string, Promise<CryptoKey>>()
const KEY_CACHE_SIZE = 200

/** 同一个 Worker 实例内缓存派生出的密钥，批量解密（列表、密码体检）时不必每条都重新派生 */
function deriveVaultKey(masterKeyB64: string, userId: number) {
  const cacheKey = `${userId}:${masterKeyB64}`
  let key = keyCache.get(cacheKey)
  if (!key) {
    key = deriveVaultKeyUncached(masterKeyB64, userId)
    // 派生失败（如 VAULT_KEY 配置错误）不缓存
    key.catch(() => keyCache.delete(cacheKey))
    if (keyCache.size >= KEY_CACHE_SIZE)
      keyCache.delete(keyCache.keys().next().value!)
    keyCache.set(cacheKey, key)
  }
  return key
}

async function deriveVaultKeyUncached(masterKeyB64: string, userId: number) {
  let raw: Uint8Array
  try {
    raw = fromBase64(masterKeyB64 || '')
  }
  catch {
    raw = new Uint8Array()
  }
  if (raw.length < 32)
    throw new Error('VAULT_KEY 未配置或长度不足 32 字节')
  const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: encoder.encode(`otools-vault:${userId}`) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** 密文格式：v1.<iv>.<ciphertext> */
export async function encryptJson(masterKeyB64: string, userId: number, data: unknown) {
  const key = await deriveVaultKey(masterKeyB64, userId)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(data)))
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(ct))}`
}

export async function decryptJson<T>(masterKeyB64: string, userId: number, payload: string): Promise<T> {
  const [version, iv, ct] = payload.split('.')
  if (version !== 'v1' || !iv || !ct)
    throw new Error('不支持的密文格式')
  const key = await deriveVaultKey(masterKeyB64, userId)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, key, fromBase64(ct))
  return JSON.parse(decoder.decode(plain)) as T
}
