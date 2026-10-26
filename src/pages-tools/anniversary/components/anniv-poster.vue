<script lang="ts" setup>
// 纪念日分享图：渐变背景 + 表情 + 名称 + 大数字；H5 下载 PNG，小程序保存到相册
import { getCurrentInstance } from 'vue'
import { toast } from '@/utils/common'

const props = defineProps<{
  emoji: string
  title: string
  /** 「还有」「已经」「就是」 */
  label: string
  /** 大数字，如 1000；「就是今天」时为空 */
  number: string
  /** 「天」或「今天」 */
  unit: string
  /** 下方的说明文字（最多 3 行） */
  lines: string[]
  from: string
  to: string
}>()

const W = 300
const H = 400
const CANVAS_ID = `ot-anniv-poster-${Math.random().toString(36).slice(2, 8)}`
const instance = getCurrentInstance()
const FONT = `-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif`

interface Ctx {
  gradient: (from: string, to: string) => void
  rect: (color: string, x: number, y: number, w: number, h: number, r?: number) => void
  text: (s: string, x: number, y: number, size: number, color: string, weight?: string) => void
  end: () => Promise<void>
}

// #ifdef H5
const SCALE = 3
const imageUrl = ref('')
const canvas = document.createElement('canvas')
function createCtxH5(): Ctx {
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  return {
    gradient(from, to) {
      const g = ctx.createLinearGradient(0, 0, W, H)
      g.addColorStop(0, from)
      g.addColorStop(1, to)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
    },
    rect(color, x, y, w, h, r = 0) {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.roundRect(x, y, w, h, r)
      ctx.fill()
    },
    text(s, x, y, size, color, weight = 'normal') {
      ctx.font = `${weight} ${size}px ${FONT}`
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
function createCtxMp(): Ctx {
  const ctx = uni.createCanvasContext(CANVAS_ID, instance?.proxy)
  ctx.setTextAlign('center')
  ctx.setTextBaseline('middle')
  return {
    gradient(from, to) {
      const g = ctx.createLinearGradient(0, 0, W, H)
      g.addColorStop(0, from)
      g.addColorStop(1, to)
      ctx.setFillStyle(g as any)
      ctx.fillRect(0, 0, W, H)
    },
    rect(color, x, y, w, h, r = 0) {
      ctx.setFillStyle(color)
      if (r >= w / 2) {
        // 小程序 canvas 没有 roundRect，圆形用 arc 画
        ctx.beginPath()
        ctx.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2)
        ctx.fill()
      }
      else {
        ctx.fillRect(x, y, w, h)
      }
    },
    text(s, x, y, size, color, weight = 'normal') {
      ctx.font = `${weight} ${size}px sans-serif`
      ctx.setFontSize(size)
      ctx.setFillStyle(color)
      ctx.fillText(s, x, y)
    },
    end: () => Promise.race([new Promise<void>(resolve => ctx.draw(false, () => resolve())), new Promise<void>(r => setTimeout(r, 500))]),
  }
}
// #endif

async function draw() {
  let c!: Ctx
  // #ifdef H5
  c = createCtxH5()
  // #endif
  // #ifndef H5
  c = createCtxMp()
  // #endif
  c.gradient(props.from, props.to)
  // 装饰圆
  c.rect('rgba(255,255,255,0.08)', 200, -40, 160, 160, 80)
  c.rect('rgba(255,255,255,0.06)', -60, 300, 160, 160, 80)
  c.text(props.emoji, W / 2, 70, 44, '#ffffff')
  c.text(props.title.length > 14 ? `${props.title.slice(0, 13)}…` : props.title, W / 2, 128, 22, '#ffffff', '600')
  c.text(props.label, W / 2, 172, 14, 'rgba(255,255,255,0.85)')
  if (props.number) {
    c.text(props.number, W / 2, 222, props.number.length > 5 ? 52 : 64, '#ffffff', '700')
    c.text(props.unit, W / 2, 268, 16, 'rgba(255,255,255,0.9)')
  }
  else {
    c.text(props.unit, W / 2, 230, 40, '#ffffff', '700')
  }
  props.lines.slice(0, 3).forEach((line, i) => c.text(line, W / 2, 308 + i * 20, 12, 'rgba(255,255,255,0.85)'))
  c.text('OTools · 纪念日', W / 2, H - 20, 10, 'rgba(255,255,255,0.6)')
  await c.end()
}

let queue: Promise<void> = Promise.resolve()
function requestDraw() {
  queue = queue.then(draw, draw)
  return queue
}
onMounted(() => nextTick(() => requestDraw()))
watch(() => [props.emoji, props.title, props.label, props.number, props.unit, props.lines.join('|'), props.from, props.to], () => requestDraw())

async function save() {
  await requestDraw()
  // #ifdef H5
  const a = document.createElement('a')
  a.href = imageUrl.value
  a.download = `${props.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 30) || '纪念日'}.png`
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
  <view class="ot-ap">
    <!-- #ifdef H5 -->
    <image v-if="imageUrl" :src="imageUrl" class="ot-ap__img" mode="widthFix" />
    <!-- #endif -->
    <!-- #ifndef H5 -->
    <canvas :id="CANVAS_ID" :canvas-id="CANVAS_ID" class="ot-ap__img" :style="{ width: `${W}px`, height: `${H}px` }" />
    <!-- #endif -->
  </view>
</template>

<style lang="scss" scoped>
.ot-ap {
  display: flex;
  justify-content: center;
}

.ot-ap__img {
  width: 240px;
  border-radius: 14px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}
</style>
