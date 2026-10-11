import type { CustomRequestOptions } from '@/http/types'
import { http } from '@/http/http'

export interface IPasteSummary {
  /** 6 位取件码 */
  code: string
  /** 原文字符数 */
  size: number
  burnAfterRead: boolean
  /** 被他人提取的次数 */
  views: number
  /** 秒级时间戳 */
  expiresAt: number
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
  /** 有效期（秒），只能是 600 / 3600 / 86400 / 604800 / 2592000 之一 */
  expiresIn: number
  burnAfterRead: boolean
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
