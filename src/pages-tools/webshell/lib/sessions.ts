/**
 * 打开的会话（标签页）：每个会话对应一条到服务器的 SSH 连接，终端、文件、监控共用这条连接。
 */
import type { HostKeyInfo, SshConn } from './ssh'
import type { Host } from './types'
import { askHostKey, askPrompt } from './dialogs'
import { connectHost, errorHint } from './ssh'
import { data, markConnected, save } from './store'

export type SessionStatus = 'connecting' | 'connected' | 'closed' | 'error'

export interface Session {
  key: string
  hostId: string
  /** 连接时的服务器快照（编辑服务器不影响已打开的会话） */
  host: Host
  title: string
  status: SessionStatus
  statusText: string
  error: string
  hint: string
  banner: string
  /** 连接成功的次数，每次重连 +1，组件据此重新打开终端 */
  generation: number
  connectedAt: number
  /** 侧边面板 */
  panel: '' | 'files' | 'monitor' | 'snippets'
}

export const sessions = reactive<Session[]>([])
/** 当前标签：'overview' 或会话 key */
export const activeKey = ref('overview')

/** 连接对象不放进响应式数据 */
const conns = new Map<string, SshConn>()

export function getConn(key: string) {
  return conns.get(key)
}

let seq = 0

async function verifyHostKey(host: Host, info: HostKeyInfo) {
  const known = data.knownHosts.find(k => k.host === host.host && k.port === (host.port || 22))
  if (known && known.key === info.key)
    return true
  const choice = await askHostKey(host, info, known)
  if (choice === 'reject')
    return false
  if (choice === 'trust') {
    await save('known_host', {
      id: known?.id ?? '',
      host: host.host,
      port: host.port || 22,
      type: info.type,
      fingerprint: info.fingerprint,
      key: info.key,
      addedAt: Math.floor(Date.now() / 1000),
    }).catch(() => {})
  }
  return true
}

async function doConnect(s: Session) {
  conns.get(s.key)?.close()
  conns.delete(s.key)
  s.status = 'connecting'
  s.error = ''
  s.hint = ''
  s.banner = ''
  s.statusText = '正在加载 SSH 组件…'
  try {
    const conn = await connectHost(s.host, {
      findHost: id => data.hosts.find(h => h.id === id),
      findKey: id => data.keys.find(k => k.id === id),
      verifyHostKey,
      prompt: askPrompt,
      onBanner: (t) => {
        s.banner += t
      },
      onStatus: (t) => {
        s.statusText = t
      },
      keepalive: data.settings.keepalive,
    })
    // 连接期间用户关闭了标签
    if (!sessions.includes(s)) {
      conn.close()
      return
    }
    conns.set(s.key, markRaw(conn))
    s.status = 'connected'
    s.statusText = ''
    s.connectedAt = Date.now()
    s.generation++
    if (s.host.id)
      markConnected(s.host.id)
    conn.closed.then((reason) => {
      if (conns.get(s.key) !== conn)
        return
      conns.delete(s.key)
      s.status = 'closed'
      s.error = reason || '连接已断开'
      if (data.settings.autoReconnect && sessions.includes(s) && Date.now() - s.connectedAt > 10_000)
        setTimeout(() => s.status === 'closed' && doConnect(s), 2000)
    })
  }
  catch (e: any) {
    s.status = 'error'
    s.error = e?.message || '连接失败'
    s.hint = errorHint(e?.code || '')
  }
}

/** 打开一个新会话（同一台服务器可以开多个） */
export function openSession(host: Host) {
  const sameHost = sessions.filter(x => x.hostId === host.id && host.id).length
  const s: Session = reactive({
    key: `s${++seq}`,
    hostId: host.id,
    host: { ...host },
    title: (host.name || host.host) + (sameHost ? ` (${sameHost + 1})` : ''),
    status: 'connecting',
    statusText: '',
    error: '',
    hint: '',
    banner: '',
    generation: 0,
    connectedAt: 0,
    panel: '',
  })
  sessions.push(s)
  activeKey.value = s.key
  doConnect(s)
  return s
}

export function reconnect(s: Session) {
  // 重连时使用最新的服务器设置
  const latest = data.hosts.find(h => h.id === s.hostId)
  if (latest)
    s.host = { ...latest }
  return doConnect(s)
}

/** 复制会话：同一服务器再开一个 */
export function duplicateSession(s: Session) {
  return openSession(data.hosts.find(h => h.id === s.hostId) ?? s.host)
}

export function closeSession(key: string) {
  const i = sessions.findIndex(x => x.key === key)
  if (i < 0)
    return
  conns.get(key)?.close()
  conns.delete(key)
  sessions.splice(i, 1)
  if (activeKey.value === key)
    activeKey.value = sessions[Math.min(i, sessions.length - 1)]?.key ?? 'overview'
}

export function closeAll() {
  for (const s of [...sessions])
    closeSession(s.key)
}

export const connectedCount = computed(() => sessions.filter(s => s.status === 'connected').length)

/** 各会话终端的输入函数（由会话组件注册），用于快捷命令「发送到所有会话」 */
export const writers = new Map<string, (text: string) => void>()

export function broadcast(text: string) {
  let n = 0
  for (const s of sessions) {
    const w = writers.get(s.key)
    if (s.status === 'connected' && w) {
      w(text)
      n++
    }
  }
  return n
}
