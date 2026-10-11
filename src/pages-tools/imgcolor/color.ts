/** 图片取色的纯计算逻辑（与平台无关，便于单测） */

export interface RGBA { r: number, g: number, b: number, a: number }

/** 解码后的像素数据，data 为 RGBA 顺序 */
export interface Pixels {
  width: number
  height: number
  data: ArrayLike<number>
}

export interface PaletteItem {
  color: RGBA
  /** 占比 0~1 */
  ratio: number
}

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0')

export function toHex({ r, g, b, a }: RGBA) {
  const hex = `#${hex2(r)}${hex2(g)}${hex2(b)}`
  return (a < 255 ? hex + hex2(a) : hex).toUpperCase()
}

export function toRgb({ r, g, b, a }: RGBA) {
  return a < 255 ? `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(2)})` : `rgb(${r}, ${g}, ${b})`
}

export function toHsl({ r, g, b, a }: RGBA) {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255]
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === rr)
      h = (gg - bb) / d + (gg < bb ? 6 : 0)
    else if (max === gg)
      h = (bb - rr) / d + 2
    else
      h = (rr - gg) / d + 4
    h *= 60
  }
  const body = `${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`
  return a < 255 ? `hsla(${body}, ${+(a / 255).toFixed(2)})` : `hsl(${body})`
}

/** 浅色背景上用深色文字，反之用白色 */
export function isLight({ r, g, b }: RGBA) {
  return r * 0.299 + g * 0.587 + b * 0.114 > 160
}

/** 等比缩放到最长边不超过 max */
export function fitSize(width: number, height: number, max = 1200) {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** 取 (x, y) 处颜色；radius > 0 时取 (2r+1)² 区域的平均值，越界部分自动裁掉 */
export function pickColor(px: Pixels, x: number, y: number, radius = 0): RGBA {
  let r = 0
  let g = 0
  let b = 0
  let a = 0
  let n = 0
  for (let yy = Math.max(0, y - radius); yy <= Math.min(px.height - 1, y + radius); yy++) {
    for (let xx = Math.max(0, x - radius); xx <= Math.min(px.width - 1, x + radius); xx++) {
      const i = (yy * px.width + xx) * 4
      r += px.data[i]
      g += px.data[i + 1]
      b += px.data[i + 2]
      a += px.data[i + 3]
      n++
    }
  }
  if (!n)
    return { r: 0, g: 0, b: 0, a: 0 }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n), a: Math.round(a / n) }
}

function distance(c1: RGBA, c2: RGBA) {
  return Math.sqrt((c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2)
}

/**
 * 提取主色调：采样后按每通道 4 bit 量化分桶，按像素数从多到少挑选，
 * 与已选颜色过于接近的桶并入最近的颜色，保证结果彼此区分明显、占比合计为 100%。
 * 半透明像素（alpha < 128）不参与统计。
 */
export function extractPalette(px: Pixels, count = 8, minDistance = 48): PaletteItem[] {
  const step = Math.max(1, Math.floor(Math.sqrt((px.width * px.height) / 60000)))
  const buckets = new Map<number, { r: number, g: number, b: number, n: number }>()
  let total = 0
  for (let y = 0; y < px.height; y += step) {
    for (let x = 0; x < px.width; x += step) {
      const i = (y * px.width + x) * 4
      if (px.data[i + 3] < 128)
        continue
      const r = px.data[i]
      const g = px.data[i + 1]
      const b = px.data[i + 2]
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
      const bucket = buckets.get(key)
      if (bucket) {
        bucket.r += r
        bucket.g += g
        bucket.b += b
        bucket.n++
      }
      else {
        buckets.set(key, { r, g, b, n: 1 })
      }
      total++
    }
  }
  if (!total)
    return []

  const sorted = [...buckets.values()]
    .map(k => ({ color: { r: Math.round(k.r / k.n), g: Math.round(k.g / k.n), b: Math.round(k.b / k.n), a: 255 }, n: k.n }))
    .sort((p, q) => q.n - p.n)

  const chosen: { color: RGBA, n: number }[] = []
  for (const item of sorted) {
    let nearest: { color: RGBA, n: number } | undefined
    let nearestDist = Infinity
    for (const c of chosen) {
      const d = distance(c.color, item.color)
      if (d < nearestDist) {
        nearest = c
        nearestDist = d
      }
    }
    if (nearest && (nearestDist < minDistance || chosen.length >= count))
      nearest.n += item.n
    else
      chosen.push({ ...item })
  }
  return chosen
    .sort((p, q) => q.n - p.n)
    .map(c => ({ color: c.color, ratio: c.n / total }))
}
