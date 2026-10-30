/**
 * 导入 FinalShell 导出的服务器：解析其连接 JSON，并还原被加密的登录密码。
 *
 * FinalShell 的密码是「8 字节随机头 + DES(ECB/PKCS5) 密文」经 Base64 得到的；
 * DES 密钥由随机头通过一段固定的 java.util.Random 流程推导后取 MD5 的前 8 字节。
 * 浏览器的 SubtleCrypto 不支持 DES，这里用纯 JS 实现，全程在本地完成，不上传任何内容。
 */

/* ---------------- java.util.Random 复刻 ---------------- */

const MASK48 = (1n << 48n) - 1n
const MUL = 0x5DEECE66Dn
const ADD = 0xBn

class JavaRandom {
  private seed: bigint
  constructor(seed: bigint | number) {
    this.seed = (BigInt.asIntN(64, BigInt(seed)) ^ MUL) & MASK48
  }

  private next(bits: number): number {
    this.seed = (this.seed * MUL + ADD) & MASK48
    return Number(BigInt.asIntN(32, this.seed >> BigInt(48 - bits)))
  }

  nextInt(bound: number): number {
    let bits: number
    let val: number
    do {
      bits = this.next(31)
      val = bits % bound
    } while (bits - val + (bound - 1) < 0)
    return val
  }

  nextLong(): bigint {
    const hi = BigInt(this.next(32))
    const lo = BigInt(this.next(32))
    return BigInt.asIntN(64, (hi << 32n) + lo)
  }
}

/* ---------------- MD5（纯 JS） ---------------- */

function md5(bytes: Uint8Array): Uint8Array {
  const rotl = (x: number, c: number) => (x << c) | (x >>> (32 - c))
  const K = new Int32Array(64)
  for (let i = 0; i < 64; i++)
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0
  const SH = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21]
  const ml = bytes.length
  const withOne = ml + 1
  const padded = new Uint8Array((Math.floor((withOne + 8) / 64) + 1) * 64)
  padded.set(bytes)
  padded[ml] = 0x80
  const bitLen = BigInt(ml) * 8n
  const dv = new DataView(padded.buffer)
  dv.setUint32(padded.length - 8, Number(bitLen & 0xFFFFFFFFn), true)
  dv.setUint32(padded.length - 4, Number((bitLen >> 32n) & 0xFFFFFFFFn), true)

  let a0 = 0x67452301
  let b0 = 0xEFCDAB89 | 0
  let c0 = 0x98BADCFE | 0
  let d0 = 0x10325476
  const M = new Int32Array(16)
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++)
      M[i] = dv.getUint32(off + i * 4, true) | 0
    let a = a0
    let b = b0
    let c = c0
    let d = d0
    for (let i = 0; i < 64; i++) {
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      }
      else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      }
      else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      }
      else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      f = (f + a + K[i] + M[g]) | 0
      a = d
      d = c
      c = b
      b = (b + rotl(f, SH[i])) | 0
    }
    a0 = (a0 + a) | 0
    b0 = (b0 + b) | 0
    c0 = (c0 + c) | 0
    d0 = (d0 + d) | 0
  }
  const out = new Uint8Array(16)
  const odv = new DataView(out.buffer)
  odv.setUint32(0, a0 >>> 0, true)
  odv.setUint32(4, b0 >>> 0, true)
  odv.setUint32(8, c0 >>> 0, true)
  odv.setUint32(12, d0 >>> 0, true)
  return out
}

/* ---------------- DES（ECB 解密，纯 JS） ---------------- */

const PC1 = [57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60, 52, 44, 36, 63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4]
const PC2 = [14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10, 23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2, 41, 52, 31, 37, 47, 55, 30, 40, 51, 45, 33, 48, 44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32]
const SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1]
const IP = [58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4, 62, 54, 46, 38, 30, 22, 14, 6, 64, 56, 48, 40, 32, 24, 16, 8, 57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3, 61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7]
const FP = [40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31, 38, 6, 46, 14, 54, 22, 62, 30, 37, 5, 45, 13, 53, 21, 61, 29, 36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27, 34, 2, 42, 10, 50, 18, 58, 26, 33, 1, 41, 9, 49, 17, 57, 25]
const EXP = [32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9, 8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17, 16, 17, 18, 19, 20, 21, 20, 21, 22, 23, 24, 25, 24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1]
const PERM = [16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10, 2, 8, 24, 14, 32, 27, 3, 9, 19, 13, 30, 6, 22, 11, 4, 25]
const SBOX = [
  [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7, 0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8, 4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0, 15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13],
  [15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10, 3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10, 6, 9, 11, 5, 0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15, 13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9],
  [10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8, 13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1, 13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7, 1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12],
  [7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15, 13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9, 10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4, 3, 15, 0, 6, 10, 1, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14],
  [2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9, 14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6, 4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14, 11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3],
  [12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11, 10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8, 9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6, 4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13],
  [4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1, 13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6, 1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2, 6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12],
  [13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7, 1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2, 7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8, 2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11],
]

function bytesToBits(bytes: Uint8Array): number[] {
  const bits: number[] = []
  for (const b of bytes) {
    for (let i = 7; i >= 0; i--)
      bits.push((b >> i) & 1)
  }
  return bits
}

function bitsToBytes(bits: number[]): Uint8Array {
  const out = new Uint8Array(bits.length / 8)
  for (let i = 0; i < out.length; i++) {
    let v = 0
    for (let j = 0; j < 8; j++)
      v = (v << 1) | bits[i * 8 + j]
    out[i] = v
  }
  return out
}

function permute(bits: number[], table: number[]): number[] {
  return table.map(x => bits[x - 1])
}

function keySchedule(keyBytes: Uint8Array): number[][] {
  const k = permute(bytesToBits(keyBytes), PC1)
  let c = k.slice(0, 28)
  let d = k.slice(28)
  const ks: number[][] = []
  for (let r = 0; r < 16; r++) {
    const s = SHIFTS[r]
    c = c.slice(s).concat(c.slice(0, s))
    d = d.slice(s).concat(d.slice(0, s))
    ks.push(permute(c.concat(d), PC2))
  }
  return ks
}

function feistel(rbits: number[], k: number[]): number[] {
  const e = permute(rbits, EXP)
  const x = e.map((b, i) => b ^ k[i])
  const out: number[] = []
  for (let i = 0; i < 8; i++) {
    const six = x.slice(i * 6, i * 6 + 6)
    const row = (six[0] << 1) | six[5]
    const col = (six[1] << 3) | (six[2] << 2) | (six[3] << 1) | six[4]
    const val = SBOX[i][row * 16 + col]
    for (let j = 3; j >= 0; j--)
      out.push((val >> j) & 1)
  }
  return permute(out, PERM)
}

function processBlock(block8: Uint8Array, ks: number[][]): Uint8Array {
  const bits = permute(bytesToBits(block8), IP)
  let l = bits.slice(0, 32)
  let r = bits.slice(32)
  for (let round = 0; round < 16; round++) {
    const f = feistel(r, ks[round])
    const nr = l.map((b, i) => b ^ f[i])
    l = r
    r = nr
  }
  return bitsToBytes(permute(r.concat(l), FP))
}

function desDecryptEcb(data: Uint8Array, key: Uint8Array): Uint8Array {
  if (data.length === 0 || data.length % 8 !== 0)
    throw new Error('密文长度不合法')
  const ks = keySchedule(key).reverse()
  const out = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i += 8)
    out.set(processBlock(data.subarray(i, i + 8), ks), i)
  // PKCS5 去填充
  const pad = out[out.length - 1]
  if (pad < 1 || pad > 8)
    throw new Error('填充不合法')
  return out.subarray(0, out.length - pad)
}

/* ---------------- 密钥推导与解密入口 ---------------- */

function ranDomKey(head: Int8Array): Uint8Array {
  const r0 = new JavaRandom(head[5]).nextInt(127)
  const ks = 3680984568597093857n / BigInt(r0)
  const random = new JavaRandom(ks)
  for (let i = 0; i < head[0]; i++)
    random.nextLong()
  const n = random.nextLong()
  const r2 = new JavaRandom(n)
  const ld = [BigInt(head[4]), r2.nextLong(), BigInt(head[7]), BigInt(head[3]), r2.nextLong(), BigInt(head[1]), random.nextLong(), BigInt(head[2])]
  const dv = new DataView(new ArrayBuffer(64))
  ld.forEach((l, i) => dv.setBigInt64(i * 8, BigInt.asIntN(64, l), false))
  return md5(new Uint8Array(dv.buffer))
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++)
    out[i] = bin.charCodeAt(i)
  return out
}

/** 还原 FinalShell 保存的密码；空串或无法解析时返回空串 */
export function decodeFinalShellPassword(encoded: string): string {
  const s = (encoded || '').trim()
  if (!s)
    return ''
  const buf = base64ToBytes(s)
  if (buf.length <= 8)
    return ''
  const head = new Int8Array(buf.buffer, 0, 8)
  const key = ranDomKey(head).subarray(0, 8)
  const plain = desDecryptEcb(buf.subarray(8), key)
  return new TextDecoder().decode(plain)
}

/* ---------------- 解析连接 JSON ---------------- */

export interface FsImported {
  name: string
  host: string
  port: number
  username: string
  password: string
  note: string
  /** 来自导入时的文件夹层级，作为分组名；空为未分组 */
  group: string
  /** 用了私钥 / 证书但浏览器拿不到文件时的提示 */
  keyHint: string
}

export interface FsFile {
  /** 相对路径（webkitRelativePath），用来推断分组；没有目录时用文件名 */
  path: string
  text: string
}

/** 分组名取连接文件所在的直接父目录名；位于顶层或单选文件时为空（未分组） */
function groupFromPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  parts.pop() // 文件名
  return parts.length ? parts[parts.length - 1] : ''
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

/**
 * 解析一批 FinalShell 导出文件；只保留 SSH 连接（有 host 的条目），
 * 密码在本地解密。无法识别的文件被跳过。
 */
export function parseFinalShellFiles(files: FsFile[]): FsImported[] {
  const out: FsImported[] = []
  for (const f of files) {
    let o: any
    try {
      o = JSON.parse(f.text)
    }
    catch {
      continue
    }
    if (!o || typeof o !== 'object')
      continue
    const host = str(o.host).trim()
    if (!host)
      continue
    // 协议：FinalShell 的 SSH 连接 protocol 为空或 "ssh"；其余（rdp/vnc/ftp 等）跳过
    const protocol = str(o.protocol ?? o.proto).toLowerCase()
    if (protocol && !/ssh|sftp/.test(protocol))
      continue
    let password = ''
    try {
      password = decodeFinalShellPassword(str(o.password))
    }
    catch {
      password = ''
    }
    // authType：2 通常表示公钥登录；FinalShell 的私钥文件浏览器读不到
    const authType = Number(o.authType ?? o.auth_type ?? 0)
    const usesKey = authType === 2 || !!str(o.secretKey).trim()
    out.push({
      name: str(o.name).trim() || host,
      host,
      port: Number(o.port) || 22,
      username: str(o.user_name ?? o.userName ?? o.user).trim(),
      password,
      note: str(o.comment ?? o.description).trim(),
      group: groupFromPath(f.path),
      keyHint: usesKey && !password ? '原连接使用私钥登录，导入后需在编辑中选择私钥' : '',
    })
  }
  return out
}
