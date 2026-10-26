/** 纪念日卡片上显示的文字（纯函数，便于测试） */
import type { AnnivRule, AnnivSummary } from './calc'
import { weekday } from '../datecalc/date'
import { summarize } from './calc'

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export interface AnnivDisplay {
  summary: AnnivSummary
  /** 「还有」「已经」「就是」 */
  label: string
  /** 大数字；「就是今天」时为空 */
  number: string
  /** 「天」或「今天」 */
  unit: string
  /** 第 N 周年 / N 岁生日 */
  nthText: string
  /** 下一次日期 + 星期 */
  dateText: string
}

export function nthLabel(nth: number | null, birthday: boolean) {
  if (nth === null || nth <= 0)
    return ''
  return birthday ? `${nth} 岁生日` : `${nth} 周年`
}

export function displayOf(rule: AnnivRule, birthday: boolean, today: string): AnnivDisplay {
  const s = summarize(rule, today)
  const nthText = nthLabel(s.nth, birthday)
  const dateText = s.nextDate ? `${s.nextDate} ${WEEK[weekday(s.nextDate)]}` : s.origin ? `起始于 ${s.origin}` : ''
  if (s.kind === 'today')
    return { summary: s, label: '就是', number: '', unit: '今天', nthText, dateText }
  if (s.kind === 'countdown')
    return { summary: s, label: '还有', number: String(s.days), unit: '天', nthText, dateText }
  return { summary: s, label: '已经', number: String(s.days), unit: '天', nthText, dateText }
}

/** 排序：今天的在前，然后按倒数天数从近到远，最后是累计的（天数多的在前） */
export function compareDisplay(a: AnnivDisplay, b: AnnivDisplay) {
  const rank = (d: AnnivDisplay) => (d.summary.kind === 'today' ? 0 : d.summary.kind === 'countdown' ? 1 : 2)
  if (rank(a) !== rank(b))
    return rank(a) - rank(b)
  if (a.summary.kind === 'countup')
    return b.summary.days - a.summary.days
  return a.summary.days - b.summary.days
}

/** 精确倒计时：距离目标时刻的天、时、分、秒 */
export function countdownParts(targetMs: number, nowMs: number) {
  const diff = Math.max(0, Math.floor((targetMs - nowMs) / 1000))
  return {
    done: targetMs <= nowMs,
    days: Math.floor(diff / 86400),
    hours: Math.floor(diff % 86400 / 3600),
    minutes: Math.floor(diff % 3600 / 60),
    seconds: diff % 60,
  }
}
