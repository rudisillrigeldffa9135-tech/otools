import type { Category, CategoryId } from './types'

export const categories: Category[] = [
  { id: 'security', name: '账号安全', icon: 'i-carbon-security', color: '#0ea5e9' },
  { id: 'dev', name: '开发调试', icon: 'i-carbon-code', color: '#4f6ef7' },
  { id: 'crypto', name: '编码加密', icon: 'i-carbon-locked', color: '#10b981' },
  { id: 'text', name: '文本处理', icon: 'i-carbon-text-font', color: '#f59e0b' },
  { id: 'image', name: '图片处理', icon: 'i-carbon-image', color: '#ec4899' },
  { id: 'network', name: '网络工具', icon: 'i-carbon-wifi', color: '#14b8a6' },
  { id: 'life', name: '生活实用', icon: 'i-carbon-calculator', color: '#f97316' },
  { id: 'convert', name: '格式转换', icon: 'i-carbon-renew', color: '#8b5cf6' },
  { id: 'generate', name: '生成工具', icon: 'i-carbon-magic-wand', color: '#ef4444' },
]

const categoryMap = new Map(categories.map(c => [c.id, c]))

export function getCategory(id: CategoryId) {
  return categoryMap.get(id)!
}
