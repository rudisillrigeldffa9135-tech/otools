/**
 * 连接过程中需要用户回答的对话框（主机密钥确认、键盘交互认证），以 Promise 形式提供给连接逻辑。
 * 由 components/ws-dialogs.vue 渲染，同一时间只显示队首的一个。
 */
import type { HostKeyInfo, PromptRequest } from './ssh'
import type { Host, KnownHost } from './types'

export type HostKeyChoice = 'trust' | 'once' | 'reject'

interface HostKeyDialog {
  type: 'hostkey'
  host: Host
  info: HostKeyInfo
  /** 已信任的旧密钥：存在时表示主机密钥发生了变化 */
  previous?: KnownHost
  resolve: (v: HostKeyChoice) => void
}

interface PromptDialog {
  type: 'prompt'
  host: Host
  req: PromptRequest
  resolve: (v: string[] | null) => void
}

export type Dialog = HostKeyDialog | PromptDialog

export const dialogs = reactive<Dialog[]>([])

function enqueue<T extends Dialog>(d: Omit<T, 'resolve'>, resolveValue: (v: any) => void) {
  const item = { ...d } as T
  item.resolve = (v: any) => {
    const i = dialogs.findIndex(x => toRaw(x) === item)
    if (i >= 0)
      dialogs.splice(i, 1)
    resolveValue(v)
  }
  dialogs.push(item)
}

export function askHostKey(host: Host, info: HostKeyInfo, previous?: KnownHost) {
  return new Promise<HostKeyChoice>(resolve => enqueue<HostKeyDialog>({ type: 'hostkey', host, info, previous }, resolve))
}

export function askPrompt(host: Host, req: PromptRequest) {
  return new Promise<string[] | null>(resolve => enqueue<PromptDialog>({ type: 'prompt', host, req }, resolve))
}
