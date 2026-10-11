import type { CategoryId, Tool, ToolMeta, ToolPlatform } from './types'
import metas from 'virtual:tool-metas'
import { categories } from './categories'

/**
 * 工具注册表：自动收集 src/pages-tools/<id>/meta.ts
 * 新增工具只需新建目录，无需在此处手动登记
 * （由 vite-plugins/tool-metas.ts 在构建期内联，见该文件说明）
 */

const categoryOrder = new Map(categories.map((c, i) => [c.id, i]))

// UNI_PLATFORM 由 uni-app 在编译期注入
// eslint-disable-next-line node/prefer-global/process
const currentPlatform = process.env.UNI_PLATFORM as ToolPlatform

function isAvailable(meta: ToolMeta) {
  return !meta.platforms || meta.platforms.includes(currentPlatform)
}

export const tools: Tool[] = (metas as ToolMeta[])
  .filter(isAvailable)
  .map(meta => ({ ...meta, path: `/pages-tools/${meta.id}/index` }))
  // 先按分类顺序，再按 order，最后按名称
  .sort((a, b) =>
    categoryOrder.get(a.category)! - categoryOrder.get(b.category)!
    || (a.order ?? 100) - (b.order ?? 100)
    || a.name.localeCompare(b.name, 'zh'))

const toolMap = new Map(tools.map(t => [t.id, t]))

export function getTool(id: string) {
  return toolMap.get(id)
}

export function getToolsByCategory(category: CategoryId) {
  return tools.filter(t => t.category === category)
}

/** 根据页面路径反查工具，如 /pages-tools/json/index → json */
export function getToolByPath(path: string) {
  const match = path.match(/pages-tools\/([^/]+)\//)
  return match ? getTool(match[1]) : undefined
}

export function searchTools(keyword: string) {
  const kw = keyword.trim().toLowerCase()
  if (!kw)
    return tools
  return tools.filter(t =>
    [t.name, t.desc, t.id, ...(t.keywords || [])].some(s => s.toLowerCase().includes(kw)),
  )
}

export function openTool(tool: Tool) {
  uni.navigateTo({ url: tool.path })
}
