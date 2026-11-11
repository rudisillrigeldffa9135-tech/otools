/** WebShell 连接目标的校验（不依赖 Workers 运行时，便于单元测试） */
import { ApiError, str } from './lib'

/** 主机名、IPv4 或 IPv6（不带方括号） */
export function normalizeHost(value: unknown) {
  const host = str(value, '服务器地址', { required: true, max: 253 }).trim().toLowerCase().replace(/^\[(.*)\]$/, '$1')
  const isV6 = host.includes(':')
  if (isV6 ? !/^[0-9a-f:.]+$/.test(host) : !/^(?=.{1,253}$)[a-z0-9_](?:[a-z0-9_-]{0,62}[a-z0-9_])?(?:\.[a-z0-9_](?:[a-z0-9_-]{0,62}[a-z0-9_])?)*\.?$/.test(host))
    throw new ApiError(400, '服务器地址格式不正确')
  return host.replace(/\.$/, '')
}

/**
 * Cloudflare Tunnel 的 SSH 域名：只能是公网域名（不能是 IP、内网名），
 * 中转只会以 WebSocket 方式请求 https://<域名>/，避免被用来访问任意地址
 */
export function normalizeTunnelHost(value: unknown) {
  const host = normalizeHost(value)
  if (host.includes(':') || /^\d+(?:\.\d+){3}$/.test(host) || !host.includes('.') || isPrivateHost(host))
    throw new ApiError(400, 'Tunnel 地址需填写 Cloudflare 上配置的域名，如 ssh.example.com')
  return host
}

export function normalizePort(value: unknown) {
  const port = value === undefined || value === null || value === '' ? 22 : Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new ApiError(400, '端口需为 1~65535')
  if (port === 25)
    throw new ApiError(400, '不支持连接 25 端口')
  return port
}

/**
 * 内网、本机、保留地址：Cloudflare 本身就无法访问，这里提前给出明确提示。
 * 本地开发（WEBSHELL_ALLOW_PRIVATE=true）时放行，用于连接本机的测试服务器。
 */
export function isPrivateHost(host: string) {
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal'))
    return true
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  }
  if (host.includes(':')) {
    const h = host.replace(/^::ffff:/, '')
    if (h !== host)
      return isPrivateHost(h)
    return host === '::' || host === '::1' || /^f[cd]|^fe[89ab]/.test(host) || host.startsWith('ff')
  }
  return false
}
