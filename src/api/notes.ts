import type { CustomRequestOptions } from '@/http/types'
import { http } from '@/http/http'

export interface INoteMeta {
  id: number
  /** 正文字符数 */
  size: number
  pinned: boolean
  /** 每次修改正文 +1，用于检测多设备冲突 */
  version: number
  /** 秒级时间戳 */
  createdAt: number
  updatedAt: number
  /** 由正文第一行推导 */
  title: string
}

export interface INoteListItem extends INoteMeta {
  preview: string
}

export interface INote extends INoteMeta {
  content: string
}

export interface ISaveNoteForm {
  content?: string
  pinned?: boolean
  /** 编辑开始时的版本，与服务端不一致时返回 409 */
  baseVersion?: number
  /** 忽略版本冲突，直接覆盖 */
  force?: boolean
}

export function listNotes() {
  return http.get<INoteListItem[]>('/notes')
}

export function getNote(id: number) {
  return http.get<INote>(`/notes/${id}`)
}

export function createNote(content: string, options?: Partial<CustomRequestOptions>) {
  return http.post<INoteMeta>('/notes', { content }, undefined, undefined, options)
}

export function updateNote(id: number, data: ISaveNoteForm, options?: Partial<CustomRequestOptions>) {
  return http.put<INoteMeta>(`/notes/${id}`, { ...data }, undefined, undefined, options)
}

export function deleteNote(id: number) {
  return http.delete<null>(`/notes/${id}`)
}
