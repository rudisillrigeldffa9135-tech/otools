<script lang="ts" setup>
import type { PaletteItem, Pixels, RGBA } from './color'
import { copyText, toast } from '@/utils/common'
import { extractPalette, fitSize, isLight, pickColor, toHex, toHsl, toRgb } from './color'

definePage({
  style: { navigationBarTitleText: '图片取色' },
})

/** 解码时的最长边，兼顾取色精度与性能 */
const MAX_SIDE = 1200
/** 小程序离屏 canvas 的 id，与模板保持一致 */
const CANVAS_ID = 'ot-imgcolor-canvas'

const instance = getCurrentInstance()

const src = ref('')
const pixels = shallowRef<Pixels>()
const loading = ref(false)
const palette = ref<PaletteItem[]>([])
/** 当前取色点（解码后像素坐标），从主色调选择时为空 */
const point = ref<{ x: number, y: number }>()
const current = ref<RGBA>()
const history = ref<string[]>([])

const radiusOptions = [
  { value: 0, label: '单像素' },
  { value: 1, label: '3×3 平均' },
  { value: 2, label: '5×5 平均' },
]
const radius = ref(0)

const formats = computed(() => {
  const c = current.value
  return c ? [{ label: 'HEX', value: toHex(c) }, { label: 'RGB', value: toRgb(c) }, { label: 'HSL', value: toHsl(c) }] : []
})

/* ---------------- 读取像素（平台差异） ---------------- */

function decode(path: string): Promise<Pixels> {
  return new Promise((resolve, reject) => {
    // #ifdef H5
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const { width, height } = fitSize(img.naturalWidth, img.naturalHeight, MAX_SIDE)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0, width, height)
      resolve({ width, height, data: ctx.getImageData(0, 0, width, height).data })
    }
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = path
    // #endif

    // #ifdef MP-WEIXIN
    uni.createSelectorQuery()
      .in(instance?.proxy)
      .select(`#${CANVAS_ID}`)
      .fields({ node: true, size: true }, () => {})
      .exec((res) => {
        const canvas = res?.[0]?.node
        if (!canvas)
          return reject(new Error('canvas 初始化失败'))
        const img = canvas.createImage()
        img.onload = () => {
          const { width, height } = fitSize(img.width, img.height, MAX_SIDE)
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.clearRect(0, 0, width, height)
          ctx.drawImage(img, 0, 0, width, height)
          resolve({ width, height, data: ctx.getImageData(0, 0, width, height).data })
        }
        img.onerror = () => reject(new Error('图片加载失败'))
        img.src = path
      })
    // #endif
  })
}

/* ---------------- 加载图片 ---------------- */

async function loadImage(path: string) {
  loading.value = true
  try {
    const px = await decode(path)
    src.value = path
    pixels.value = px
    palette.value = extractPalette(px)
    // 默认选中图片中心
    point.value = { x: Math.floor(px.width / 2), y: Math.floor(px.height / 2) }
    current.value = pickColor(px, point.value.x, point.value.y, radius.value)
  }
  catch (e: any) {
    toast(e?.message || '图片加载失败')
  }
  finally {
    loading.value = false
  }
}

function chooseImage() {
  uni.chooseImage({
    count: 1,
    sizeType: ['original'],
    success: res => loadImage(res.tempFilePaths[0]),
  })
}

// #ifdef H5
// H5 额外支持：Ctrl+V 粘贴截图、把图片拖到页面任意位置
let objectUrl = ''
function loadFile(file?: File | null) {
  if (!file)
    return
  if (!file.type.startsWith('image/')) {
    toast('请选择图片文件')
    return
  }
  if (objectUrl)
    URL.revokeObjectURL(objectUrl)
  objectUrl = URL.createObjectURL(file)
  loadImage(objectUrl)
}

function onPaste(e: ClipboardEvent) {
  const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'))
  if (item)
    loadFile(item.getAsFile())
}

/** 是否正在把文件拖到页面上，用于显示遮罩 */
const dragging = ref(false)
// dragenter / dragleave 会在子元素间反复触发，用计数判断是否真正离开页面
let dragDepth = 0
const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files')

function onDragEnter(e: DragEvent) {
  if (!hasFiles(e))
    return
  e.preventDefault()
  dragDepth++
  dragging.value = true
}

function onDragOver(e: DragEvent) {
  if (!hasFiles(e))
    return
  // 必须阻止默认行为，否则浏览器会直接打开图片
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'copy'
}

function onDragLeave(e: DragEvent) {
  if (!hasFiles(e))
    return
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth)
    dragging.value = false
}

function onDrop(e: DragEvent) {
  if (!hasFiles(e))
    return
  e.preventDefault()
  dragDepth = 0
  dragging.value = false
  const files = Array.from(e.dataTransfer?.files || [])
  // 拖入多个文件时取第一张图片
  loadFile(files.find(f => f.type.startsWith('image/')) || files[0])
}

const listeners = [
  ['paste', onPaste],
  ['dragenter', onDragEnter],
  ['dragover', onDragOver],
  ['dragleave', onDragLeave],
  ['drop', onDrop],
] as [string, EventListener][]

// H5 跳转到其他页面时本页仍在页面栈中，用 onShow / onHide 而不是挂载 / 卸载，
// 避免在其他页面粘贴或拖拽时被本页拦截
function bindListeners(bind: boolean) {
  for (const [type, fn] of listeners)
    bind ? document.addEventListener(type, fn) : document.removeEventListener(type, fn)
  if (!bind) {
    dragDepth = 0
    dragging.value = false
  }
}
onShow(() => bindListeners(true))
onHide(() => bindListeners(false))
onUnload(() => {
  bindListeners(false)
  if (objectUrl)
    URL.revokeObjectURL(objectUrl)
})
// #endif

/* ---------------- 取色 ---------------- */

function pickAt(x: number, y: number) {
  const px = pixels.value
  if (!px)
    return
  point.value = { x: Math.min(px.width - 1, Math.max(0, x)), y: Math.min(px.height - 1, Math.max(0, y)) }
  current.value = pickColor(px, point.value.x, point.value.y, radius.value)
}

/** 点击位置（视口坐标）换算到像素坐标：H5 与小程序的 touches.clientX/Y 和 boundingClientRect 同为视口坐标 */
function onTapImage(e: any) {
  const touch = e?.changedTouches?.[0] || e?.touches?.[0]
  const px = pixels.value
  if (!touch || !px)
    return
  uni.createSelectorQuery()
    .in(instance?.proxy)
    .select('.ot-imgcolor__img')
    .boundingClientRect((rect) => {
      const r = rect as UniApp.NodeInfo
      if (!r?.width || !r?.height)
        return
      pickAt(
        Math.floor(((touch.clientX - r.left!) / r.width) * px.width),
        Math.floor(((touch.clientY - r.top!) / r.height) * px.height),
      )
    })
    .exec()
}

/** 微调取色点，手机上手指点不准时用 */
function nudge(dx: number, dy: number) {
  if (point.value)
    pickAt(point.value.x + dx, point.value.y + dy)
}

watch(radius, () => point.value && pickAt(point.value.x, point.value.y))

function selectColor(color: RGBA) {
  point.value = undefined
  current.value = color
}

function saveCurrent() {
  if (!current.value)
    return
  const hex = toHex(current.value)
  history.value = [hex, ...history.value.filter(h => h !== hex)].slice(0, 16)
  copyText(hex)
}

const markerStyle = computed(() => {
  const px = pixels.value
  if (!px || !point.value)
    return {}
  return {
    left: `${((point.value.x + 0.5) / px.width) * 100}%`,
    top: `${((point.value.y + 0.5) / px.height) * 100}%`,
    backgroundColor: current.value ? toHex(current.value) : 'transparent',
  }
})
</script>

<template>
  <ot-tool-layout>
    <ot-panel title="图片">
      <template v-if="src" #extra>
        <wd-button size="small" type="info" plain @click="chooseImage">
          更换图片
        </wd-button>
      </template>

      <view v-if="!src" class="ot-imgcolor__empty" @click="chooseImage">
        <view class="i-carbon-image text-36px text-muted" />
        <text class="text-14px text-main">{{ loading ? '读取中…' : '点击选择图片' }}</text>
        <!-- #ifdef H5 -->
        <text class="text-12px text-muted">也可以把图片拖到这里，或直接 Ctrl + V 粘贴截图</text>
        <!-- #endif -->
      </view>

      <template v-else>
        <view class="ot-imgcolor__stage">
          <image :src="src" mode="widthFix" class="ot-imgcolor__img" @tap="onTapImage" />
          <view v-if="point" class="ot-imgcolor__marker" :style="markerStyle" />
        </view>
        <view class="mt-3 flex flex-wrap items-center justify-between gap-2">
          <ot-segmented v-model="radius" :options="radiusOptions" size="small" />
          <view v-if="point" class="flex items-center gap-1">
            <text class="mr-1 text-12px text-muted">{{ point.x }}, {{ point.y }}</text>
            <view class="i-carbon-arrow-left ot-imgcolor__nudge" @click="nudge(-1, 0)" />
            <view class="i-carbon-arrow-up ot-imgcolor__nudge" @click="nudge(0, -1)" />
            <view class="i-carbon-arrow-down ot-imgcolor__nudge" @click="nudge(0, 1)" />
            <view class="i-carbon-arrow-right ot-imgcolor__nudge" @click="nudge(1, 0)" />
          </view>
        </view>
        <view class="mt-2 text-12px text-muted">
          点击图片任意位置取色，方向键可逐像素微调
          <!-- #ifdef H5 -->
          ；拖入或粘贴新图片可直接替换
          <!-- #endif -->
        </view>
      </template>
    </ot-panel>

    <ot-panel v-if="current" title="当前颜色">
      <template #extra>
        <wd-button size="small" @click="saveCurrent">
          复制并记录
        </wd-button>
      </template>
      <view
        class="ot-imgcolor__swatch" :style="{ backgroundColor: toHex(current), color: isLight(current) ? '#1d2129' : '#fff' }"
        @click="copyText(toHex(current))"
      >
        {{ toHex(current) }}
      </view>
      <ot-result v-for="f in formats" :key="f.label" :label="f.label" :value="f.value" />
    </ot-panel>

    <ot-panel v-if="palette.length" title="主色调">
      <view class="ot-imgcolor__palette">
        <view v-for="(p, i) in palette" :key="i" class="ot-imgcolor__chip" @click="selectColor(p.color)">
          <view class="ot-imgcolor__chip-color" :style="{ backgroundColor: toHex(p.color) }" />
          <view class="ot-mono text-12px text-main">
            {{ toHex(p.color) }}
          </view>
          <view class="text-11px text-muted">
            {{ (p.ratio * 100).toFixed(1) }}%
          </view>
        </view>
      </view>
    </ot-panel>

    <ot-panel v-if="history.length" title="取色记录">
      <template #extra>
        <wd-button size="small" type="info" plain @click="history = []">
          清空
        </wd-button>
      </template>
      <view class="flex flex-wrap gap-2">
        <view v-for="hex in history" :key="hex" class="ot-imgcolor__history" @click="copyText(hex)">
          <view class="h-14px w-14px rounded" :style="{ backgroundColor: hex }" />
          <text class="ot-mono text-12px text-main">{{ hex }}</text>
        </view>
      </view>
    </ot-panel>

    <!-- #ifdef H5 -->
    <view v-if="dragging" class="ot-imgcolor__drop">
      <view class="ot-imgcolor__drop-inner">
        <view class="i-carbon-image text-40px" />
        <text class="text-16px font-500">松开即可加载图片</text>
      </view>
    </view>
    <!-- #endif -->

    <!-- #ifdef MP-WEIXIN -->
    <!-- 小程序读取像素用的离屏 canvas，绘制尺寸由代码设置，与这里的样式尺寸无关 -->
    <canvas id="ot-imgcolor-canvas" type="2d" class="ot-imgcolor__canvas" />
    <!-- #endif -->
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-imgcolor__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 180px;
  border: 1px dashed var(--ot-border);
  border-radius: 12px;
  background: var(--ot-fill);
  cursor: pointer;
}

.ot-imgcolor__stage {
  position: relative;
  overflow: hidden;
  border-radius: 10px;
  // 棋盘格背景，便于看出透明区域
  background-color: #fff;
  background-image:
    linear-gradient(45deg, #e5e6eb 25%, transparent 25%), linear-gradient(-45deg, #e5e6eb 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e5e6eb 75%), linear-gradient(-45deg, transparent 75%, #e5e6eb 75%);
  background-size: 16px 16px;
  background-position:
    0 0,
    0 8px,
    8px -8px,
    -8px 0;
}

.ot-imgcolor__img {
  display: block;
  width: 100%;
  cursor: crosshair;
}

.ot-imgcolor__marker {
  position: absolute;
  width: 18px;
  height: 18px;
  margin: -11px 0 0 -11px;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.45),
    0 2px 6px rgba(0, 0, 0, 0.3);
  pointer-events: none;
}

.ot-imgcolor__nudge {
  padding: 6px;
  font-size: 15px;
  border-radius: 6px;
  color: var(--ot-text-2);
  background: var(--ot-fill);
  cursor: pointer;
}

.ot-imgcolor__swatch {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 72px;
  margin-bottom: 10px;
  border-radius: 10px;
  border: 1px solid var(--ot-border);
  font-family: var(--ot-font-mono);
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
}

.ot-imgcolor__palette {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

@media (min-width: 640px) {
  .ot-imgcolor__palette {
    grid-template-columns: repeat(8, minmax(0, 1fr));
  }
}

.ot-imgcolor__chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.ot-imgcolor__chip-color {
  width: 100%;
  height: 44px;
  border-radius: 8px;
  border: 1px solid var(--ot-border);
}

.ot-imgcolor__history {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--ot-fill);
  cursor: pointer;
}

/* #ifdef H5 */
.ot-imgcolor__drop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  padding: 16px;
  background: color-mix(in srgb, var(--ot-bg) 75%, transparent);
  backdrop-filter: blur(2px);
  // 遮罩不接收事件，避免干扰 dragleave 计数
  pointer-events: none;
}

.ot-imgcolor__drop-inner {
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 2px dashed var(--wot-color-theme);
  border-radius: 16px;
  color: var(--wot-color-theme);
}
/* #endif */

.ot-imgcolor__canvas {
  position: fixed;
  left: -9999px;
  top: 0;
  width: 1px;
  height: 1px;
}
</style>
