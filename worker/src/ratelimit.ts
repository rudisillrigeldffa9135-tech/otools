import type { Env } from './lib'
import { ApiError, now } from './lib'

/**
 * 失败次数限流（固定窗口，存 D1）：只统计失败的请求，正常使用不受影响。
 * 用法：先 assertNotLimited 检查，失败后再 recordFailure 计数。
 */

/** 客户端标识：IPv6 按 /64 前缀归并，避免攻击者在同一网段内轮换地址 */
export function clientKey(ip: string) {
  if (!ip)
    return 'unknown'
  if (!ip.includes(':'))
    return ip
  const [head, tail = ''] = ip.toLowerCase().split('::')
  const h = head ? head.split(':') : []
  const t = tail ? tail.split(':') : []
  const groups = ip.includes('::') ? [...h, ...Array.from({ length: Math.max(0, 8 - h.length - t.length) }, () => '0'), ...t] : h
  return `${groups.slice(0, 4).map(g => g.replace(/^0+(?=.)/, '')).join(':')}::/64`
}

export async function assertNotLimited(env: Env, key: string, limit: number) {
  const row = await env.DB.prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?').bind(key).first<{ count: number, reset_at: number }>()
  const t = now()
  if (row && row.reset_at > t && row.count >= limit) {
    const minutes = Math.ceil((row.reset_at - t) / 60)
    throw new ApiError(429, `尝试次数过多，请 ${minutes} 分钟后再试`)
  }
}

export async function recordFailure(env: Env, key: string, windowSeconds: number) {
  const t = now()
  await env.DB.batch([
    // 顺手清理过期的计数
    env.DB.prepare('DELETE FROM rate_limits WHERE reset_at <= ? AND key != ?').bind(t, key),
    env.DB.prepare(
      `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
         reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END`,
    ).bind(key, t + windowSeconds, t, t),
  ])
}
