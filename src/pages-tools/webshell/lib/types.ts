/** WebShell 的数据模型（全部加密后同步到服务端） */
import { formatHostPort } from './util'

export type AuthType = 'password' | 'key' | 'interactive'

export interface Host {
  id: string
  name: string
  groupId: string
  host: string
  port: number
  username: string
  auth: AuthType
  /** auth 为 password 时使用；interactive 时可作为第一步的密码 */
  password: string
  keyId: string
  /** 经哪台服务器跳转（填另一台服务器的 id） */
  jumpHostId: string
  /** 登录后自动执行的命令 */
  initCommand: string
  note: string
  color: string
  /** 置顶显示在概览最前面 */
  pinned: boolean
  createdAt: number
  lastConnectedAt: number
  connectCount: number
}

export interface Group {
  id: string
  name: string
  sort: number
}

export interface Snippet {
  id: string
  name: string
  command: string
  /** 分类名，空为「未分类」 */
  category: string
  /** 发送后是否自动回车执行 */
  autoRun: boolean
  sort: number
}

export interface SshKey {
  id: string
  name: string
  type: string
  privateKey: string
  passphrase: string
  publicKey: string
  fingerprint: string
  createdAt: number
}

export interface KnownHost {
  id: string
  host: string
  port: number
  type: string
  fingerprint: string
  /** base64 公钥 */
  key: string
  addedAt: number
}

export type TermTheme = 'dark' | 'light' | 'solarized' | 'dracula' | 'monokai'

export interface Settings {
  id: string
  fontSize: number
  fontFamily: string
  theme: TermTheme
  cursorStyle: 'block' | 'bar' | 'underline'
  cursorBlink: boolean
  scrollback: number
  /** 选中即复制 */
  copyOnSelect: boolean
  /** 右键粘贴 */
  rightClickPaste: boolean
  /** 秒，0 关闭 */
  keepalive: number
  /** 监控刷新间隔（秒） */
  monitorInterval: number
  /** 空闲多少分钟后自动锁定，0 不锁定 */
  lockMinutes: number
  /** 关闭已连接的标签前确认 */
  confirmClose: boolean
  /** 断线后自动重连 */
  autoReconnect: boolean
}

/** 设置只有一份，用固定 id */
export const SETTINGS_ID = 'settings-0001'

export const DEFAULT_SETTINGS: Settings = {
  id: SETTINGS_ID,
  fontSize: 14,
  fontFamily: 'Menlo, Consolas, "Cascadia Mono", "DejaVu Sans Mono", "Noto Sans Mono CJK SC", monospace',
  theme: 'dark',
  cursorStyle: 'block',
  cursorBlink: true,
  scrollback: 5000,
  copyOnSelect: false,
  rightClickPaste: true,
  keepalive: 30,
  monitorInterval: 3,
  lockMinutes: 30,
  confirmClose: true,
  autoReconnect: false,
}

export function emptyHost(): Host {
  return {
    id: '',
    name: '',
    groupId: '',
    host: '',
    port: 22,
    username: 'root',
    auth: 'password',
    password: '',
    keyId: '',
    jumpHostId: '',
    initCommand: '',
    note: '',
    color: '',
    pinned: false,
    createdAt: 0,
    lastConnectedAt: 0,
    connectCount: 0,
  }
}

export const HOST_COLORS = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']

export function hostLabel(h: Pick<Host, 'username' | 'host' | 'port'>) {
  return `${h.username ? `${h.username}@` : ''}${formatHostPort(h.host, h.port)}`
}
