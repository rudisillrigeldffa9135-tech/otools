/**
 * 选择并压缩背景图：最长边缩到 1600px、转成 JPEG，保证不超过 2 MB（服务端上限）。
 * H5 用 canvas 压缩，小程序用 uni.compressImage。
 */

export const MAX_BG_BYTES = 2 * 1024 * 1024
const MAX_SIDE = 1600

export interface PickedImage {
  data: Blob | ArrayBuffer
  type: string
  size: number
}

function choose(): Promise<{ path: string, file?: File }> {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      success: (res) => {
        const files = res.tempFiles as unknown as (File | { path: string })[]
        resolve({ path: res.tempFilePaths[0], file: files?.[0] instanceof File ? files[0] as File : undefined })
      },
      fail: err => reject(new Error(/cancel/i.test(err?.errMsg || '') ? '' : '选择图片失败')),
    })
  })
}

// #ifdef H5
function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('无法读取这张图片'))
    img.src = src
  })
}

async function compressH5(src: string): Promise<PickedImage> {
  const img = await loadImage(src)
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  const ctx = canvas.getContext('2d')!
  // 透明的 PNG 转 JPEG 时铺白底
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  for (const quality of [0.85, 0.75, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', quality))
    if (blob && blob.size <= MAX_BG_BYTES)
      return { data: blob, type: 'image/jpeg', size: blob.size }
  }
  throw new Error('图片太大，压缩后仍超过 2 MB')
}
// #endif

// #ifndef H5
function compressMp(src: string): Promise<PickedImage> {
  return new Promise((resolve, reject) => {
    uni.compressImage({
      src,
      quality: 75,
      compressedWidth: MAX_SIDE,
      success: ({ tempFilePath }) => {
        uni.getFileSystemManager().readFile({
          filePath: tempFilePath,
          success: ({ data }) => {
            const buf = data as ArrayBuffer
            if (buf.byteLength > MAX_BG_BYTES)
              reject(new Error('图片太大，压缩后仍超过 2 MB'))
            else
              resolve({ data: buf, type: 'image/jpeg', size: buf.byteLength })
          },
          fail: () => reject(new Error('读取图片失败')),
        })
      },
      fail: () => reject(new Error('压缩图片失败')),
    })
  })
}
// #endif

/** 选择一张图片并压缩；用户取消时抛出 message 为空的错误 */
export async function pickBackground(): Promise<PickedImage> {
  const { path } = await choose()
  // #ifdef H5
  return compressH5(path)
  // #endif
  // #ifndef H5
  return compressMp(path)
  // #endif
}
