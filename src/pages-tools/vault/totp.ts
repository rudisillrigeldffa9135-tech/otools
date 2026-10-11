/**
 * 两步验证码（TOTP，RFC 6238）。纯 JS 实现，H5 与小程序通用：
 * HMAC 使用项目已有的 crypto-js，不依赖 WebCrypto（小程序没有）。
 */
import Hex from 'crypto-js/enc-hex'
import HmacSHA1 from 'crypto-js/hmac-sha1'
import HmacSHA256 from 'crypto-js/hmac-sha256'
import HmacSHA512 from 'crypto-js/hmac-sha512'

export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512'

export interface TotpConfig {
  /** 解码后的密钥 */
  secret: Uint8Array
  digits: number
  /** 刷新周期（秒） */
  period: number
  algorithm: TotpAlgorithm
  /** 来自 otpauth 链接，可能为空 */
  issuer: string
  account: string
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Base32 解码，忽略空格、短横线与末尾的 = 填充，不区分大小写 */
export function base32Decode(input: string) {
  const s = input.replace(/[\s=-]/g, '').toUpperCase()
  if (!s || /[^A-Z2-7]/.test(s))
    throw new Error('密钥只能包含字母 A-Z 与数字 2-7')
  const out: number[] = []
  let bits = 0
  let value = 0
  for (const ch of s) {
    value = (value << 5) | BASE32.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xFF)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s)
  }
  catch {
    return s
  }
}

/**
 * 解析用户输入：Base32 密钥，或扫描二维码得到的 otpauth://totp/Issuer:account?secret=...&digits=6&period=30
 * @throws 格式不正确时抛出带中文说明的错误
 */
export function parseTotp(input: string): TotpConfig {
  const raw = input.trim()
  if (/^otpauth:\/\//i.test(raw)) {
    // otpauth://<类型>/<label>?<参数>，用字符串切分而不是正则，避免回溯问题
    const rest = raw.slice('otpauth://'.length)
    const slash = rest.indexOf('/')
    if (slash < 0 || rest.slice(0, slash).toLowerCase() !== 'totp')
      throw new Error('只支持基于时间的验证码（otpauth://totp/）')
    const q = rest.indexOf('?', slash)
    const params: Record<string, string> = {}
    for (const pair of (q < 0 ? '' : rest.slice(q + 1)).split('&')) {
      const [k, v = ''] = pair.split('=')
      if (k)
        params[k.toLowerCase()] = safeDecode(v)
    }
    const label = safeDecode(q < 0 ? rest.slice(slash + 1) : rest.slice(slash + 1, q))
    const [labelIssuer, account] = label.includes(':') ? label.split(/:(.*)/s) : ['', label]
    const algorithm = (params.algorithm || 'SHA1').toUpperCase()
    if (algorithm !== 'SHA1' && algorithm !== 'SHA256' && algorithm !== 'SHA512')
      throw new Error(`不支持的算法：${algorithm}`)
    const digits = params.digits ? Number(params.digits) : 6
    const period = params.period ? Number(params.period) : 30
    if (!Number.isInteger(digits) || digits < 6 || digits > 8)
      throw new Error('验证码位数只能是 6~8 位')
    if (!Number.isInteger(period) || period < 1 || period > 300)
      throw new Error('刷新周期不正确')
    if (!params.secret)
      throw new Error('链接中缺少 secret 参数')
    return {
      secret: base32Decode(params.secret),
      digits,
      period,
      algorithm,
      issuer: params.issuer || labelIssuer.trim(),
      account: account.trim(),
    }
  }
  return { secret: base32Decode(raw), digits: 6, period: 30, algorithm: 'SHA1', issuer: '', account: '' }
}

const HMAC = { SHA1: HmacSHA1, SHA256: HmacSHA256, SHA512: HmacSHA512 }

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/** HOTP（RFC 4226）：counter 为 8 字节大端整数 */
export function hotp(config: Pick<TotpConfig, 'secret' | 'digits' | 'algorithm'>, counter: number) {
  const msg = new Uint8Array(8)
  let c = counter
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xFF
    c = Math.floor(c / 256)
  }
  const mac = HMAC[config.algorithm](Hex.parse(toHex(msg)), Hex.parse(toHex(config.secret))).toString(Hex)
  const offset = Number.parseInt(mac.slice(-1), 16)
  const binary = Number.parseInt(mac.slice(offset * 2, offset * 2 + 8), 16) & 0x7FFFFFFF
  return String(binary % 10 ** config.digits).padStart(config.digits, '0')
}

/** 当前验证码与剩余秒数 */
export function totp(config: TotpConfig, timeMs = Date.now()) {
  const seconds = Math.floor(timeMs / 1000)
  return {
    code: hotp(config, Math.floor(seconds / config.period)),
    remaining: config.period - (seconds % config.period),
  }
}

/** 123456 → 123 456，便于阅读 */
export function formatCode(code: string) {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : code
}
