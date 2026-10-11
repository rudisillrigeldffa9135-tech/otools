/**
 * 对称加密：AES / DES / 3DES，基于 crypto-js（H5 与小程序通用）。
 * 支持直接指定密钥与 IV，或用口令派生（与 OpenSSL `enc -md md5` 兼容的 Salted__ 格式）。
 */
import type { lib } from 'crypto-js'
import AES from 'crypto-js/aes'
import CryptoJS from 'crypto-js/core'
import Base64 from 'crypto-js/enc-base64'
import Hex from 'crypto-js/enc-hex'
import Utf8 from 'crypto-js/enc-utf8'
import CFB from 'crypto-js/mode-cfb'
import CTR from 'crypto-js/mode-ctr'
import ECB from 'crypto-js/mode-ecb'
import OFB from 'crypto-js/mode-ofb'
import AnsiX923 from 'crypto-js/pad-ansix923'
import Iso10126 from 'crypto-js/pad-iso10126'
import NoPadding from 'crypto-js/pad-nopadding'
import ZeroPadding from 'crypto-js/pad-zeropadding'
import TripleDES from 'crypto-js/tripledes'

export type Algorithm = 'AES' | 'DES' | '3DES'
export type Mode = 'CBC' | 'ECB' | 'CFB' | 'OFB' | 'CTR'
export type Padding = 'Pkcs7' | 'ZeroPadding' | 'NoPadding' | 'Iso10126' | 'AnsiX923'
export type Encoding = 'utf8' | 'hex' | 'base64'
export type KeyType = 'raw' | 'passphrase'

export interface CipherOptions {
  algorithm: Algorithm
  mode: Mode
  padding: Padding
  keyType: KeyType
  key: string
  keyEncoding: Encoding
  iv: string
  ivEncoding: Encoding
  /** 明文的编码：加密时用于解析输入，解密时用于输出 */
  textEncoding: Encoding
  /** 密文的编码 */
  outputEncoding: 'base64' | 'hex'
}

// tripledes 模块同时注册了 DES 与 TripleDES
const ALGOS = { 'AES': AES, 'DES': (CryptoJS as any).DES ?? (TripleDES as any).DES, '3DES': TripleDES } as const
const MODES = { CBC: CryptoJS.mode.CBC, ECB, CFB, OFB, CTR }
const PADS = { Pkcs7: CryptoJS.pad.Pkcs7, ZeroPadding, NoPadding, Iso10126, AnsiX923 }
const ENCODERS = { utf8: Utf8, hex: Hex, base64: Base64 }

/** 分组长度（字节） */
export function blockSize(algorithm: Algorithm) {
  return algorithm === 'AES' ? 16 : 8
}

/** 允许的密钥长度（字节） */
export function keySizes(algorithm: Algorithm) {
  return algorithm === 'AES' ? [16, 24, 32] : algorithm === 'DES' ? [8] : [16, 24]
}

export function needsIv(o: Pick<CipherOptions, 'mode' | 'keyType'>) {
  return o.keyType === 'raw' && o.mode !== 'ECB'
}

/** 按编码解析字符串，格式不对时给出中文提示 */
export function parseBytes(s: string, encoding: Encoding, label: string): lib.WordArray {
  const v = encoding === 'utf8' ? s : s.replace(/\s+/g, '')
  if (encoding === 'hex' && (!/^[\da-f]*$/i.test(v) || v.length % 2))
    throw new Error(`${label}不是有效的十六进制（只能包含 0-9 a-f，且长度为偶数）`)
  if (encoding === 'base64' && !/^[\w+/]*={0,2}$/.test(v.replace(/-/g, '+').replace(/_/g, '/')))
    throw new Error(`${label}不是有效的 Base64`)
  if (encoding === 'base64')
    return Base64.parse(v.replace(/-/g, '+').replace(/_/g, '/'))
  return ENCODERS[encoding].parse(v)
}

function buildKeyIv(o: CipherOptions) {
  const key = parseBytes(o.key, o.keyEncoding, '密钥')
  const sizes = keySizes(o.algorithm)
  if (!sizes.includes(key.sigBytes))
    throw new Error(`${o.algorithm} 密钥需要 ${sizes.join(' / ')} 字节，当前 ${key.sigBytes} 字节`)
  let iv: lib.WordArray | undefined
  if (needsIv(o)) {
    iv = parseBytes(o.iv, o.ivEncoding, 'IV')
    const bs = blockSize(o.algorithm)
    if (iv.sigBytes !== bs)
      throw new Error(`${o.mode} 模式的 IV 需要 ${bs} 字节，当前 ${iv.sigBytes} 字节`)
  }
  return { key, iv }
}

function cfgOf(o: CipherOptions, iv?: lib.WordArray) {
  return { mode: MODES[o.mode], padding: PADS[o.padding], ...(iv ? { iv } : {}) } as any
}

/**
 * 加密
 * @param salt 口令模式下的 8 字节随机盐（由调用方生成：小程序没有 crypto-js 依赖的原生随机数）
 */
export function encrypt(text: string, o: CipherOptions, salt?: Uint8Array): string {
  const data = parseBytes(text, o.textEncoding, '明文')
  if (o.padding === 'NoPadding' && !['CFB', 'OFB', 'CTR'].includes(o.mode) && data.sigBytes % blockSize(o.algorithm))
    throw new Error(`不填充时，明文长度必须是 ${blockSize(o.algorithm)} 字节的整数倍（当前 ${data.sigBytes} 字节）`)
  const algo = ALGOS[o.algorithm]
  let result: lib.CipherParams
  if (o.keyType === 'passphrase') {
    if (!o.key)
      throw new Error('请输入口令')
    if (!salt || salt.length !== 8)
      throw new Error('缺少随机盐')
    result = algo.encrypt(data, o.key, { ...cfgOf(o), salt: Hex.parse(toHex(salt)) })
    // Salted__ + 盐 + 密文，与 OpenSSL 一致
    const full = CryptoJS.lib.WordArray.create([0x53616C74, 0x65645F5F]).concat(result.salt!).concat(result.ciphertext)
    return o.outputEncoding === 'hex' ? Hex.stringify(full) : Base64.stringify(full)
  }
  const { key, iv } = buildKeyIv(o)
  result = algo.encrypt(data, key, cfgOf(o, iv))
  return o.outputEncoding === 'hex' ? Hex.stringify(result.ciphertext) : Base64.stringify(result.ciphertext)
}

export function decrypt(cipherText: string, o: CipherOptions): string {
  const raw = parseBytes(cipherText.trim(), o.outputEncoding, '密文')
  if (!raw.sigBytes)
    throw new Error('密文为空')
  const algo = ALGOS[o.algorithm]
  let plain: lib.WordArray
  if (o.keyType === 'passphrase') {
    if (!o.key)
      throw new Error('请输入口令')
    if (raw.sigBytes < 16 || raw.words[0] !== 0x53616C74 || raw.words[1] !== 0x65645F5F)
      throw new Error('口令模式的密文应以 Salted__ 开头（Base64 通常以 U2FsdGVkX1 开头）')
    const salt = CryptoJS.lib.WordArray.create(raw.words.slice(2, 4), 8)
    const ciphertext = CryptoJS.lib.WordArray.create(raw.words.slice(4), raw.sigBytes - 16)
    plain = algo.decrypt(CryptoJS.lib.CipherParams.create({ ciphertext, salt }), o.key, cfgOf(o))
  }
  else {
    const { key, iv } = buildKeyIv(o)
    plain = algo.decrypt(CryptoJS.lib.CipherParams.create({ ciphertext: raw }), key, cfgOf(o, iv))
  }
  if (plain.sigBytes < 0 || (plain.sigBytes === 0 && raw.sigBytes > 0 && o.padding !== 'NoPadding'))
    throw new Error('解密失败：密钥、IV、模式或填充方式不匹配')
  if (o.textEncoding === 'utf8') {
    try {
      const s = Utf8.stringify(plain)
      if (s.includes('�'))
        throw new Error('bad')
      return s
    }
    catch {
      throw new Error('解密结果不是有效的 UTF-8 文本：可能是密钥、IV 或模式不对，也可以把「明文编码」改为 Hex 查看原始字节')
    }
  }
  return ENCODERS[o.textEncoding].stringify(plain)
}

export function toHex(bytes: Uint8Array) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/** 随机字节按指定编码输出，用于「随机生成」密钥 / IV */
export function encodeBytes(bytes: Uint8Array, encoding: Encoding) {
  const wa = Hex.parse(toHex(bytes))
  if (encoding === 'base64')
    return Base64.stringify(wa)
  if (encoding === 'hex')
    return Hex.stringify(wa)
  // UTF-8 时用可打印字符，保证复制粘贴不出错
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from(bytes, b => chars[b % chars.length]).join('')
}
