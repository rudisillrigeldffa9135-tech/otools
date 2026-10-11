/** 图片压缩的纯计算：目标尺寸、文件大小格式化、输出文件名（与平台无关，便于单测） */

export type ResizeMode = 'original' | 'scale' | 'fit'
export type OutputFormat = 'auto' | 'jpeg' | 'png' | 'webp'

export interface ResizeOptions {
  mode: ResizeMode
  /** 缩放百分比 1~100 */
  scale: number
  /** 限制最大宽 / 高（px），0 表示不限制 */
  maxWidth: number
  maxHeight: number
}

/**
 * 计算输出尺寸：只缩小不放大，保持宽高比
 * @param cap 平台允许的最长边（小程序 canvas 有上限）
 */
export function targetSize(width: number, height: number, o: ResizeOptions, cap = 8000) {
  let ratio = 1
  if (o.mode === 'scale') {
    ratio = Math.min(1, Math.max(1, o.scale) / 100)
  }
  else if (o.mode === 'fit') {
    if (o.maxWidth > 0)
      ratio = Math.min(ratio, o.maxWidth / width)
    if (o.maxHeight > 0)
      ratio = Math.min(ratio, o.maxHeight / height)
  }
  ratio = Math.min(ratio, cap / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  }
}

export const MIME: Record<Exclude<OutputFormat, 'auto'>, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

const EXT: Record<Exclude<OutputFormat, 'auto'>, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' }

/** 「保持原格式」时按原图类型决定；不认识的格式（如 gif、bmp）输出 JPEG */
export function resolveFormat(format: OutputFormat, sourceName: string, sourceType = ''): Exclude<OutputFormat, 'auto'> {
  if (format !== 'auto')
    return format
  const t = `${sourceType} ${sourceName}`.toLowerCase()
  if (/png/.test(t))
    return 'png'
  if (/webp/.test(t))
    return 'webp'
  return 'jpeg'
}

/** 替换扩展名并加上后缀，如 photo.PNG → photo-compressed.jpg */
export function outputName(name: string, format: Exclude<OutputFormat, 'auto'>) {
  const base = (name || 'image').replace(/\.[^./\\]+$/, '') || 'image'
  return `${base}-compressed.${EXT[format]}`
}

export function formatBytes(bytes: number) {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/** 体积变化百分比：-35% 表示减小 35% */
export function changePercent(before: number, after: number) {
  if (!before)
    return '0%'
  const p = Math.round(((after - before) / before) * 100)
  return `${p > 0 ? '+' : ''}${p}%`
}
