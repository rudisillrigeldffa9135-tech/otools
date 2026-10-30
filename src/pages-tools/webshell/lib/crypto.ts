/**
 * WebShell 端到端加密（只在浏览器里进行，服务端拿不到明文和主密码）
 *
 * - 主密码 --PBKDF2-SHA256（60 万次）--> 包装密钥 KEK
 * - 随机生成的数据密钥 DEK（AES-256-GCM）用 KEK 加密后存到服务端（wrappedKey）
 * - 每个条目用 DEK 加密；附加数据（AAD）绑定条目的 id 与类型，防止密文被挪用到别的条目
 * - 修改主密码只需用新的 KEK 重新加密 DEK，条目不用重新加密
 */

export const KDF_ITERATIONS = 600_000

export interface KdfParams {
  alg: 'PBKDF2-SHA256'
  iterations: number
  /** base64 */
  salt: string
}

export interface VaultBlob {
  /** KdfParams 的 JSON */
  kdf: string
  /** base64(iv 12 字节 + 加密后的 DEK) */
  wrappedKey: string
}

const enc = new TextEncoder()
const dec = new TextDecoder()

export function toBase64(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromBase64(str: string) {
  const bin = atob(str)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++)
    out[i] = bin.charCodeAt(i)
  return out
}

function random(n: number) {
  return crypto.getRandomValues(new Uint8Array(n))
}

async function deriveKek(password: string, params: KdfParams) {
  if (params.alg !== 'PBKDF2-SHA256')
    throw new Error('不支持的密钥派生算法')
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(params.salt), iterations: params.iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  )
}

async function wrap(dek: CryptoKey, password: string, iterations = KDF_ITERATIONS): Promise<VaultBlob> {
  const params: KdfParams = { alg: 'PBKDF2-SHA256', iterations, salt: toBase64(random(16)) }
  const kek = await deriveKek(password, params)
  const iv = random(12)
  const wrapped = new Uint8Array(await crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv }))
  const blob = new Uint8Array(iv.length + wrapped.length)
  blob.set(iv)
  blob.set(wrapped, iv.length)
  return { kdf: JSON.stringify(params), wrappedKey: toBase64(blob) }
}

async function unwrap(vault: VaultBlob, password: string, extractable: boolean) {
  const params = JSON.parse(vault.kdf) as KdfParams
  const kek = await deriveKek(password, params)
  const blob = fromBase64(vault.wrappedKey)
  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      blob.subarray(12),
      kek,
      { name: 'AES-GCM', iv: blob.subarray(0, 12) },
      { name: 'AES-GCM', length: 256 },
      extractable,
      ['encrypt', 'decrypt'],
    )
  }
  catch {
    throw new Error('主密码不正确')
  }
}

/** 首次设置主密码：生成数据密钥，返回要上传的密文与日常使用的（不可导出的）密钥 */
export async function createVault(password: string, iterations = KDF_ITERATIONS) {
  const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const blob = await wrap(dek, password, iterations)
  // 日常使用不可导出的副本，页面里的脚本也无法把原始密钥读出来
  const key = await unwrap(blob, password, false)
  return { blob, key }
}

/** 用主密码解锁，密码错误时抛出「主密码不正确」 */
export function unlockVault(vault: VaultBlob, password: string) {
  return unwrap(vault, password, false)
}

/** 修改主密码：用旧密码取出数据密钥，再用新密码重新加密 */
export async function changeVaultPassword(vault: VaultBlob, oldPassword: string, newPassword: string, iterations = KDF_ITERATIONS) {
  const dek = await unwrap(vault, oldPassword, true)
  return wrap(dek, newPassword, iterations)
}

function aad(id: string, kind: string) {
  return enc.encode(`otools-webshell:v1:${kind}:${id}`)
}

/** 加密条目，输出 'v1.' + base64(iv + 密文) */
export async function encryptItem(key: CryptoKey, id: string, kind: string, value: unknown) {
  const iv = random(12)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(id, kind) }, key, enc.encode(JSON.stringify(value))))
  const blob = new Uint8Array(iv.length + ct.length)
  blob.set(iv)
  blob.set(ct, iv.length)
  return `v1.${toBase64(blob)}`
}

export async function decryptItem<T>(key: CryptoKey, id: string, kind: string, data: string): Promise<T> {
  if (!data.startsWith('v1.'))
    throw new Error('不支持的数据格式')
  const blob = fromBase64(data.slice(3))
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.subarray(0, 12), additionalData: aad(id, kind) }, key, blob.subarray(12))
  return JSON.parse(dec.decode(pt)) as T
}

/* ---------------- 在此设备上记住（可选） ---------------- */
// 把不可导出的 CryptoKey 存进 IndexedDB：页面脚本能用它解密，但无法读出原始密钥；
// 主密码修改后（updatedAt 变化）自动失效。公共电脑上不要开启。

const DB_NAME = 'otools-webshell'
const STORE = 'keys'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  finally {
    db.close()
  }
}

export async function rememberKey(userId: number, key: CryptoKey, vaultUpdatedAt: number) {
  await tx('readwrite', s => s.put({ key, vaultUpdatedAt }, String(userId)))
}

export async function recallKey(userId: number, vaultUpdatedAt: number): Promise<CryptoKey | null> {
  try {
    const v = await tx<{ key: CryptoKey, vaultUpdatedAt: number } | undefined>('readonly', s => s.get(String(userId)))
    return v && v.vaultUpdatedAt === vaultUpdatedAt ? v.key : null
  }
  catch {
    return null
  }
}

export async function forgetKey(userId: number) {
  try {
    await tx('readwrite', s => s.delete(String(userId)))
  }
  catch {}
}
