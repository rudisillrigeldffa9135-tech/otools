/** 清单颜色（与 worker/src/todo.ts 的 COLORS 对应） */
export const LIST_COLORS: { value: string, hex: string, label: string }[] = [
  { value: '', hex: '#94a3b8', label: '默认' },
  { value: 'red', hex: '#ef4444', label: '红' },
  { value: 'orange', hex: '#f97316', label: '橙' },
  { value: 'amber', hex: '#f59e0b', label: '黄' },
  { value: 'green', hex: '#22c55e', label: '绿' },
  { value: 'teal', hex: '#14b8a6', label: '青' },
  { value: 'blue', hex: '#3b82f6', label: '蓝' },
  { value: 'indigo', hex: '#6366f1', label: '靛' },
  { value: 'purple', hex: '#a855f7', label: '紫' },
  { value: 'pink', hex: '#ec4899', label: '粉' },
  { value: 'gray', hex: '#6b7280', label: '灰' },
]

export function colorHex(value: string) {
  return LIST_COLORS.find(c => c.value === value)?.hex ?? LIST_COLORS[0].hex
}

/** 优先级：0 无，1 低，2 中，3 高 */
export const PRIORITIES = [
  { value: 3, label: '高', hex: '#ef4444' },
  { value: 2, label: '中', hex: '#f59e0b' },
  { value: 1, label: '低', hex: '#3b82f6' },
  { value: 0, label: '无', hex: '#94a3b8' },
]

export function priorityHex(p: number) {
  return PRIORITIES.find(x => x.value === p)?.hex ?? '#94a3b8'
}

/** 提醒选项：提前多少分钟 */
export const REMIND_OPTIONS = [
  { value: null, label: '不提醒' },
  { value: 0, label: '准时' },
  { value: 5, label: '提前 5 分钟' },
  { value: 15, label: '提前 15 分钟' },
  { value: 30, label: '提前 30 分钟' },
  { value: 60, label: '提前 1 小时' },
  { value: 120, label: '提前 2 小时' },
  { value: 1440, label: '提前 1 天' },
  { value: 2880, label: '提前 2 天' },
] as const

export function remindLabel(minutes: number | null, hasTime: boolean) {
  if (minutes === null)
    return '不提醒'
  if (minutes === 0)
    return hasTime ? '准时提醒' : '当天 9:00 提醒'
  const found = REMIND_OPTIONS.find(o => o.value === minutes)
  return found ? found.label : `提前 ${minutes} 分钟`
}
