import type { CustomRequestOptions } from '@/http/types'
import { http } from '@/http/http'

export interface IPasteSummary {
  /** 6 位取件码；不需要取件码时为 16 位链接码 */
  code: string
  /** 是否使用 6 位取件码；否则只能通过链接打开 */
  withCode: boolean
  /** 原文字符数 */
  size: number
  burnAfterRead: boolean
  /** 分享链接直接打开纯文本页面 */
  raw: boolean
  /** 被他人提取的次数 */
  views: number
  /** 秒级时间戳；null 表示永久有效 */
  expiresAt: number | null
  createdAt: number
}

export interface IPasteListItem extends IPasteSummary {
  preview: string
}

export interface IPasteDetail extends IPasteSummary {
  content: string
  isOwner: boolean
  /** 本次提取后已被销毁（阅后即焚） */
  burned: boolean
}

export interface ICreatePasteForm {
  content: string
  /** 有效期（秒），只能是 600 / 3600 / 86400 / 604800 / 2592000 之一，0 表示永久 */
  expiresIn: number
  burnAfterRead: boolean
  /** 是否生成 6 位取件码；false 时只能通过链接打开 */
  withCode: boolean
  /** 分享链接直接打开纯文本页面 */
  raw: boolean
}

export function listPastes() {
  return http.get<IPasteListItem[]>('/pastes')
}

export function createPaste(data: ICreatePasteForm) {
  return http.post<IPasteSummary>('/pastes', { ...data })
}

/** 按取件码提取；他人提取阅后即焚的内容后会被销毁 */
export function getPaste(code: string, options?: Partial<CustomRequestOptions>) {
  return http.get<IPasteDetail>(`/pastes/${encodeURIComponent(code)}`, undefined, undefined, options)
}

export function deletePaste(code: string) {
  return http.delete<null>(`/pastes/${encodeURIComponent(code)}`)
}
