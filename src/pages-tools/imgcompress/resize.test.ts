import { changePercent, formatBytes, outputName, resolveFormat, targetSize } from './resize'

const base = { mode: 'original' as const, scale: 100, maxWidth: 0, maxHeight: 0 }

describe('targetSize', () => {
  it('原尺寸', () => {
    expect(targetSize(4000, 3000, base)).toEqual({ width: 4000, height: 3000 })
  })

  it('按比例缩放，不放大', () => {
    expect(targetSize(4000, 3000, { ...base, mode: 'scale', scale: 50 })).toEqual({ width: 2000, height: 1500 })
    expect(targetSize(400, 300, { ...base, mode: 'scale', scale: 150 })).toEqual({ width: 400, height: 300 })
  })

  it('限制最大宽高，保持比例，不放大', () => {
    expect(targetSize(4000, 3000, { ...base, mode: 'fit', maxWidth: 1920, maxHeight: 0 })).toEqual({ width: 1920, height: 1440 })
    expect(targetSize(4000, 3000, { ...base, mode: 'fit', maxWidth: 1920, maxHeight: 1080 })).toEqual({ width: 1440, height: 1080 })
    expect(targetSize(800, 600, { ...base, mode: 'fit', maxWidth: 1920, maxHeight: 1080 })).toEqual({ width: 800, height: 600 })
  })

  it('不超过平台上限', () => {
    expect(targetSize(10000, 5000, base, 4096)).toEqual({ width: 4096, height: 2048 })
  })

  it('极小尺寸至少 1px', () => {
    expect(targetSize(10, 1, { ...base, mode: 'scale', scale: 1 })).toEqual({ width: 1, height: 1 })
  })
})

describe('格式与文件名', () => {
  it('保持原格式时按原图类型推断', () => {
    expect(resolveFormat('auto', 'a.PNG')).toBe('png')
    expect(resolveFormat('auto', 'blob', 'image/webp')).toBe('webp')
    expect(resolveFormat('auto', 'a.jpeg')).toBe('jpeg')
    expect(resolveFormat('auto', 'a.gif')).toBe('jpeg')
    expect(resolveFormat('webp', 'a.png')).toBe('webp')
  })

  it('输出文件名替换扩展名', () => {
    expect(outputName('photo.PNG', 'jpeg')).toBe('photo-compressed.jpg')
    expect(outputName('my.holiday.photo.jpeg', 'webp')).toBe('my.holiday.photo-compressed.webp')
    expect(outputName('', 'png')).toBe('image-compressed.png')
  })
})

describe('大小显示', () => {
  it('formatBytes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.50 MB')
  })

  it('changePercent', () => {
    expect(changePercent(1000, 650)).toBe('-35%')
    expect(changePercent(1000, 1100)).toBe('+10%')
    expect(changePercent(0, 10)).toBe('0%')
  })
})
