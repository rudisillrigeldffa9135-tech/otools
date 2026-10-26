import type { AnnivDate } from '@/pages-tools/anniversary/calc'
import { http } from '@/http/http'
import { getEnvBaseUrl } from '@/utils'
import { authHeader } from './files'

export type AnnivCategory = 'birthday' | 'love' | 'festival' | 'work' | 'study' | 'life' | 'other'

export interface IAnniversary {
  id: number
  title: string
  note: string
  emoji: string
  category: AnnivCategory
  color: string
  date: AnnivDate
  /** 每年重复 */
  repeat: boolean
  /** 累计天数是否把起始日算作第 1 天 */
  countFromOne: boolean
  leapRule: 'normal' | 'leapOnly'
  feb29Rule: 'feb28' | 'mar1'
  /** 'HH:mm'：精确倒计时与提醒时刻 */
  time: string | null
  pinned: boolean
  /** 提前几天提醒，0 为当天 */
  remindDays: number[]
  /** 里程碑（第 100 / 1000 天等）当天提醒 */
  remindMilestone: boolean
  nextRemindAt: number | null
  shareCode: string | null
  shareExpiresAt: number
  shareLocked: boolean
  hasBackground: boolean
  /** 背景图地址（/api/anniv-bg/...），显示时用 absoluteApiUrl 转成完整地址 */
  background: string | null
  sort: number
  createdAt: number
  updatedAt: number
}

export type IAnniversaryForm = Partial<Pick<IAnniversary, 'title' | 'note' | 'emoji' | 'category' | 'color' | 'date' | 'repeat' | 'countFromOne' | 'leapRule' | 'feb29Rule' | 'time' | 'pinned' | 'remindDays' | 'remindMilestone' | 'sort'>>

function tz() {
  return new Date().getTimezoneOffset()
}

export function listAnniversaries() {
  return http.get<IAnniversary[]>('/anniversaries')
}

export function createAnniversary(data: IAnniversaryForm) {
  return http.post<IAnniversary>('/anniversaries', { ...data, tzOffset: tz() })
}

export function updateAnniversary(id: number, data: IAnniversaryForm) {
  return http.put<IAnniversary>(`/anniversaries/${id}`, { ...data, tzOffset: tz() })
}

export function deleteAnniversary(id: number) {
  return http.delete<null>(`/anniversaries/${id}`)
}

/* ---------------- 分享 ---------------- */

export interface IAnnivShare {
  id: number
  shareCode: string | null
  shareExpiresAt: number
  shareLocked: boolean
  /** 访问密码（只有自己能看到） */
  sharePassword: string | null
}

export function getAnnivShare(id: number) {
  return http.get<IAnnivShare>(`/anniversaries/${id}/share`)
}

/** password：undefined 不修改，'' 取消密码 */
export function shareAnniversary(id: number, expiresIn: number, renew = false, password?: string) {
  return http.post<IAnnivShare>(`/anniversaries/${id}/share`, { expiresIn, renew, password })
}

export function unshareAnniversary(id: number) {
  return http.delete<IAnnivShare>(`/anniversaries/${id}/share`)
}

export interface ISharedAnniversary {
  title: string
  emoji: string
  category: AnnivCategory
  color: string
  date: AnnivDate
  repeat: boolean
  countFromOne: boolean
  leapRule: 'normal' | 'leapOnly'
  feb29Rule: 'feb28' | 'mar1'
  time: string | null
  background: string | null
  shareExpiresAt: number
}

/** 公开访问；设了密码时放在请求头里，缺少或错误返回 403 */
export function getSharedAnniversary(code: string, password = '') {
  const header = password ? { 'X-Share-Password': encodeURIComponent(password) } : undefined
  return http.get<ISharedAnniversary>(`/shared/anniversaries/${encodeURIComponent(code)}`, undefined, header, { hideErrorToast: true })
}

/* ---------------- 背景图 ---------------- */

/** 上传背景图（请求体是图片本身，最大 2 MB）。H5 传 Blob，小程序传 ArrayBuffer */
export function uploadBackground(id: number, data: Blob | ArrayBuffer, type = 'image/jpeg'): Promise<{ background: string }> {
  const url = `${getEnvBaseUrl()}/anniversaries/${id}/background`
  // #ifdef H5
  return fetch(url, { method: 'POST', headers: { ...authHeader(), 'Content-Type': type }, body: data })
    .then(async (res) => {
      const body = await res.json().catch(() => null)
      if (res.ok && body?.code === 200)
        return body.data
      throw new Error(body?.message || `上传失败（${res.status}）`)
    })
  // #endif
  // #ifndef H5
  return new Promise((resolve, reject) => {
    uni.request({
      url,
      method: 'POST',
      data: data as ArrayBuffer,
      header: { ...authHeader(), 'Content-Type': type },
      success: (res) => {
        const body = (typeof res.data === 'string' ? JSON.parse(res.data) : res.data) as any
        if (res.statusCode === 200 && body?.code === 200)
          resolve(body.data)
        else
          reject(new Error(body?.message || `上传失败（${res.statusCode}）`))
      },
      fail: () => reject(new Error('网络错误，上传失败')),
    })
  })
  // #endif
}

export function deleteBackground(id: number) {
  return http.delete<null>(`/anniversaries/${id}/background`)
}
