<script lang="ts" setup>
// 二维码预览（带文字备注），供分享弹窗使用；保存的图片里同样带备注
import type { Layout } from '../layout'
import UQRCode from 'uqrcodejs'
import { getCurrentInstance } from 'vue'
import { toast } from '@/utils/common'
import { computeLayout, fileNameOf, wrapText } from '../layout'

const props = withDefaults(defineProps<{
  text: string
  note?: string
  /** 二维码边长（px） */
  size?: number
}>(), {
  note: '',
  size: 200,
})

const FG = '#1d2129'
const BG = '#ffffff'
const FONT_SIZE = 14
// 每个实例用独立的 canvas-id，同一页面可以同时存在多个
const CANVAS_ID = `ot-qr-view-${Math.random().toString(36).slice(2, 8)}`
const instance = getCurrentInstance()
const layout = ref<Layout>()
const error = ref('')
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

interface Painter {
  setFont: (px: number) => void
  measure: (s: string) => number
  begin: (l: Layout) => Promise<void>
  rect: (color: string, x: number, y: number, w: number, h: number) => void
  text: (color: string, s: string, x: number, y: number) => void
  end: () => Promise<void>
}

// #ifdef H5
const SCALE = 3
const FONT_FAMILY = `-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif`
const imageUrl = ref('')
const canvas = document.createElement('canvas')

function createPainterH5(): Painter {
  const ctx = canvas.getContext('2d')!
  return {
    setFont: px => (ctx.font = `${px}px ${FONT_FAMILY}`),
    measure: s => ctx.measureText(s).width,
    async begin(l) {
      const font = ctx.font
      canvas.width = l.width * SCALE
      canvas.height = l.height * SCALE
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
      ctx.font = font
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      layout.value = l
    },
    rect(color, x, y, w, h) {
      ctx.fillStyle = color
      ctx.fillRect(x, y, w, h)
    },
    text(color, s, x, y) {
      ctx.fillStyle = color
      ctx.fillText(s, x, y)
    },
    async end() {
      imageUrl.value = canvas.toDataURL('image/png')
    },
  }
}
// #endif

// #ifndef H5
function createPainterMp(): Painter {
  const ctx = uni.createCanvasContext(CANVAS_ID, instance?.proxy)
  return {
    setFont: px => ctx.setFontSize(px),
    measure: s => ctx.measureText(s).width,
    async begin(l) {
      const resized = layout.value?.width !== l.width || layout.value?.height !== l.height
      layout.value = l
      if (resized) {
        await nextTick()
        await sleep(100)
      }
      ctx.setTextAlign('center')
      ctx.setTextBaseline('middle')
    },
    rect(color, x, y, w, h) {
      ctx.setFillStyle(color)
      ctx.fillRect(x, y, w, h)
    },
    text(color, s, x, y) {
      ctx.setFillStyle(color)
      ctx.fillText(s, x, y)
    },
    end: () => Promise.race([new Promise<void>(resolve => ctx.draw(false, () => resolve())), sleep(500)]),
  }
}
// #endif

async function draw() {
  error.value = ''
  if (!props.text)
    return
  const qr = new UQRCode()
  qr.data = props.text
  qr.errorCorrectLevel = UQRCode.errorCorrectLevel.M
  try {
    qr.make()
  }
  catch {
    error.value = '内容过长，无法生成二维码'
    return
  }
  const count: number = qr.moduleCount
  let p!: Painter
  // #ifdef H5
  p = createPainterH5()
  // #endif
  // #ifndef H5
  p = createPainterMp()
  // #endif
  p.setFont(FONT_SIZE)
  const lines = wrapText(props.note, props.size, p.measure, 2)
  const l = computeLayout({ size: props.size, moduleCount: count, lines: lines.length, fontSize: FONT_SIZE, position: 'bottom' })
  await p.begin(l)
  p.rect(BG, 0, 0, l.width, l.height)
  for (let r = 0; r < count; r++) {
    let c = 0
    while (c < count) {
      if (!qr.isBlack(r, c)) {
        c++
        continue
      }
      const start = c
      while (c < count && qr.isBlack(r, c))
        c++
      p.rect(FG, l.qrX + start * l.cell, l.qrY + r * l.cell, (c - start) * l.cell, l.cell)
    }
  }
  p.setFont(FONT_SIZE)
  lines.forEach((line, i) => p.text(FG, line, l.width / 2, l.textY + i * l.lineHeight))
  await p.end()
}

/** 同一时间只进行一次绘制 */
let queue: Promise<void> = Promise.resolve()
function requestDraw() {
  queue = queue.then(draw, draw)
  return queue
}

onMounted(() => {
  // 小程序的 canvas 需要等节点渲染完成
  nextTick(() => requestDraw())
})
watch(() => [props.text, props.note, props.size], () => requestDraw())

/** 保存图片：H5 下载 PNG，小程序保存到相册 */
async function save() {
  await requestDraw()
  if (error.value)
    return toast(error.value)
  // #ifdef H5
  const a = document.createElement('a')
  a.href = imageUrl.value
  a.download = fileNameOf(props.note)
  a.click()
  // #endif
  // #ifndef H5
  uni.canvasToTempFilePath({
    canvasId: CANVAS_ID,
    success: ({ tempFilePath }) => {
      uni.saveImageToPhotosAlbum({
        filePath: tempFilePath,
        success: () => toast('已保存到相册', 'success'),
        fail: () => toast('保存失败，请检查相册权限'),
      })
    },
    fail: () => toast('导出图片失败'),
  }, instance?.proxy)
  // #endif
}

defineExpose({ save })
</script>

<template>
  <view class="ot-qr-view">
    <view v-if="error" class="py-8 text-center text-13px text-red-500">
      {{ error }}
    </view>
    <template v-else>
      <!-- #ifdef H5 -->
      <image
        v-if="imageUrl" :src="imageUrl" class="block"
        :style="{ width: `${layout?.width}px`, height: `${layout?.height}px` }"
      />
      <!-- #endif -->
      <!-- #ifndef H5 -->
      <canvas
        :id="CANVAS_ID" :canvas-id="CANVAS_ID"
        :style="{ width: `${layout?.width || size}px`, height: `${layout?.height || size}px` }"
      />
      <!-- #endif -->
    </template>
  </view>
</template>

<style lang="scss" scoped>
.ot-qr-view {
  display: inline-flex;
  justify-content: center;
  padding: 8px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid var(--ot-border);
}
</style>
