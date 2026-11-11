import { http } from '@/http/http'

export interface IWebshellVault {
  kdf: string
  wrappedKey: string
  updatedAt: number
}

export interface IWebshellItem {
  id: string
  kind: WebshellKind
  /** 'v1.' + base64 密文 */
  data: string
  rev: number
  updatedAt: number
}

export type WebshellKind = 'host' | 'group' | 'snippet' | 'key' | 'known_host' | 'settings'

export interface IWebshellSession {
  id: number
  host: string
  port: number
  /** '' 直连；'cftunnel' 经 Cloudflare Tunnel */
  via: string
  clientIp: string
  startedAt: number
  endedAt: number
  bytesIn: number
  bytesOut: number
  error: string
}

export function getWebshellVault() {
  return http.get<IWebshellVault | null>('/webshell/vault')
}

export function createWebshellVault(kdf: string, wrappedKey: string) {
  return http.post<{ updatedAt: number }>('/webshell/vault', { kdf, wrappedKey })
}

export function updateWebshellVault(kdf: string, wrappedKey: string, expectUpdatedAt: number) {
  return http.put<{ updatedAt: number }>('/webshell/vault', { kdf, wrappedKey, expectUpdatedAt })
}

export function resetWebshellVault() {
  return http.delete<null>('/webshell/vault')
}

export function listWebshellItems() {
  return http.get<IWebshellItem[]>('/webshell/items', undefined, undefined, { hideErrorToast: true })
}

/** rev 为 0 表示新建；冲突时返回 409（不弹出错误提示，由调用方处理） */
export function putWebshellItem(id: string, kind: WebshellKind, data: string, rev: number) {
  return http.put<{ rev: number, updatedAt: number }>(`/webshell/items/${id}`, { kind, data, rev }, undefined, undefined, { hideErrorToast: true })
}

export function deleteWebshellItem(id: string) {
  return http.delete<null>(`/webshell/items/${id}`)
}

/** via 为 cftunnel 时 host 是 Tunnel 域名；服务令牌不经过这里，连接建立后直接发给中转 */
export function createWebshellTicket(host: string, port: number, via: '' | 'cftunnel' = '') {
  return http.post<{ ticket: string, expiresIn: number }>('/webshell/ticket', { host, port, via }, undefined, undefined, { hideErrorToast: true })
}

export function probeWebshellHosts(targets: { host: string, port: number, via?: '' | 'cftunnel' }[]) {
  return http.post<{ ok: boolean, ms?: number, error?: string, note?: string }[]>('/webshell/probe', { targets }, undefined, undefined, { hideErrorToast: true })
}

export function listWebshellSessions() {
  return http.get<IWebshellSession[]>('/webshell/sessions')
}
