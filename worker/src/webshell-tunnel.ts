/**
 * 经 Cloudflare Tunnel 连接 SSH：与 `cloudflared access ssh --hostname <域名>` 相同的协议——
 * 以 WebSocket 请求 https://<域名>/，Cloudflare 边缘（经 Access 校验后）把它交给服务器上的 cloudflared，
 * cloudflared 再转到 ingress 配置的 ssh://localhost:22；之后二进制帧里就是 SSH 的原始字节。
 *
 * 受 Access 保护的域名用服务令牌认证（CF-Access-Client-Id / CF-Access-Client-Secret 请求头），
 * 令牌只在本次连接期间存在于内存中，不落库、不写日志。
 */

export interface TunnelAuth {
  clientId: string
  clientSecret: string
}

/** 握手失败时的状态码转成中文提示 */
export function describeTunnelStatus(status: number, location = '', withToken = false) {
  if (status === 301 || status === 302 || status === 303 || status === 307) {
    if (/cloudflareaccess\.com/i.test(location))
      return withToken ? 'Cloudflare Access 拒绝了服务令牌：请检查令牌是否正确、是否过期，以及 Access 策略是否包含该令牌的 Service Auth 规则' : '该域名受 Cloudflare Access 保护，请在服务器设置中填写服务令牌'
    return '该域名把请求重定向了，可能不是 SSH 隧道（ingress 的 service 应为 ssh://localhost:22）'
  }
  if (status === 401 || status === 403)
    return withToken ? 'Cloudflare Access 拒绝了服务令牌：请检查令牌是否正确、是否过期，以及 Access 策略是否包含该令牌的 Service Auth 规则' : '没有访问权限：该域名受 Cloudflare Access 保护，请填写服务令牌'
  if (status === 530 || status === 502 || status === 503 || status === 504)
    return 'Tunnel 不在线：请确认服务器上的 cloudflared 正在运行，且 ingress 配置了这个域名'
  if (status === 404)
    return '域名不存在或未接入 Cloudflare Tunnel'
  return `该域名不是 SSH 隧道（HTTP ${status}），请确认 ingress 的 service 为 ssh://localhost:22`
}

/**
 * Tunnel 地址：正式环境固定为 https://<域名>/（票据签发时端口已固定为 443）；
 * 只有本地开发（WEBSHELL_ALLOW_PRIVATE）才会出现其他端口，此时连接本机的模拟服务 http://host:port/
 */
export function tunnelUrl(host: string, port: number) {
  return port === 443 ? `https://${host}/` : `http://${host.includes(':') ? `[${host}]` : host}:${port}/`
}

/** 建立到 Tunnel 的 WebSocket；失败时抛出带中文说明的 Error */
export async function openTunnel(host: string, port: number, auth: TunnelAuth | null, timeoutMs: number): Promise<WebSocket> {
  const headers = new Headers({ 'Upgrade': 'websocket', 'User-Agent': 'otools-webshell' })
  if (auth?.clientId) {
    headers.set('CF-Access-Client-Id', auth.clientId)
    headers.set('CF-Access-Client-Secret', auth.clientSecret)
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  let res: Response
  try {
    res = await Promise.race([
      fetch(tunnelUrl(host, port), { headers, redirect: 'manual' }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('连接 Tunnel 超时，请检查域名与服务器上的 cloudflared')), timeoutMs)
      }),
    ])
  }
  catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(/超时/.test(msg) ? msg : /dns|resolve|lookup|not found/i.test(msg) ? '域名解析失败，请检查 Tunnel 域名' : `无法连接 Tunnel：${msg}`)
  }
  finally {
    if (timer)
      clearTimeout(timer)
  }
  const ws = res.webSocket
  if (res.status !== 101 || !ws) {
    res.body?.cancel().catch(() => {})
    throw new Error(describeTunnelStatus(res.status, res.headers.get('Location') || '', !!auth?.clientId))
  }
  ws.accept()
  try {
    (ws as WebSocket & { binaryType: string }).binaryType = 'arraybuffer'
  }
  catch {}
  return ws
}
