/** 工具可运行的平台，与 process.env.UNI_PLATFORM 取值一致 */
export type ToolPlatform = 'h5' | 'mp-weixin' | 'app'

export type CategoryId = 'security' | 'dev' | 'crypto' | 'text' | 'image' | 'network' | 'life' | 'convert' | 'generate'

export interface Category {
  id: CategoryId
  name: string
  /** UnoCSS 图标类名，如 i-carbon-code */
  icon: string
  /** 分类强调色，用于卡片图标底色 */
  color: string
}

export interface ToolMeta {
  /** 唯一标识，必须与 src/pages-tools 下的目录名一致 */
  id: string
  name: string
  /** 一句话描述 */
  desc: string
  category: CategoryId
  /** UnoCSS 图标类名，如 i-carbon-json（图标集见 https://icones.js.org/collection/carbon） */
  icon: string
  /** 额外搜索关键字 */
  keywords?: string[]
  /** 仅在这些平台展示；不填表示全平台可用 */
  platforms?: ToolPlatform[]
  /** 排序权重，越小越靠前，默认 100 */
  order?: number
  /** 是否显示 NEW 标记 */
  isNew?: boolean
}

export interface Tool extends ToolMeta {
  /** 页面路径，如 /pages-tools/json/index */
  path: string
}

/** 在 meta.ts 中使用，提供类型提示 */
export function defineTool(meta: ToolMeta): ToolMeta {
  return meta
}
