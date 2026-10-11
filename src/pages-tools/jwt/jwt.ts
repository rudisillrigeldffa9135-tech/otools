/** JWT 解析与 HMAC 签名校验（纯 JS，H5 与小程序通用） */
import Base64Enc from 'crypto-js/enc-base64'
import Utf8 from 'crypto-js/enc-utf8'
import HmacSHA256 from 'crypto-js/hmac-sha256'
import HmacSHA384 from 'crypto-js/hmac-sha384'
import HmacSHA512 from 'crypto-js/hmac-sha512'
import { Base64 } from 'js-base64'

export interface DecodedJwt {
  header: Record<string, any>
  payload: Record<string, any>
  /** 三段原文 */
  parts: [string, string, string]
}

const B64URL = /^[\w-]*$/

function decodePart(part: string, name: string) {
  if (!B64URL.test(part))
    throw new Error(`${name}不是合法的 Base64URL 编码`)
  let json: unknown
  try {
    json = JSON.parse(Base64.decode(part))
  }
  catch {
    throw new Error(`${name}解码后不是合法的 JSON`)
  }
  if (!json || typeof json !== 'object' || Array.isArray(json))
    throw new Error(`${name}应为 JSON 对象`)
  return json as Record<string, any>
}

/** 解析 JWT，允许带 Bearer 前缀；只做解码，不校验签名 */
export function decodeJwt(input: string): DecodedJwt {
  const token = input.trim().replace(/^Bearer\s+/i, '')
  const parts = token.split('.')
  if (parts.length === 5)
    throw new Error('这是加密的 JWE（5 段），无法直接解码')
  if (parts.length !== 3)
    throw new Error('JWT 应由「头部.载荷.签名」3 段组成，用 . 分隔')
  return {
    header: decodePart(parts[0], '头部'),
    payload: decodePart(parts[1], '载荷'),
    parts: parts as [string, string, string],
  }
}

/** 标准声明的中文说明 */
export const CLAIM_LABELS: Record<string, string> = {
  iss: '签发者',
  sub: '主题（通常是用户 ID）',
  aud: '接收方',
  exp: '过期时间',
  nbf: '生效时间',
  iat: '签发时间',
  jti: '唯一标识',
  alg: '签名算法',
  typ: '类型',
  kid: '密钥 ID',
  cty: '内容类型',
}

export const TIME_CLAIMS = ['exp', 'nbf', 'iat']

export type JwtState = 'valid' | 'expired' | 'notYet' | 'noExp'

/** 按 exp / nbf 判断当前是否有效（时间单位为秒） */
export function jwtState(payload: Record<string, any>, nowSec: number): { state: JwtState, text: string } {
  if (typeof payload.nbf === 'number' && payload.nbf > nowSec)
    return { state: 'notYet', text: `尚未生效（${durationText(payload.nbf - nowSec)}后生效）` }
  if (typeof payload.exp !== 'number')
    return { state: 'noExp', text: '未设置过期时间' }
  if (payload.exp <= nowSec)
    return { state: 'expired', text: `已过期（${durationText(nowSec - payload.exp)}前）` }
  return { state: 'valid', text: `有效（${durationText(payload.exp - nowSec)}后过期）` }
}

export function durationText(seconds: number) {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60)
    return `${s} 秒`
  if (s < 3600)
    return `${Math.floor(s / 60)} 分钟`
  if (s < 86400)
    return `${Math.floor(s / 3600)} 小时 ${Math.floor((s % 3600) / 60)} 分钟`
  return `${Math.floor(s / 86400)} 天 ${Math.floor((s % 86400) / 3600)} 小时`
}

const HMAC: Record<string, typeof HmacSHA256> = { HS256: HmacSHA256, HS384: HmacSHA384, HS512: HmacSHA512 }

export function isHmacAlg(alg: unknown) {
  return typeof alg === 'string' && alg in HMAC
}

/**
 * 校验 HS256/384/512 签名
 * @param secretIsBase64 密钥是否为 Base64 编码（部分服务端这样配置）
 */
export function verifyHmac(jwt: DecodedJwt, secret: string, secretIsBase64 = false) {
  const alg = jwt.header.alg
  if (!isHmacAlg(alg))
    throw new Error(`暂不支持校验 ${alg} 签名，仅支持 HS256 / HS384 / HS512`)
  const key = secretIsBase64 ? Base64Enc.parse(secret.trim()) : Utf8.parse(secret)
  const sig = HMAC[alg](`${jwt.parts[0]}.${jwt.parts[1]}`, key)
    .toString(Base64Enc)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return sig === jwt.parts[2]
}
