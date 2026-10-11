/** 二维码 + 备注文字的排版计算（与平台无关，便于单测） */

export type NotePosition = 'top' | 'bottom'

/** 不能出现在行首的标点（避头尾）：遇到时留在上一行末尾，允许略微超出 */
const NO_LINE_START = new Set(Array.from('，。、；：！？）》」』】〉,.;:!?)]}…'))

/**
 * 按宽度逐字折行（兼容中英文混排），保留手动换行；超出 maxLines 时在最后一行末尾加省略号
 * @param measure 返回字符串渲染宽度，由 canvas 的 measureText 提供
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number, maxLines = 3) {
  if (!text.trim())
    return []
  const lines: string[] = []
  for (const para of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = ''
    for (const ch of Array.from(para)) {
      if (line && measure(line + ch) > maxWidth && !NO_LINE_START.has(ch)) {
        lines.push(line)
        line = ch
      }
      else {
        line += ch
      }
    }
    lines.push(line)
  }
  // 去掉末尾的空行
  while (lines.length && !lines[lines.length - 1].trim())
    lines.pop()
  if (lines.length <= maxLines)
    return lines

  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last && measure(`${last}…`) > maxWidth)
    last = Array.from(last).slice(0, -1).join('')
  kept[maxLines - 1] = `${last}…`
  return kept
}

export interface LayoutInput {
  /** 二维码区域边长（px） */
  size: number
  /** 二维码模块数（每边） */
  moduleCount: number
  /** 备注行数，0 表示无备注 */
  lines: number
  fontSize: number
  position: NotePosition
}

export interface Layout {
  width: number
  height: number
  /** 四周留白 */
  padding: number
  /** 单个模块边长，取整避免模块之间出现细缝 */
  cell: number
  qrX: number
  qrY: number
  qrSize: number
  lineHeight: number
  /** 第一行文字的中线 y 坐标 */
  textY: number
}

/** 计算画布尺寸与各元素位置：二维码居中，备注在上方或下方 */
export function computeLayout({ size, moduleCount, lines, fontSize, position }: LayoutInput): Layout {
  const padding = Math.max(12, Math.round(size * 0.07))
  const cell = Math.max(1, Math.floor(size / moduleCount))
  const qrSize = cell * moduleCount
  const width = size + padding * 2
  const lineHeight = Math.round(fontSize * 1.45)
  const gap = lines ? Math.round(fontSize * 0.8) : 0
  const textHeight = lines * lineHeight
  const height = padding * 2 + size + gap + textHeight

  const qrX = Math.round((width - qrSize) / 2)
  // 二维码区域取整后可能比 size 略小，在 size 的格子内垂直居中
  const qrOffset = Math.round((size - qrSize) / 2)
  const qrTop = position === 'top' && lines ? padding + textHeight + gap : padding
  const textTop = position === 'top' ? padding : padding + size + gap

  return {
    width,
    height,
    padding,
    cell,
    qrX,
    qrY: qrTop + qrOffset,
    qrSize,
    lineHeight,
    textY: textTop + lineHeight / 2,
  }
}

/** 保存图片时的文件名：优先用备注，去掉文件名非法字符 */
export function fileNameOf(note: string) {
  const base = note.split('\n')[0].trim().replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 30)
  return `${base || 'qrcode'}.png`
}
