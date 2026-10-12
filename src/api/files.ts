import { http } from '@/http/http'
import { useTokenStore } from '@/store/token'
import { getEnvBaseUrl } from '@/utils'
import { getSiteOrigin } from '@/utils/site'

export interface IFileSummary {
  /** 6 位取件码 */
  code: string
  name: string
  size: number
  mime: string
  burnAfterRead: boolean
  burned: boolean
  /** 被他人下载的次数 */
  downloads: number
  /** 秒级时间戳 */
  expiresAt: number
  createdAt: number
}

export interface IFileInfo extends IFileSummary {
  isOwner: boolean
  /** 以 /api 开头的下载路径，10 分钟内有效 */
  downloadPath: string
}

/** 可选有效期（秒）：1 小时 / 1 天 / 3 天 / 7 天 */
export const FILE_TTLS = [3600, 86400, 3 * 86400, 7 * 86400] as const
/** 网页版单个文件上限；小程序为 50 MB */
export const MAX_FILE_SIZE = 100 * 1024 * 1024
export const MAX_MP_FILE_SIZE = 50 * 1024 * 1024

export function listFiles() {
  return http.get<IFileSummary[]>('/files')
}

/** 凭取件码查看文件信息并获取下载链接（无需登录） */
export function getFileInfo(code: string) {
  return http.get<IFileInfo>(`/files/${encodeURIComponent(code)}`, undefined, undefined, { hideErrorToast: true })
}

export function deleteFile(code: string) {
  return http.delete<null>(`/files/${encodeURIComponent(code)}`)
}

/** 把接口返回的 /api/... 路径变成可以直接访问的完整地址 */
export function absoluteApiUrl(path: string) {
  const base = getEnvBaseUrl() || ''
  if (/^https?:\/\//.test(base))
    return new URL(path, base).href
  // H5 同域部署时接口地址是相对路径
  return `${getSiteOrigin()}${path}`
}

/** 上传接口地址（含 query），H5 直传与小程序 uploadFile 共用 */
export function uploadUrl(query: Record<string, string>) {
  const qs = Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  return `${getEnvBaseUrl()}/files?${qs}`
}

export function authHeader(): Record<string, string> {
  const token = useTokenStore().updateNowTime().validToken
  return token ? { Authorization: `Bearer ${token}` } : {}
}
