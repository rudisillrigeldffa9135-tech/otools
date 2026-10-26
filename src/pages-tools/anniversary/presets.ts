/** 纪念日的分类、颜色、表情与节日库 */
import type { AnnivCategory } from '@/api/anniversary'
import type { AnnivDate } from './calc'

export const CATEGORIES: { value: AnnivCategory, label: string, emoji: string }[] = [
  { value: 'birthday', label: '生日', emoji: '🎂' },
  { value: 'love', label: '纪念日', emoji: '❤️' },
  { value: 'festival', label: '节日', emoji: '🎉' },
  { value: 'work', label: '工作', emoji: '💼' },
  { value: 'study', label: '学习考试', emoji: '📚' },
  { value: 'life', label: '生活', emoji: '🏠' },
  { value: 'other', label: '其他', emoji: '📌' },
]

export function categoryOf(value: string) {
  return CATEGORIES.find(c => c.value === value) ?? CATEGORIES[CATEGORIES.length - 1]
}

/** 卡片渐变色 */
export const ANNIV_COLORS: { value: string, from: string, to: string }[] = [
  { value: '', from: '#4f6ef7', to: '#8b5cf6' },
  { value: 'red', from: '#f43f5e', to: '#f97316' },
  { value: 'orange', from: '#f97316', to: '#f59e0b' },
  { value: 'amber', from: '#f59e0b', to: '#eab308' },
  { value: 'green', from: '#22c55e', to: '#14b8a6' },
  { value: 'teal', from: '#14b8a6', to: '#0ea5e9' },
  { value: 'blue', from: '#3b82f6', to: '#6366f1' },
  { value: 'indigo', from: '#6366f1', to: '#a855f7' },
  { value: 'purple', from: '#a855f7', to: '#ec4899' },
  { value: 'pink', from: '#ec4899', to: '#f43f5e' },
  { value: 'gray', from: '#64748b', to: '#334155' },
]

export function gradientOf(value: string) {
  const c = ANNIV_COLORS.find(x => x.value === value) ?? ANNIV_COLORS[0]
  return { from: c.from, to: c.to, css: `linear-gradient(135deg, ${c.from}, ${c.to})` }
}

export const EMOJIS = ['🎂', '❤️', '💍', '🎉', '🎊', '🎁', '🌹', '💐', '👶', '👨‍👩‍👧', '🐱', '🐶', '🏠', '🚗', '✈️', '🏖️', '🎓', '📚', '✏️', '💼', '💰', '🏃', '💪', '🚭', '🍺', '🌙', '🧧', '🏮', '🎄', '🎃', '⭐', '☀️', '🌸', '🍀', '⚽', '🎮', '🎵', '📷', '💊', '📌']

export interface FestivalPreset {
  title: string
  emoji: string
  date: AnnivDate
  color: string
}

const solar = (month: number, day: number): AnnivDate => ({ calendar: 'solar', year: null, month, day })
const lunar = (month: number, day: number): AnnivDate => ({ calendar: 'lunar', year: null, month, day })
const nthWd = (month: number, nth: number, weekday: number): AnnivDate => ({ calendar: 'weekday', year: null, month, day: 1, nth, weekday })

/** 节日库：一键添加为每年重复的纪念日 */
export const FESTIVALS: { group: string, items: FestivalPreset[] }[] = [
  {
    group: '传统节日（农历）',
    items: [
      { title: '春节', emoji: '🧧', date: lunar(1, 1), color: 'red' },
      { title: '元宵节', emoji: '🏮', date: lunar(1, 15), color: 'orange' },
      { title: '端午节', emoji: '🐉', date: lunar(5, 5), color: 'green' },
      { title: '七夕', emoji: '💞', date: lunar(7, 7), color: 'pink' },
      { title: '中秋节', emoji: '🌕', date: lunar(8, 15), color: 'amber' },
      { title: '重阳节', emoji: '🌼', date: lunar(9, 9), color: 'orange' },
      { title: '腊八节', emoji: '🥣', date: lunar(12, 8), color: 'amber' },
      // 腊月三十，小月年自动取二十九
      { title: '除夕', emoji: '🧨', date: lunar(12, 30), color: 'red' },
    ],
  },
  {
    group: '公历节日',
    items: [
      { title: '元旦', emoji: '🎆', date: solar(1, 1), color: 'blue' },
      { title: '情人节', emoji: '🌹', date: solar(2, 14), color: 'pink' },
      { title: '妇女节', emoji: '💐', date: solar(3, 8), color: 'purple' },
      { title: '劳动节', emoji: '🛠️', date: solar(5, 1), color: 'red' },
      { title: '青年节', emoji: '🌱', date: solar(5, 4), color: 'green' },
      { title: '520', emoji: '💗', date: solar(5, 20), color: 'pink' },
      { title: '儿童节', emoji: '🎈', date: solar(6, 1), color: 'teal' },
      { title: '国庆节', emoji: '🇨🇳', date: solar(10, 1), color: 'red' },
      { title: '万圣节', emoji: '🎃', date: solar(10, 31), color: 'orange' },
      { title: '平安夜', emoji: '🍎', date: solar(12, 24), color: 'green' },
      { title: '圣诞节', emoji: '🎄', date: solar(12, 25), color: 'green' },
    ],
  },
  {
    group: '按星期计算的节日',
    items: [
      { title: '母亲节', emoji: '💐', date: nthWd(5, 2, 0), color: 'pink' },
      { title: '父亲节', emoji: '👔', date: nthWd(6, 3, 0), color: 'blue' },
      { title: '感恩节', emoji: '🦃', date: nthWd(11, 4, 4), color: 'orange' },
    ],
  },
]

/** 提醒选项：提前几天 */
export const REMIND_DAY_OPTIONS = [
  { value: 0, label: '当天' },
  { value: 1, label: '提前 1 天' },
  { value: 3, label: '提前 3 天' },
  { value: 7, label: '提前 7 天' },
  { value: 15, label: '提前 15 天' },
  { value: 30, label: '提前 30 天' },
]
