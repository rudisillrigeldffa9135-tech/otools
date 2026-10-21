import type { CustomRequestOptions } from '@/http/types'
import { http } from '@/http/http'

export interface INoteMeta {
  id: number
  /** 正文字符数 */
  size: number
  pinned: boolean
  /** 每次修改正文 +1，用于检测多设备冲突 */
  version: number
  /** 所在文件夹，null 为未分类 */
  folderId: number | null
  /** 秒级时间戳 */
  createdAt: number
  updatedAt: number
  /** 由正文第一行推导 */
  title: string
  /** 分享码，未分享为 null */
  shareCode: string | null
  /** 分享到期时间（秒），0 为永久 */
  shareExpiresAt: number
  /** 分享是否设了访问密码 */
  shareLocked: boolean
}

export interface INoteListItem extends INoteMeta {
  preview: string
}

export interface INote extends INoteMeta {
  content: string
  /** 分享访问密码（只有作者本人能看到），未设置为 null */
  sharePassword: string | null
}

/** 分享相关接口返回的信息 */
export type IShareMeta = INoteMeta & { sharePassword: string | null }

export interface ISaveNoteForm {
  content?: string
  pinned?: boolean
  /** 编辑开始时的版本，与服务端不一致时返回 409 */
  baseVersion?: number
  /** 忽略版本冲突，直接覆盖 */
  force?: boolean
  /** 移动到文件夹，null 为未分类 */
  folderId?: number | null
}

export function listNotes() {
  return http.get<INoteListItem[]>('/notes')
}

export function getNote(id: number) {
  return http.get<INote>(`/notes/${id}`)
}

export function createNote(content: string, folderId: number | null = null, options?: Partial<CustomRequestOptions>) {
  return http.post<INoteMeta>('/notes', { content, folderId }, undefined, undefined, options)
}

export function updateNote(id: number, data: ISaveNoteForm, options?: Partial<CustomRequestOptions>) {
  return http.put<INoteMeta>(`/notes/${id}`, { ...data }, undefined, undefined, options)
}

export function deleteNote(id: number) {
  return http.delete<null>(`/notes/${id}`)
}

/** 分享有效期（秒），0 为永久 */
export type ShareTtl = 0 | 86400 | 604800 | 2592000

/**
 * 开启或修改分享
 * @param password undefined 不修改，'' 取消密码，其他为新密码
 */
export function shareNote(id: number, expiresIn: ShareTtl, renew = false, password?: string) {
  return http.post<IShareMeta>(`/notes/${id}/share`, { expiresIn, renew, password })
}

export function unshareNote(id: number) {
  return http.delete<IShareMeta>(`/notes/${id}/share`)
}

export interface ISharedNote {
  title: string
  content: string
  updatedAt: number
  /** 0 为永久 */
  shareExpiresAt: number
}

/** 公开访问，无需登录；设了密码时放在请求头里，缺少或错误返回 403 */
export function getSharedNote(code: string, password = '') {
  const header = password ? { 'X-Share-Password': encodeURIComponent(password) } : undefined
  return http.get<ISharedNote>(`/shared/notes/${encodeURIComponent(code)}`, undefined, header, { hideErrorToast: true })
}

/* ---------------- 文件夹 ---------------- */

export interface INoteFolder {
  id: number
  name: string
  createdAt: number
}

export function listFolders() {
  return http.get<INoteFolder[]>('/note-folders')
}

export function createFolder(name: string) {
  return http.post<INoteFolder>('/note-folders', { name })
}

export function renameFolder(id: number, name: string) {
  return http.put<INoteFolder>(`/note-folders/${id}`, { name })
}

/** 删除文件夹，其中的便签移到未分类 */
export function deleteFolder(id: number) {
  return http.delete<null>(`/note-folders/${id}`)
}

/* ---------------- 历史版本 ---------------- */

export interface INoteVersionItem {
  id: number
  size: number
  createdAt: number
}

export interface INoteVersionList {
  items: INoteVersionItem[]
  /** 本人全部历史版本占用 / 上限（字节） */
  usedBytes: number
  maxBytes: number
  limits: { perNote: number, intervalMinutes: number, retentionDays: number }
}

export interface INoteVersion extends INoteVersionItem {
  title: string
  content: string
}

export function listVersions(noteId: number) {
  return http.get<INoteVersionList>(`/notes/${noteId}/versions`)
}

export function getVersion(noteId: number, versionId: number) {
  return http.get<INoteVersion>(`/notes/${noteId}/versions/${versionId}`)
}

/** 恢复到历史版本（当前内容会先存为一个版本），返回恢复后的便签 */
export function restoreVersion(noteId: number, versionId: number) {
  return http.post<INote>(`/notes/${noteId}/versions/${versionId}/restore`)
}

export function clearVersions(noteId: number) {
  return http.delete<null>(`/notes/${noteId}/versions`)
}
