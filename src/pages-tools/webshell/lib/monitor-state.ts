/**
 * 服务器监控的采样调度：
 * - 监控面板打开时按设置的间隔（默认 3 秒）采样
 * - 停留在概览页时，已连接的会话每 10 秒采样一次，用于卡片上的实时负载
 * - 其他情况暂停，页面不可见时也暂停，避免给服务器增加负担
 */
import type { Sample, ServerInfo, Stats } from './monitor'
import { computeStats, INFO_SCRIPT, parseInfo, parseSample, SAMPLE_SCRIPT } from './monitor'
import { activeKey, getConn, sessions } from './sessions'
import { data } from './store'

export interface Point {
  t: number
  cpu: number
  mem: number
  rx: number
  tx: number
}

export interface MonState {
  info: ServerInfo | null
  sample: Sample | null
  stats: Stats | null
  history: Point[]
  error: string
  /** 不是 Linux 或缺少 /proc 时为 true，不再采样 */
  unsupported: boolean
  last: number
  busy: boolean
  generation: number
}

const HISTORY = 60
const states = reactive(new Map<string, MonState>())

export function monState(key: string): MonState {
  let st = states.get(key)
  if (!st) {
    states.set(key, { info: null, sample: null, stats: null, history: [], error: '', unsupported: false, last: 0, busy: false, generation: -1 })
    st = states.get(key)!
  }
  return st
}

export function dropMonState(key: string) {
  states.delete(key)
}

export async function sampleNow(key: string, generation: number) {
  const conn = getConn(key)
  const st = monState(key)
  if (!conn || st.busy)
    return
  st.busy = true
  st.last = Date.now()
  try {
    if (st.generation !== generation) {
      // 重连后重新获取系统信息，上一次的采样不能用来算速率
      st.generation = generation
      st.sample = null
      const r = await conn.ssh.exec(conn.id, INFO_SCRIPT, { timeout: 15000 })
      st.info = parseInfo(r.stdout)
    }
    const r = await conn.ssh.exec(conn.id, SAMPLE_SCRIPT, { timeout: 15000 })
    const cur = parseSample(r.stdout, Date.now() / 1000)
    if (!cur.cpu.length || !cur.mem.total) {
      st.unsupported = true
      st.error = '暂时只支持 Linux 服务器的监控（需要 /proc）'
      return
    }
    st.stats = computeStats(cur, st.sample ?? undefined)
    if (st.sample) {
      st.history.push({ t: cur.time, cpu: st.stats.cpu, mem: st.stats.memPct, rx: st.stats.rx, tx: st.stats.tx })
      if (st.history.length > HISTORY)
        st.history.splice(0, st.history.length - HISTORY)
    }
    st.sample = cur
    st.error = ''
  }
  catch (e: any) {
    st.error = e?.message || '采样失败'
  }
  finally {
    st.busy = false
  }
}

let timer: ReturnType<typeof setInterval> | undefined

function tick() {
  if (document.visibilityState !== 'visible')
    return
  const now = Date.now()
  for (const s of sessions) {
    if (s.status !== 'connected')
      continue
    const interval = s.panel === 'monitor' && activeKey.value === s.key
      ? Math.max(1, data.settings.monitorInterval) * 1000
      : activeKey.value === 'overview' ? 10_000 : 0
    const st = monState(s.key)
    if (!interval || st.unsupported || st.busy)
      continue
    if (now - st.last >= interval)
      sampleNow(s.key, s.generation)
  }
}

export function startMonitor() {
  stopMonitor()
  timer = setInterval(tick, 1000)
}

export function stopMonitor() {
  clearInterval(timer)
}
