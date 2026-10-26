export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  /** 密码库主密钥，base64 编码的 32 字节随机数，用 `wrangler secret put VAULT_KEY` 配置 */
  VAULT_KEY: string
  /** 'true' 时开放自助注册（注册的都是普通用户），默认只能由管理员创建账号 */
  ALLOW_REGISTER?: string
  /** 密码哈希的 PBKDF2 迭代次数，免费套餐 CPU 超限（错误 1102）时可调低，最大 100000 */
  PBKDF2_ITERATIONS?: string
  /** 文件快传的存储桶（R2）；账户未开通 R2 时部署脚本会去掉这个绑定，相关接口返回 503 */
  FILES?: R2Bucket
  /** 浏览器推送的 VAPID 密钥对（部署脚本自动生成）：私钥为 JWK JSON，公钥为 base64url */
  VAPID_PRIVATE_KEY?: string
  VAPID_PUBLIC_KEY?: string
}

export type Role = 'admin' | 'user'

export interface SessionUser {
  id: number
  username: string
  nickname: string
  role: Role
}

/** 抛出后由路由层转换为对应状态码的 JSON 响应 */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** 响应格式与前端 src/http/http.ts 约定一致：{ code, data, message } */
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

export function ok(data: unknown = null) {
  return json({ code: 200, data, message: 'ok' })
}

export function fail(status: number, message: string) {
  return json({ code: status, data: null, message }, status)
}

export function now() {
  return Math.floor(Date.now() / 1000)
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json()
    if (body && typeof body === 'object' && !Array.isArray(body))
      return body as Record<string, unknown>
  }
  catch {}
  throw new ApiError(400, '请求体必须是 JSON 对象')
}

interface StrOptions {
  required?: boolean
  max?: number
  min?: number
}

/** 读取字符串字段并校验长度；可选字段缺省时返回空串 */
export function str(value: unknown, label: string, { required = false, max = 200, min = 0 }: StrOptions = {}) {
  if (value === undefined || value === null || value === '') {
    if (required)
      throw new ApiError(400, `${label}不能为空`)
    return ''
  }
  if (typeof value !== 'string')
    throw new ApiError(400, `${label}格式不正确`)
  if (value.length > max)
    throw new ApiError(400, `${label}不能超过 ${max} 个字符`)
  if (value.length < min)
    throw new ApiError(400, `${label}至少 ${min} 个字符`)
  return value
}

export function username(value: unknown) {
  const v = str(value, '用户名', { required: true, max: 32 }).trim()
  if (!/^[\w.-]{3,32}$/.test(v))
    throw new ApiError(400, '用户名需为 3~32 位字母、数字、下划线、点或短横线')
  return v
}

export function password(value: unknown, label = '密码') {
  return str(value, label, { required: true, min: 8, max: 128 })
}

export function role(value: unknown): Role {
  if (value !== 'admin' && value !== 'user')
    throw new ApiError(400, '角色只能是 admin 或 user')
  return value
}

export function pbkdf2Iterations(env: Env) {
  const n = Number(env.PBKDF2_ITERATIONS)
  return Number.isInteger(n) && n >= 10_000 && n <= 100_000 ? n : 100_000
}

export function isUniqueViolation(e: unknown) {
  return e instanceof Error && /UNIQUE constraint failed/i.test(e.message)
}
