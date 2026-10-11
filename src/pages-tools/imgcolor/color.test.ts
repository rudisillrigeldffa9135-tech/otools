import type { Pixels, RGBA } from './color'
import { extractPalette, fitSize, isLight, pickColor, toHex, toHsl, toRgb } from './color'

/** 生成 width×height 的图片，fill(x, y) 返回该点颜色 */
function image(width: number, height: number, fill: (x: number, y: number) => RGBA): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const { r, g, b, a } = fill(x, y)
      data.set([r, g, b, a], (y * width + x) * 4)
    }
  }
  return { width, height, data }
}

const RED = { r: 255, g: 0, b: 0, a: 255 }
const BLUE = { r: 0, g: 0, b: 255, a: 255 }

describe('颜色格式化', () => {
  it('格式化为 HEX / RGB / HSL', () => {
    const c = { r: 79, g: 110, b: 247, a: 255 }
    expect(toHex(c)).toBe('#4F6EF7')
    expect(toRgb(c)).toBe('rgb(79, 110, 247)')
    expect(toHsl(c)).toBe('hsl(229, 91%, 64%)')
  })

  it('半透明颜色带 alpha', () => {
    const c = { r: 255, g: 0, b: 0, a: 128 }
    expect(toHex(c)).toBe('#FF000080')
    expect(toRgb(c)).toBe('rgba(255, 0, 0, 0.5)')
    expect(toHsl(c)).toBe('hsla(0, 100%, 50%, 0.5)')
  })

  it('灰色的色相与饱和度为 0', () => {
    expect(toHsl({ r: 128, g: 128, b: 128, a: 255 })).toBe('hsl(0, 0%, 50%)')
  })

  it('明暗判断', () => {
    expect(isLight({ r: 255, g: 255, b: 255, a: 255 })).toBe(true)
    expect(isLight({ r: 20, g: 20, b: 60, a: 255 })).toBe(false)
  })
})

describe('fitSize', () => {
  it('大图按最长边等比缩小，小图不放大', () => {
    expect(fitSize(4000, 2000, 1200)).toEqual({ width: 1200, height: 600 })
    expect(fitSize(300, 200, 1200)).toEqual({ width: 300, height: 200 })
  })
})

describe('pickColor', () => {
  const px = image(4, 4, x => (x < 2 ? RED : BLUE))

  it('取单个像素', () => {
    expect(pickColor(px, 0, 0)).toEqual(RED)
    expect(pickColor(px, 3, 3)).toEqual(BLUE)
  })

  it('区域平均，边界处自动裁剪', () => {
    // (1,1) 的 3×3 区域：x=0,1 红，x=2 蓝 → 红 2/3、蓝 1/3
    expect(pickColor(px, 1, 1, 1)).toEqual({ r: 170, g: 0, b: 85, a: 255 })
    // 角落只有 2×2 个像素，全是红色
    expect(pickColor(px, 0, 0, 1)).toEqual(RED)
  })
})

describe('extractPalette', () => {
  it('按占比从高到低返回主色，占比合计为 1', () => {
    const px = image(10, 10, x => (x < 7 ? RED : BLUE))
    const palette = extractPalette(px)
    expect(palette.map(p => toHex(p.color))).toEqual(['#FF0000', '#0000FF'])
    expect(palette[0].ratio).toBeCloseTo(0.7)
    expect(palette.reduce((s, p) => s + p.ratio, 0)).toBeCloseTo(1)
  })

  it('相近颜色合并为一个', () => {
    const px = image(10, 10, x => (x < 5 ? RED : { r: 250, g: 10, b: 5, a: 255 }))
    expect(extractPalette(px)).toHaveLength(1)
  })

  it('数量超出上限时并入最接近的颜色', () => {
    const colors = [RED, BLUE, { r: 0, g: 255, b: 0, a: 255 }]
    const px = image(3, 1, x => colors[x])
    const palette = extractPalette(px, 2)
    expect(palette).toHaveLength(2)
    expect(palette.reduce((s, p) => s + p.ratio, 0)).toBeCloseTo(1)
  })

  it('忽略透明像素，全透明时返回空', () => {
    expect(extractPalette(image(4, 4, () => ({ r: 0, g: 0, b: 0, a: 0 })))).toEqual([])
  })
})
