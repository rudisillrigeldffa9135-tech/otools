/**
 * WebShell 中转（Durable Object，每个连接一个实例）：WebSocket ↔ 服务器 TCP，原样转发字节。
 *
 * 为什么用 Durable Object：普通 Worker 里一条 WebSocket 连接整体只算一次请求，
 * 免费套餐只有 10ms CPU，长时间的 SSH 会话撑不住；Durable Object 每收到一条 WebSocket 消息
 * 就重置 30 秒的 CPU 额度，浏览器定时发送心跳即可长期保持。
 *
 * SSH 协议在浏览器里完成，这里只看到加密后的字节，无法得知密码与终端内容。
 *
 * 消息约定：二进制帧是数据；文本帧是控制消息（JSON）
 *   服务端 → 浏览器：{ t: 'open' } TCP 已连接；{ t: 'error', m } 连接失败或中断；{ t: 'pong' }
 *   浏览器 → 服务端：{ t: 'ping' } 心跳
 */
import type { Env } from './lib'
import { describeConnectError, openSocket } from './webshell'

const CONNECT_TIMEOUT = 10_000
const HEARTBEAT = 60_000

export class WebShellRelay implements DurableObject {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(req: Request) {
    const url = new URL(req.url)
    const host = url.searchParams.get('host') || ''
    const port = Number(url.searchParams.get('port'))
    const logId = Number(url.searchParams.get('log')) || 0

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    server.accept()
    try {
      // 兼容日期较新时二进制消息默认是 Blob，改为 ArrayBuffer 省去异步转换
      (server as WebSocket & { binaryType: string }).binaryType = 'arraybuffer'
    }
    catch {}
    this.state.waitUntil(this.run(server, host, port, logId))
    return new Response(null, { status: 101, webSocket: client })
  }

  private async run(ws: WebSocket, host: string, port: number, logId: number) {
    let bytesIn = 0
    let bytesOut = 0
    let error = ''
    let closed = false
    let socket: Socket | undefined
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
      socket?.close().catch(() => {})
      if (logId) {
        const t = Math.floor(Date.now() / 1000)
        await this.env.DB.prepare('UPDATE webshell_sessions SET ended_at = ?, last_seen = ?, bytes_in = ?, bytes_out = ?, error = ? WHERE id = ?')
          .bind(t, t, bytesIn, bytesOut, error.slice(0, 200), logId)
          .run()
          .catch(() => {})
      }
    }

    // 浏览器先断开时，也要关闭 TCP 连接
    let wsGone: () => void = () => {}
    const wsClosed = new Promise<void>(resolve => (wsGone = resolve))
    const pending: Uint8Array[] = []
    let writer: WritableStreamDefaultWriter<Uint8Array> | undefined

    // 二进制消息默认可能是 Blob（取决于兼容日期），转成字节需要异步，用串行队列保证写入顺序
    let queue = Promise.resolve()
    ws.addEventListener('message', (e) => {
      if (typeof e.data === 'string') {
        if (e.data.includes('"ping"'))
          ws.send('{"t":"pong"}')
        return
      }
      const data = e.data as ArrayBuffer | Blob
      queue = queue.then(async () => {
        const chunk = new Uint8Array(data instanceof Blob ? await data.arrayBuffer() : data)
        bytesOut += chunk.byteLength
        if (writer)
          await writer.write(chunk)
        else
          pending.push(chunk)
      }).catch(() => finish('写入服务器失败'))
    })
    ws.addEventListener('close', () => wsGone())
    ws.addEventListener('error', () => wsGone())

    try {
      socket = await Promise.race([
        openSocket(host, port, CONNECT_TIMEOUT),
        wsClosed.then(() => {
          throw new Error('客户端已断开')
        }),
      ])
    }
    catch (e) {
      const m = describeConnectError(e)
      try {
        ws.send(JSON.stringify({ t: 'error', m }))
      }
      catch {}
      await finish(m)
      return
    }

    writer = socket.writable.getWriter()
    for (const chunk of pending.splice(0))
      writer.write(chunk).catch(() => {})
    ws.send('{"t":"open"}')

    if (logId) {
      heartbeat = setInterval(() => {
        this.env.DB.prepare('UPDATE webshell_sessions SET last_seen = ?, bytes_in = ?, bytes_out = ? WHERE id = ?')
          .bind(Math.floor(Date.now() / 1000), bytesIn, bytesOut, logId)
          .run()
          .catch(() => {})
      }, HEARTBEAT)
    }

    const pump = (async () => {
      const reader = socket!.readable.getReader()
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done)
            break
          bytesIn += value.byteLength
          ws.send(value)
        }
        return ''
      }
      catch (e) {
        return describeConnectError(e)
      }
    })()

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
