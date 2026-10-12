import type { Env } from './lib'
import { requireUser } from './auth'
import { ApiError, now } from './lib'

/**
 * 汇率：数据来自 ExchangeRate-API 的免费开放接口（每日更新，无需密钥，要求注明来源）。
 * 以 USD 为基准返回全部币种，前端自行换算交叉汇率；结果在 D1 中缓存 1 小时，
 * 上游不可用时退回到上一次的缓存。
 */

const SOURCE_URL = 'https://open.er-api.com/v6/latest/USD'
const CACHE_KEY = 'rates:USD'
const CACHE_SECONDS = 3600

interface RatesPayload {
  base: 'USD'
  rates: Record<string, number>
  /** 数据源的更新时间（秒） */
  updatedAt: number
  nextUpdateAt: number
  fetchedAt: number
}

async function fetchRates(): Promise<RatesPayload> {
  const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(8000) })
  if (!res.ok)
    throw new Error(`HTTP ${res.status}`)
  const body = await res.json() as { result: string, rates?: Record<string, number>, time_last_update_unix?: number, time_next_update_unix?: number }
  if (body.result !== 'success' || !body.rates?.CNY)
    throw new Error('数据格式不正确')
  return {
    base: 'USD',
    rates: body.rates,
    updatedAt: body.time_last_update_unix ?? now(),
    nextUpdateAt: body.time_next_update_unix ?? 0,
    fetchedAt: now(),
  }
}

export async function getRates(req: Request, env: Env) {
  await requireUser(req, env)
  const cached = await env.DB.prepare('SELECT value, expires_at FROM cache WHERE key = ?').bind(CACHE_KEY).first<{ value: string, expires_at: number }>()
  if (cached && cached.expires_at > now())
    return { ...JSON.parse(cached.value) as RatesPayload, stale: false }
  try {
    const fresh = await fetchRates()
    await env.DB.prepare('INSERT INTO cache (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at')
      .bind(CACHE_KEY, JSON.stringify(fresh), now() + CACHE_SECONDS)
      .run()
    return { ...fresh, stale: false }
  }
  catch (e) {
    console.error('获取汇率失败', e)
    // 上游出错时用旧数据兜底，并告诉前端数据可能不是最新
    if (cached)
      return { ...JSON.parse(cached.value) as RatesPayload, stale: true }
    throw new ApiError(502, '汇率数据暂时无法获取，请稍后重试')
  }
}
