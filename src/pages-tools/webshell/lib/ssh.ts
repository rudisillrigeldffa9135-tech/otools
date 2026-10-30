/**
 * 浏览器端 SSH：加载 WebAssembly 客户端，经 Worker 中转连接服务器。
 *
 * 连接流程：登录态换一次性票据 → WebSocket 连到 /api/webshell/relay → 收到 { t: 'open' } 后
 * 在 WASM 里完成 SSH 握手。跳板机：先连上跳板机，再让它转发到目标服务器（目标的 SSH 握手仍在浏览器里）。
 */
import type { Host, SshKey } from './types'
import { absoluteApiUrl } from '@/api/files'
import { createWebshellTicket } from '@/api/webshell'

/* ---------------- WASM 接口 ---------------- */

export interface HostKeyInfo {
  type: string
  fingerprint: string
  /** base64 */
  key: string
}

export interface PromptRequest {
  name: string
  instruction: string
  questions: { prompt: string, echo: boolean }[]
}

export interface SftpEntry {
  name: string
  size: number
  mode: number
  perm: string
  isDir: boolean
  isLink: boolean
  linkTarget?: string
  mtime: number
  uid?: number
  gid?: number
}

export interface ExecResult {
  stdout: string
  stderr: string
  code: number
}

interface ConnectOptions {
  transport?: number
  via?: number
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  passphrase?: string
  keepalive?: number
  timeout?: number
  onHostKey: (info: HostKeyInfo) => boolean | Promise<boolean>
  onPrompt?: (req: PromptRequest) => string[] | null | Promise<string[] | null>
  onBanner?: (text: string) => void
  onClose?: (reason: string) => void
}

export interface OtSsh {
  createTransport: (send: (data: Uint8Array) => void, close: () => void) => { id: number, push: (data: Uint8Array) => void, end: () => void }
  connect: (opts: ConnectOptions) => Promise<{ id: number, serverVersion: string }>
  disconnect: (id: number) => Promise<void>
  shell: (id: number, opts: { term?: string, cols: number, rows: number, env?: Record<string, string>, onData: (d: Uint8Array) => void, onExit: (code: number) => void }) => Promise<number>
  write: (sid: number, data: Uint8Array | string) => boolean
  resize: (sid: number, cols: number, rows: number) => boolean
  closeSession: (sid: number) => void
  exec: (id: number, cmd: string, opts?: { timeout?: number, stdin?: string }) => Promise<ExecResult>
  /** SSH 往返延迟（毫秒） */
  ping: (id: number) => Promise<number>
  sftpOpen: (id: number) => Promise<number>
  sftpClose: (fid: number) => void
  sftpList: (fid: number, dir: string) => Promise<SftpEntry[]>
  sftpStat: (fid: number, path: string) => Promise<SftpEntry>
  sftpRealpath: (fid: number, path: string) => Promise<string>
  sftpMkdir: (fid: number, path: string, parents: boolean) => Promise<void>
  sftpRemove: (fid: number, path: string, recursive: boolean) => Promise<void>
  sftpRename: (fid: number, from: string, to: string) => Promise<void>
  sftpChmod: (fid: number, path: string, mode: number) => Promise<void>
  sftpOpenRead: (fid: number, path: string) => Promise<{ id: number, size: number }>
  sftpOpenWrite: (fid: number, path: string, append: boolean) => Promise<number>
  sftpRead: (hid: number, size: number) => Promise<Uint8Array | null>
  sftpWrite: (hid: number, data: Uint8Array) => Promise<void>
  sftpCloseFile: (hid: number) => Promise<void>
  generateKey: (type: 'ed25519' | 'rsa' | 'ecdsa', comment: string) => Promise<{ privateKey: string, publicKey: string, fingerprint: string, type: string }>
  parseKey: (pem: string, passphrase?: string) => Promise<{ publicKey: string, fingerprint: string, type: string }>
}

/** 带错误码的错误（WASM 抛出的 Error 带 code：auth / hostkey / timeout / network / passphrase / key / jump …） */
export class SshError extends Error {
  constructor(message: string, public code = 'ssh') {
    super(message)
  }
}

export function toSshError(e: unknown): SshError {
  if (e instanceof SshError)
    return e
  const err = e as { message?: string, code?: string }
  return new SshError(err?.message || String(e), err?.code || 'ssh')
}

let loading: Promise<OtSsh> | null = null

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('加载 SSH 组件失败，请检查网络后刷新'))
    document.head.appendChild(s)
  })
}

/** 加载 SSH 客户端（约 2 MB，只加载一次） */
export function loadSsh(): Promise<OtSsh> {
  if (loading)
    return loading
  loading = (async () => {
    const assets = __WEBSHELL_ASSETS__
    if (!assets.wasm)
      throw new Error(`SSH 组件未构建：${assets.error || '未知原因'}`)
    const g = globalThis as any
    if (g.__otssh)
      return g.__otssh as OtSsh
    if (!g.Go)
      await loadScript(assets.exec)
    const res = await fetch(assets.wasm)
    if (!res.ok)
      throw new Error(`加载 SSH 组件失败（${res.status}）`)
    const go = new g.Go()
    const ready = new Promise<void>(resolve => (g.__otsshReady = resolve))
    const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), go.importObject)
    go.run(instance).then(() => {
      // Go 程序意外退出后需要重新加载
      loading = null
      g.__otssh = undefined
    })
    await ready
    return g.__otssh as OtSsh
  })()
  loading.catch(() => {
    loading = null
  })
  return loading
}

/* ---------------- 中转 ---------------- */

const PING_INTERVAL = 20_000

/** 经 Worker 中转打开到 host:port 的 TCP 通道 */
async function openRelay(ssh: OtSsh, host: string, port: number) {
  let ticket: string
  try {
    ticket = (await createWebshellTicket(host, port)).ticket
  }
  catch (e: any) {
    throw new SshError(e?.message || '无法建立连接', e?.statusCode === 429 ? 'limit' : 'ticket')
  }
  const url = absoluteApiUrl(`/api/webshell/relay?t=${encodeURIComponent(ticket)}`).replace(/^http/, 'ws')
  const ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'
  const transport = ssh.createTransport(
    (d) => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(d)
    },
    () => ws.close(),
  )
  let ping: ReturnType<typeof setInterval> | undefined
  let closeReason = ''
  const closed = new Promise<string>((resolve) => {
    ws.addEventListener('close', () => {
      clearInterval(ping)
      transport.end()
      resolve(closeReason)
    })
  })
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new SshError('连接中转服务器超时', 'timeout'))
      ws.close()
    }, 20_000)
    ws.addEventListener('message', (e) => {
      if (typeof e.data !== 'string') {
        transport.push(new Uint8Array(e.data as ArrayBuffer))
        return
      }
      try {
        const m = JSON.parse(e.data)
        if (m.t === 'open') {
          clearTimeout(timer)
          resolve()
        }
        else if (m.t === 'error') {
          clearTimeout(timer)
          closeReason = m.m
          reject(new SshError(m.m, 'network'))
        }
      }
      catch {}
    })
    ws.addEventListener('close', () => {
      clearTimeout(timer)
      reject(new SshError(closeReason || '无法连接中转服务器', 'network'))
    })
  })
  // 心跳：保持连接，同时让中转的 Durable Object 刷新 CPU 额度
  ping = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN)
      ws.send('{"t":"ping"}')
  }, PING_INTERVAL)
  return { transportId: transport.id, close: () => ws.close(), closed }
}

/* ---------------- 连接 ---------------- */

export interface ConnectDeps {
  findHost: (id: string) => Host | undefined
  findKey: (id: string) => SshKey | undefined
  /** 校验主机密钥：已信任则直接通过，否则弹窗询问 */
  verifyHostKey: (host: Host, info: HostKeyInfo) => Promise<boolean>
  /** 键盘交互认证（动态口令等）时弹窗询问 */
  prompt: (host: Host, req: PromptRequest) => Promise<string[] | null>
  onBanner?: (text: string) => void
  /** 连接进度，如「正在连接跳板机 xxx」 */
  onStatus?: (text: string) => void
  keepalive: number
}

export interface SshConn {
  ssh: OtSsh
  id: number
  serverVersion: string
  /** 连接断开时 resolve，值为原因 */
  closed: Promise<string>
  close: () => void
}

/** 连接一台服务器（含跳板机链，最多 3 层）；失败时抛出 SshError */
export async function connectHost(host: Host, deps: ConnectDeps, depth = 0, seen = new Set<string>()): Promise<SshConn> {
  if (depth > 3)
    throw new SshError('跳板机层级过多（最多 3 层）', 'jump')
  if (host.id && seen.has(host.id))
    throw new SshError('跳板机设置形成了循环', 'jump')
  seen.add(host.id)
  const ssh = await loadSsh()

  const key = host.auth === 'key' ? deps.findKey(host.keyId) : undefined
  if (host.auth === 'key' && !key)
    throw new SshError('找不到这台服务器使用的私钥，请在服务器设置中重新选择', 'key')
  // 选了密码认证但没有保存密码：建立连接前先询问（只用于本次连接，不保存），避免服务器等待握手超时
  let password = host.auth !== 'key' ? host.password : ''
  if (host.auth === 'password' && !password) {
    const ans = await deps.prompt(host, { name: '输入密码', instruction: '', questions: [{ prompt: `${host.username}@${host.host} 的密码`, echo: false }] })
    if (!ans?.[0])
      throw new SshError('已取消连接', 'cancel')
    password = ans[0]
  }

  let jump: SshConn | undefined
  let relay: Awaited<ReturnType<typeof openRelay>> | undefined
  if (host.jumpHostId) {
    const jh = deps.findHost(host.jumpHostId)
    if (!jh)
      throw new SshError('跳板机不存在，请检查服务器设置', 'jump')
    deps.onStatus?.(`正在连接跳板机 ${jh.name || jh.host}…`)
    jump = await connectHost(jh, deps, depth + 1, seen)
    deps.onStatus?.(`经跳板机连接 ${host.name || host.host}…`)
  }
  else {
    deps.onStatus?.('正在建立连接…')
    relay = await openRelay(ssh, host.host, host.port || 22)
    deps.onStatus?.('正在进行 SSH 握手…')
  }

  let onClosed: (reason: string) => void = () => {}
  const closed = new Promise<string>(resolve => (onClosed = resolve))
  try {
    const res = await ssh.connect({
      transport: relay?.transportId,
      via: jump?.id,
      host: host.host,
      port: host.port || 22,
      username: host.username,
      password,
      privateKey: key?.privateKey,
      passphrase: key?.passphrase,
      keepalive: deps.keepalive,
      onHostKey: info => deps.verifyHostKey(host, info),
      onPrompt: req => deps.prompt(host, req),
      onBanner: deps.onBanner,
      onClose: (reason) => {
        relay?.close()
        jump?.close()
        onClosed(reason)
      },
    })
    relay?.closed.then(reason => onClosed(reason || '与中转服务器的连接已断开'))
    jump?.closed.then(reason => onClosed(`跳板机连接已断开${reason ? `：${reason}` : ''}`))
    return {
      ssh,
      id: res.id,
      serverVersion: res.serverVersion,
      closed,
      close: () => {
        ssh.disconnect(res.id)
        relay?.close()
        jump?.close()
      },
    }
  }
  catch (e) {
    relay?.close()
    jump?.close()
    throw toSshError(e)
  }
}

/** 常见错误的建议 */
export function errorHint(code: string) {
  switch (code) {
    case 'auth':
      return '请检查用户名、密码或私钥；部分服务器默认禁止 root 密码登录'
    case 'timeout':
    case 'network':
      return '请确认地址与端口正确、服务器防火墙 / 安全组已放行该端口；内网地址需要经公网跳板机连接'
    case 'passphrase':
      return '请在「密钥管理」中为该私钥填写正确的私钥密码'
    case 'algorithm':
      return '服务器的 SSH 版本过旧或配置了特殊算法'
    case 'limit':
      return '请关闭一些不用的会话后再试'
    default:
      return ''
  }
}
