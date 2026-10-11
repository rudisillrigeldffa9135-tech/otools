<script lang="ts" setup>
import type { Layout, NotePosition } from './layout'
import UQRCode from 'uqrcodejs'
import { getCurrentInstance } from 'vue'
import { toast } from '@/utils/common'
import { computeLayout, fileNameOf, wrapText } from './layout'

definePage({
  style: { navigationBarTitleText: '二维码生成' },
})

const CANVAS_ID = 'ot-qrcode'
const NOTE_MAX = 60
const NOTE_MAX_LINES = 3
const instance = getCurrentInstance()

const text = ref('https://github.com')
const note = ref('')
const size = ref(220)
const sizeOptions = [
  { value: 160, label: '小' },
  { value: 220, label: '中' },
  { value: 280, label: '大' },
]
const level = ref<'L' | 'M' | 'Q' | 'H'>('M')
const levelOptions = ['L', 'M', 'Q', 'H']
const notePosition = ref<NotePosition>('bottom')
const positionOptions = [
  { value: 'bottom', label: '二维码下方' },
  { value: 'top', label: '二维码上方' },
]
const fontSize = ref(15)
const fontOptions = [
  { value: 13, label: '小' },
  { value: 15, label: '中' },
  { value: 18, label: '大' },
]
const fg = ref('#1d2129')
const bg = ref('#ffffff')
const FG_PRESETS = ['#1d2129', '#4f6ef7', '#10b981', '#ef4444', '#8b5cf6']
const BG_PRESETS = ['#ffffff', '#f5f6f8', '#fff7e6', '#eef2ff']

/** 当前画布布局，决定预览的显示尺寸 */
const layout = ref<Layout>()
const error = ref('')
/** 绘制队列：同一时间只进行一次绘制，避免两次绘制交错（如打开页面时 onReady 与参数变化同时触发） */
let queue: Promise<void> = Promise.resolve()
function requestDraw() {
  queue = queue.then(draw, draw)
  return queue
}

/** 解码失败（如内容里有孤立的 %）时保持原样 */
function safeDecode(s: string) {
  try {
    return decodeURIComponent(s)
  }
  catch {
    return s
  }
}

onLoad((query) => {
  // 支持从其他工具带参数打开，如短链工具：?text=...&note=...
  if (query?.text)
    text.value = safeDecode(query.text)
  if (query?.note)
    note.value = safeDecode(query.note).slice(0, NOTE_MAX)
})

let timer: ReturnType<typeof setTimeout> | undefined
function scheduleDraw() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    requestDraw()
  }, 200)
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** 绘图接口：H5 用原生 canvas，小程序用旧版 canvas 上下文，绘制逻辑共用 */
interface Painter {
  setFont: (px: number) => void
  measure: (s: string) => number
  /** 按布局准备好画布 */
  begin: (l: Layout) => Promise<void>
  rect: (color: string, x: number, y: number, w: number, h: number) => void
  text: (color: string, s: string, x: number, y: number) => void
  /** 提交绘制 */
  end: () => Promise<void>
}

// #ifdef H5
/**
 * H5：在离屏原生 canvas 上绘制后转成图片显示。
 * 不用 uni 的 canvas 组件：它在样式尺寸变化后要等尺寸监听触发才调整绘图缓冲区，
 * 页面在后台等情况下可能迟迟不触发，导致新增区域（如备注文字）画不出来。
 */
const EXPORT_SCALE = 3 // 按 3 倍分辨率生成，保存后的图片依然清晰
const FONT_FAMILY = `-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif`
const imageUrl = ref('')
const h5Canvas = document.createElement('canvas')

function createH5Painter(): Painter {
  const ctx = h5Canvas.getContext('2d')!
  return {
    setFont: px => (ctx.font = `${px}px ${FONT_FAMILY}`),
    measure: s => ctx.measureText(s).width,
    async begin(l) {
      const font = ctx.font
      h5Canvas.width = l.width * EXPORT_SCALE
      h5Canvas.height = l.height * EXPORT_SCALE
      // 修改尺寸会重置上下文状态，重新设置缩放与字体
      ctx.setTransform(EXPORT_SCALE, 0, 0, EXPORT_SCALE, 0, 0)
      ctx.font = font
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      layout.value = l
    },
    rect(color, x, y, w, h) {
      ctx.fillStyle = color
      ctx.fillRect(x, y, w, h)
    },
    text(color, str, x, y) {
      ctx.fillStyle = color
      ctx.fillText(str, x, y)
    },
    async end() {
      imageUrl.value = h5Canvas.toDataURL('image/png')
    },
  }
}
// #endif

// #ifndef H5
function createMpPainter(): Painter {
  const ctx = uni.createCanvasContext(CANVAS_ID, instance?.proxy)
  return {
    setFont: px => ctx.setFontSize(px),
    measure: s => ctx.measureText(s).width,
    async begin(l) {
      const resized = layout.value?.width !== l.width || layout.value?.height !== l.height
      layout.value = l
      // 尺寸变化后等 canvas 调整完成再绘制
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
    text(color, str, x, y) {
      ctx.setFillStyle(color)
      ctx.fillText(str, x, y)
    },
    // draw 的回调在个别情况下不触发，设置超时避免阻塞后续绘制
    end: () => Promise.race([new Promise<void>(resolve => ctx.draw(false, () => resolve())), sleep(500)]),
  }
}
// #endif

/** 自行按模块绘制：二维码与备注画在同一张画布上，保存的图片里也带备注 */
async function draw() {
  error.value = ''
  if (!text.value)
    return
  const qr = new UQRCode()
  qr.data = text.value
  qr.errorCorrectLevel = UQRCode.errorCorrectLevel[level.value]
  try {
    qr.make()
  }
  catch {
    error.value = '内容过长，无法生成二维码，请缩短内容或降低容错率'
    return
  }
  const count: number = qr.moduleCount
  let p!: Painter
  // #ifdef H5
  p = createH5Painter()
  // #endif
  // #ifndef H5
  p = createMpPainter()
  // #endif

  // 先测量备注文字并折行（文字区域与二维码同宽），再计算整体布局
  p.setFont(fontSize.value)
  const lines = wrapText(note.value, size.value, p.measure, NOTE_MAX_LINES)
  const l = computeLayout({ size: size.value, moduleCount: count, lines: lines.length, fontSize: fontSize.value, position: notePosition.value })
  await p.begin(l)

  p.rect(bg.value, 0, 0, l.width, l.height)
  for (let r = 0; r < count; r++) {
    // 同一行连续的深色模块合并成一个矩形，减少绘制次数
    let c = 0
    while (c < count) {
      if (!qr.isBlack(r, c)) {
        c++
        continue
      }
      const start = c
      while (c < count && qr.isBlack(r, c))
        c++
      p.rect(fg.value, l.qrX + start * l.cell, l.qrY + r * l.cell, (c - start) * l.cell, l.cell)
    }
  }
  p.setFont(fontSize.value)
  lines.forEach((line, i) => p.text(fg.value, line, l.width / 2, l.textY + i * l.lineHeight))
  await p.end()
}

onReady(() => {
  requestDraw()
})
watch([text, note, size, level, fg, bg, notePosition, fontSize], scheduleDraw)

async function save() {
  if (!text.value || error.value)
    return
  // 等待正在进行的绘制完成，保证导出的是最新内容
  clearTimeout(timer)
  await requestDraw()
  // #ifdef H5
  const a = document.createElement('a')
  a.href = imageUrl.value
  a.download = fileNameOf(note.value)
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
</script>

<template>
  <ot-tool-layout>
    <view class="flex flex-col gap-3 md:flex-row">
      <view class="min-w-0 flex flex-1 flex-col gap-3">
        <ot-panel title="内容">
          <template #extra>
            <text class="text-12px text-muted">{{ text.length }} 字</text>
          </template>
          <ot-textarea v-model="text" :height="110" :mono="false" placeholder="输入文本或网址" />
        </ot-panel>

        <ot-panel title="文字备注">
          <template #extra>
            <text class="text-12px" :class="note.length >= NOTE_MAX ? 'text-red-500' : 'text-muted'">{{ note.length }}/{{ NOTE_MAX }}</text>
          </template>
          <view class="ot-qr__note">
            <textarea
              v-model="note" class="ot-qr__note-input" :maxlength="NOTE_MAX"
              placeholder="可选，会显示在二维码旁并一起保存，如「扫码关注公众号」"
              placeholder-class="ot-qr__placeholder" auto-height
            />
            <view v-if="note" class="i-carbon-close-filled shrink-0 cursor-pointer text-16px text-muted" @click="note = ''" />
          </view>
          <view class="mt-3 flex flex-col gap-3 text-13px text-sub">
            <view class="flex items-center gap-3">
              <text class="w-60px shrink-0">位置</text>
              <ot-segmented v-model="notePosition" :options="positionOptions" size="small" />
            </view>
            <view class="flex items-center gap-3">
              <text class="w-60px shrink-0">字号</text>
              <ot-segmented v-model="fontSize" :options="fontOptions" size="small" />
            </view>
          </view>
          <view class="mt-2 text-12px text-muted">
            文字颜色与二维码颜色一致，最多显示 {{ NOTE_MAX_LINES }} 行，可手动换行
          </view>
        </ot-panel>

        <ot-panel title="样式">
          <view class="flex flex-col gap-3 text-13px text-sub">
            <view class="flex items-center gap-3">
              <text class="w-60px shrink-0">尺寸</text>
              <ot-segmented v-model="size" :options="sizeOptions" size="small" />
            </view>
            <view class="flex items-center gap-3">
              <text class="w-60px shrink-0">容错率</text>
              <ot-segmented v-model="level" :options="levelOptions" size="small" />
            </view>
            <view class="flex items-center gap-3">
              <text class="w-60px shrink-0">颜色</text>
              <view
                v-for="c in FG_PRESETS" :key="c"
                class="ot-dot" :class="{ 'is-active': fg === c }" :style="{ background: c }"
                @click="fg = c"
              />
            </view>
            <view class="flex items-center gap-3">
              <text class="w-60px shrink-0">背景</text>
              <view
                v-for="c in BG_PRESETS" :key="c"
                class="ot-dot" :class="{ 'is-active': bg === c }" :style="{ background: c }"
                @click="bg = c"
              />
            </view>
          </view>
        </ot-panel>
      </view>

      <ot-panel title="预览" class="md:w-360px">
        <view class="flex flex-col items-center">
          <view v-if="error" class="ot-qr__error">
            <view class="i-carbon-warning-filled shrink-0 text-15px" />
            <text>{{ error }}</text>
          </view>
          <view v-else-if="!text" class="py-10 text-13px text-muted">
            请输入内容
          </view>
          <view v-show="text && !error" class="ot-qr__frame">
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
          </view>
          <view class="mt-4 w-full">
            <wd-button block :disabled="!text || !!error" @click="save">
              保存图片
            </wd-button>
          </view>
          <view class="mt-2 text-12px text-muted">
            <!-- #ifdef H5 -->
            保存为 PNG，包含文字备注
            <!-- #endif -->
            <!-- #ifndef H5 -->
            保存到相册，包含文字备注
            <!-- #endif -->
          </view>
        </view>
      </ot-panel>
    </view>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-dot {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  box-sizing: border-box;
  border: 2px solid transparent;
  box-shadow: 0 0 0 1px var(--ot-border);

  &.is-active {
    border-color: var(--ot-card);
    box-shadow: 0 0 0 2px var(--wot-color-theme);
  }
}

.ot-qr__note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--ot-fill);
}

.ot-qr__note-input {
  flex: 1;
  width: 100%;
  min-height: 44px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--ot-text);
}

:deep(.ot-qr__placeholder) {
  color: var(--ot-text-3);
}

.ot-qr__frame {
  max-width: 100%;
  overflow: auto;
  border-radius: 12px;
  border: 1px solid var(--ot-border);
  line-height: 0;
}

.ot-qr__error {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: #dc2626;
  background: rgba(239, 68, 68, 0.08);
}
</style>
