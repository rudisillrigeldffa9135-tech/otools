/**
 * WebShell 中转（Durable Object，每个连接一个实例）：浏览器 WebSocket ↔ 服务器，原样转发字节。
 * 服务器一侧两种方式：
 *   - 直连：TCP 连接 host:port
 *   - Cloudflare Tunnel：以 WebSocket 连接 Tunnel 域名（见 webshell-tunnel.ts），可带 Access 服务令牌
 *
 * 为什么用 Durable Object：普通 Worker 里一条 WebSocket 连接整体只算一次请求，
 * 免费套餐只有 10ms CPU，长时间的 SSH 会话撑不住；Durable Object 每收到一条 WebSocket 消息
 * 就重置 30 秒的 CPU 额度，浏览器定时发送心跳即可长期保持。
 *
 * SSH 协议在浏览器里完成，这里只看到加密后的字节，无法得知密码与终端内容。
 *
 * 消息约定：二进制帧是数据；文本帧是控制消息（JSON）
 *   服务端 → 浏览器：{ t: 'open', unprotected? } 已连上服务器（unprotected：Tunnel 域名未受 Access 保护）；
 *                    { t: 'error', m } 连接失败或中断；{ t: 'pong' }
 *   浏览器 → 服务端：{ t: 'ping' } 心跳；{ t: 'auth', id, secret } Tunnel 方式连接时第一条消息，携带服务令牌
 */
import type { Env } from './lib'
import type { TunnelAuth } from './webshell-tunnel'
import { describeConnectError, openSocket } from './webshell'
import { openTunnel } from './webshell-tunnel'

const CONNECT_TIMEOUT = 10_000
/** Tunnel 方式：等待浏览器发来服务令牌的时间 */
const AUTH_TIMEOUT = 10_000
const HEARTBEAT = 60_000

/** 服务器一侧的连接 */
interface Upstream {
  write: (chunk: Uint8Array) => Promise<void>
  /** 持续读取并回调，连接结束时返回原因（正常关闭为空串） */
  pump: (onData: (chunk: Uint8Array) => void) => Promise<string>
  close: () => void
}

function tcpUpstream(socket: Socket): Upstream {
  const writer = socket.writable.getWriter()
  return {
    write: chunk => writer.write(chunk),
    pump: async (onData) => {
      const reader = socket.readable.getReader()
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done)
            return ''
          onData(value)
        }
      }
      catch (e) {
        return describeConnectError(e)
      }
    },
    close: () => {
      socket.close().catch(() => {})
    },
  }
}

function tunnelUpstream(ws: WebSocket): Upstream {
  return {
    write: async (chunk) => {
      ws.send(chunk)
    },
    pump: onData => new Promise<string>((resolve) => {
      // 二进制消息可能是 Blob，转换是异步的，用串行队列保证顺序
      let queue = Promise.resolve()
      ws.addEventListener('message', (e) => {
        if (typeof e.data === 'string')
          return
        const data = e.data as ArrayBuffer | Blob
        queue = queue.then(async () => onData(new Uint8Array(data instanceof Blob ? await data.arrayBuffer() : data)))
      })
      ws.addEventListener('close', () => queue.then(() => resolve('')))
      ws.addEventListener('error', () => queue.then(() => resolve('Tunnel 连接出错')))
    }),
    close: () => {
      try {
        ws.close(1000, 'closed')
      }
      catch {}
    },
  }
}

/** 浏览器发来的服务令牌：只接受合理长度的字符串 */
function parseAuth(m: any): TunnelAuth | null {
  const id = typeof m?.id === 'string' ? m.id.trim() : ''
  const secret = typeof m?.secret === 'string' ? m.secret.trim() : ''
  if (!id || !secret || id.length > 200 || secret.length > 500)
    return null
  return { clientId: id, clientSecret: secret }
}

export class WebShellRelay implements DurableObject {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(req: Request) {
    const url = new URL(req.url)
    const host = url.searchParams.get('host') || ''
    const port = Number(url.searchParams.get('port'))
    const via = url.searchParams.get('via') || ''
    const logId = Number(url.searchParams.get('log')) || 0

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    server.accept()
    try {
      // 兼容日期较新时二进制消息默认是 Blob，改为 ArrayBuffer 省去异步转换
      (server as WebSocket & { binaryType: string }).binaryType = 'arraybuffer'
    }
    catch {}
    this.state.waitUntil(this.run(server, host, port, via, logId))
    return new Response(null, { status: 101, webSocket: client })
  }

  private async run(ws: WebSocket, host: string, port: number, via: string, logId: number) {
    let bytesIn = 0
    let bytesOut = 0
    let error = ''
    let closed = false
    let upstream: Upstream | undefined
    let heartbeat: ReturnType<typeof setInterval> | undefined

    const finish = async (reason = '') => {
      if (closed)
        return
      closed = true
      if (heartbeat)
        clearInterval(heartbeat)
      if (reason && !error)
        error = reason
      try {
        ws.close(1000, 'closed')
      }
      catch {}
      upstream?.close()
      if (logId) {
        const t = Math.floor(Date.now() / 1000)
        await this.env.DB.prepare('UPDATE webshell_sessions SET ended_at = ?, last_seen = ?, bytes_in = ?, bytes_out = ?, error = ? WHERE id = ?')
          .bind(t, t, bytesIn, bytesOut, error.slice(0, 200), logId)
          .run()
          .catch(() => {})
      }
    }

    // 浏览器先断开时，也要关闭到服务器的连接
    let wsGone: () => void = () => {}
    const wsClosed = new Promise<void>(resolve => (wsGone = resolve))
    // Tunnel 方式：等待浏览器发来服务令牌（第一条文本消息）
    let gotAuth: (auth: TunnelAuth | null) => void = () => {}
    const authReady = new Promise<TunnelAuth | null>(resolve => (gotAuth = resolve))
    const pending: Uint8Array[] = []

    // 二进制消息默认可能是 Blob（取决于兼容日期），转成字节需要异步，用串行队列保证写入顺序
    let queue = Promise.resolve()
    ws.addEventListener('message', (e) => {
      if (typeof e.data === 'string') {
        if (e.data.includes('"ping"')) {
          ws.send('{"t":"pong"}')
          return
        }
        try {
          const m = JSON.parse(e.data)
          if (m?.t === 'auth')
            gotAuth(parseAuth(m))
        }
        catch {}
        return
      }
      const data = e.data as ArrayBuffer | Blob
      queue = queue.then(async () => {
        const chunk = new Uint8Array(data instanceof Blob ? await data.arrayBuffer() : data)
        bytesOut += chunk.byteLength
        if (upstream)
          await upstream.write(chunk)
        else
          pending.push(chunk)
      }).catch(() => finish('写入服务器失败'))
    })
    ws.addEventListener('close', () => wsGone())
    ws.addEventListener('error', () => wsGone())

    const gone = wsClosed.then(() => {
      throw new Error('客户端已断开')
    })
    // 连上之后浏览器才断开时，没有人等待这个 Promise
    gone.catch(() => {})
    let unprotected = false
    try {
      if (via === 'cftunnel') {
        const auth = await Promise.race([
          authReady,
          gone,
          new Promise<null>(resolve => setTimeout(() => resolve(null), AUTH_TIMEOUT)),
        ])
        unprotected = !auth
        upstream = tunnelUpstream(await Promise.race([openTunnel(host, port, auth, CONNECT_TIMEOUT), gone]))
      }
      else {
        upstream = tcpUpstream(await Promise.race([openSocket(host, port, CONNECT_TIMEOUT), gone]))
      }
    }
    catch (e) {
      const m = via === 'cftunnel' ? (e instanceof Error ? e.message : String(e)) : describeConnectError(e)
      try {
        ws.send(JSON.stringify({ t: 'error', m }))
      }
      catch {}
      await finish(m)
      return
    }

    for (const chunk of pending.splice(0))
      upstream.write(chunk).catch(() => {})
    ws.send(JSON.stringify(unprotected ? { t: 'open', unprotected: true } : { t: 'open' }))

    if (logId) {
      heartbeat = setInterval(() => {
        this.env.DB.prepare('UPDATE webshell_sessions SET last_seen = ?, bytes_in = ?, bytes_out = ? WHERE id = ?')
          .bind(Math.floor(Date.now() / 1000), bytesIn, bytesOut, logId)
          .run()
          .catch(() => {})
      }, HEARTBEAT)
    }

    const pump = upstream.pump((chunk) => {
      bytesIn += chunk.byteLength
      ws.send(chunk)
    })
    const reason = await Promise.race([pump, wsClosed.then(() => '')])
    if (reason) {
      try {
        ws.send(JSON.stringify({ t: 'error', m: `与服务器的连接中断：${reason}` }))
      }
      catch {}
    }
    await finish(reason)
  }
}
