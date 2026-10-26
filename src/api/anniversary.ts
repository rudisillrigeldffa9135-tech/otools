import type { AnnivDate } from '@/pages-tools/anniversary/calc'
import { http } from '@/http/http'

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
