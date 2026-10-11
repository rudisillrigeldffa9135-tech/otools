/** 跨端通用小工具 */

export function toast(title: string, icon: 'none' | 'success' | 'error' = 'none') {
  uni.showToast({ title, icon })
}

/** 复制到剪贴板（小程序会自动弹出“内容已复制”） */
export function copyText(text: string) {
  if (!text) {
    toast('没有可复制的内容')
    return
  }
  uni.setClipboardData({
    data: text,
    // #ifdef H5
    success: () => toast('已复制', 'success'),
    // #endif
  })
}

/**
 * 获取加密安全的随机字节
 * H5 使用 Web Crypto；微信小程序使用 wx.getRandomValues；均不可用时退化为 Math.random
 */
export function getRandomBytes(length: number): Promise<Uint8Array> {
  const g = globalThis as any
  if (g.crypto?.getRandomValues) {
    return Promise.resolve(g.crypto.getRandomValues(new Uint8Array(length)))
  }
  // #ifdef MP-WEIXIN
  if (typeof wx !== 'undefined' && wx.getRandomValues) {
    return new Promise((resolve) => {
      wx.getRandomValues({
        length,
        success: res => resolve(new Uint8Array(res.randomValues)),
        fail: () => resolve(mathRandomBytes(length)),
      })
    })
  }
  // #endif
  return Promise.resolve(mathRandomBytes(length))
}

function mathRandomBytes(length: number) {
  const arr = new Uint8Array(length)
  for (let i = 0; i < length; i++)
    arr[i] = Math.floor(Math.random() * 256)
  return arr
}

/** 无偏差地从 [0, max) 中取随机整数序列 */
export async function getRandomInts(count: number, max: number): Promise<number[]> {
  if (max < 1 || max > 256)
    throw new RangeError('max 需在 1~256 之间')
  const result: number[] = []
  const limit = 256 - (256 % max)
  while (result.length < count) {
    const bytes = await getRandomBytes((count - result.length) * 2)
    for (const b of bytes) {
      if (b < limit && result.length < count)
        result.push(b % max)
    }
  }
  return result
}
