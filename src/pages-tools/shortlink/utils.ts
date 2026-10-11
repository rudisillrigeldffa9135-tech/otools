/** 短链工具的纯逻辑（与平台无关，便于单测）。时间均为秒级时间戳 */

const DAY = 24 * 3600

export interface LinkLike {
  disabled: boolean
  expiresAt: number
}

export type LinkStatus = 'active' | 'expiring' | 'expired' | 'disabled'

/** 有效期选项：值为天数，0 为永久；'keep' 仅编辑时使用，表示不修改 */
export type ExpireChoice = number | 'keep'

export const EXPIRE_OPTIONS: { value: number, label: string }[] = [
  { value: 0, label: '永久' },
  { value: 1, label: '1 天' },
  { value: 7, label: '7 天' },
  { value: 30, label: '30 天' },
  { value: 365, label: '1 年' },
]

/** 把有效期选项换算成接口需要的 expiresAt；'keep' 返回 undefined 表示不提交 */
export function expiresAtOf(choice: ExpireChoice, now: number) {
  if (choice === 'keep')
    return undefined
  return choice === 0 ? 0 : now + choice * DAY
}

/** 3 天内到期视为「即将过期」 */
export function linkStatus(link: LinkLike, now: number): { status: LinkStatus, text: string } {
  if (link.disabled)
    return { status: 'disabled', text: '已停用' }
  if (link.expiresAt && link.expiresAt <= now)
    return { status: 'expired', text: '已过期' }
  if (link.expiresAt && link.expiresAt - now < 3 * DAY)
    return { status: 'expiring', text: `${remainText(link.expiresAt - now)}后过期` }
  return { status: 'active', text: '有效' }
}

function remainText(seconds: number) {
  if (seconds >= DAY)
    return `${Math.floor(seconds / DAY)} 天`
  if (seconds >= 3600)
    return `${Math.floor(seconds / 3600)} 小时`
  return `${Math.max(1, Math.floor(seconds / 60))} 分钟`
}

/** 自定义后缀的前端预校验，规则与服务端一致 */
export function validateCode(code: string) {
  const s = code.trim()
  if (!s)
    return ''
  return /^[\w-]{3,32}$/.test(s) ? '' : '后缀需为 3~32 位字母、数字、下划线或短横线'
}

/** 目标链接的前端预校验（服务端会再次校验并规范化） */
export function validateTarget(url: string) {
  const s = url.trim()
  if (!s)
    return '请输入要缩短的链接'
  const full = /^[a-z][\w+.-]*:\/\//i.test(s) ? s : `https://${s}`
  if (!/^https?:\/\//i.test(full))
    return '只支持 http / https 链接'
  const host = full.replace(/^https?:\/\//i, '').split(/[/?#]/)[0]
  if (!host || (!host.includes('.') && !host.startsWith('localhost')))
    return '链接格式不正确'
  return ''
}

export function matchLink(link: { code: string, url: string, title: string, owner?: string }, keyword: string) {
  const kw = keyword.trim().toLowerCase()
  return !kw || [link.code, link.url, link.title, link.owner || ''].some(s => s.toLowerCase().includes(kw))
}
