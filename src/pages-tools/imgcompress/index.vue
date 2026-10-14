<script lang="ts" setup>
import type { OutputFormat, ResizeMode } from './resize'
import { toast } from '@/utils/common'
import { changePercent, formatBytes, MIME, outputName, resolveFormat, targetSize } from './resize'

definePage({
  style: { navigationBarTitleText: '图片压缩' },
})

const MAX_FILES = 20
/** 输出最长边上限，小程序 canvas 的上限更低 */
let MAX_SIDE = 8000
// #ifndef H5
MAX_SIDE = 4096
// #endif
const CANVAS_ID = 'ot-imgcompress-canvas'
const instance = getCurrentInstance()

interface Item {
  id: number
  name: string
  /** 原图地址：H5 为 blob URL，小程序为临时文件路径 */
  src: string
  type: string
  size: number
  width: number
  height: number
  status: 'pending' | 'processing' | 'done' | 'error'
  outUrl?: string
  outSize?: number
  outWidth?: number
  outHeight?: number
  outFormat?: Exclude<OutputFormat, 'auto'>
  error?: string
}

const items = ref<Item[]>([])
let seq = 0

/* ---------------- 设置 ---------------- */

const format = ref<OutputFormat>('auto')
const formatOptions = [
  { value: 'auto', label: '原格式' },
  { value: 'jpeg', label: 'JPG' },
  { value: 'png', label: 'PNG' },
]
// 小程序 canvas 只能导出 JPG / PNG
// #ifdef H5
formatOptions.push({ value: 'webp', label: 'WebP' })
// #endif
const quality = ref(80)
const resizeMode = ref<ResizeMode>('original')
const resizeOptions = [
  { value: 'original', label: '原尺寸' },
  { value: 'scale', label: '按比例' },
  { value: 'fit', label: '限制宽高' },
]
const scale = ref(50)
const maxWidth = ref(1920)
const maxHeight = ref(0)

/** PNG 是无损格式，质量参数无效 */
const qualityApplies = computed(() => format.value !== 'png')

const summary = computed(() => {
  const done = items.value.filter(i => i.status === 'done')
  const before = done.reduce((s, i) => s + i.size, 0)
  const after = done.reduce((s, i) => s + (i.outSize || 0), 0)
  return { count: done.length, before, after }
})
const processing = computed(() => items.value.some(i => i.status === 'pending' || i.status === 'processing'))

/* ---------------- 读取与处理（平台差异） ---------------- */

// #ifdef H5
function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片无法解码'))
    img.src = src
  })
}

const objectUrls = new Set<string>()
function trackUrl(url: string) {
  objectUrls.add(url)
  return url
}
function revokeUrl(url?: string) {
  if (url && objectUrls.has(url)) {
    URL.revokeObjectURL(url)
    objectUrls.delete(url)
  }
}

async function addFilesH5(files: { name?: string, size: number, type?: string, path?: string, file?: File }[]) {
  const room = MAX_FILES - items.value.length
  if (room <= 0)
    return toast(`最多同时处理 ${MAX_FILES} 张`)
  if (files.length > room)
    toast(`最多同时处理 ${MAX_FILES} 张，已忽略多余的图片`)
  for (const f of files.slice(0, room)) {
    const src = f.file ? trackUrl(URL.createObjectURL(f.file)) : f.path!
    try {
      const img = await loadImage(src)
      items.value.push({
        id: ++seq,
        name: f.name || f.file?.name || `image-${seq}`,
        src,
        type: f.type || f.file?.type || '',
        size: f.size,
        width: img.naturalWidth,
        height: img.naturalHeight,
        status: 'pending',
      })
    }
    catch {
      toast(`${f.name || '图片'} 无法读取`)
    }
  }
  scheduleProcess()
}

async function processItemH5(item: Item) {
  const fmt = resolveFormat(format.value, item.name, item.type)
  const img = await loadImage(item.src)
  const { width, height } = targetSize(img.naturalWidth, img.naturalHeight, { mode: resizeMode.value, scale: scale.value, maxWidth: maxWidth.value, maxHeight: maxHeight.value }, MAX_SIDE)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  // JPG 不支持透明，透明区域铺白底，否则会变成黑色
  if (fmt === 'jpeg') {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
  }
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, MIME[fmt], quality.value / 100))
  if (!blob)
    throw new Error('导出失败')
  // 部分浏览器（如旧版 Safari）不支持导出 WebP，会退回 PNG
  const actual = (Object.keys(MIME) as (keyof typeof MIME)[]).find(k => MIME[k] === blob.type) || fmt
  revokeUrl(item.outUrl)
  Object.assign(item, { outUrl: trackUrl(URL.createObjectURL(blob)), outSize: blob.size, outWidth: width, outHeight: height, outFormat: actual })
}

function downloadH5(item: Item) {
  if (!item.outUrl || !item.outFormat)
    return
  const a = document.createElement('a')
  a.href = item.outUrl
  a.download = outputName(item.name, item.outFormat)
  a.click()
}

/* 粘贴截图、拖拽图片到页面任意位置 */
const dragging = ref(false)
let dragDepth = 0
const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files')
const imageFiles = (list?: FileList | null) => Array.from(list || []).filter(f => f.type.startsWith('image/'))

function onPaste(e: ClipboardEvent) {
  const files = Array.from(e.clipboardData?.items || []).filter(i => i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean) as File[]
  if (files.length)
    addFilesH5(files.map(file => ({ file, size: file.size })))
}
function onDragEnter(e: DragEvent) {
  if (!hasFiles(e))
    return
  e.preventDefault()
  dragDepth++
  dragging.value = true
}
function onDragOver(e: DragEvent) {
  if (hasFiles(e)) {
    e.preventDefault()
    e.dataTransfer!.dropEffect = 'copy'
  }
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
  const files = imageFiles(e.dataTransfer?.files)
  if (!files.length)
    return toast('请拖入图片文件')
  addFilesH5(files.map(file => ({ file, size: file.size })))
}
const listeners = [['paste', onPaste], ['dragenter', onDragEnter], ['dragover', onDragOver], ['dragleave', onDragLeave], ['drop', onDrop]] as [string, EventListener][]
// 页面在后台时（跳到其他页面）不拦截粘贴与拖拽
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
  objectUrls.forEach(u => URL.revokeObjectURL(u))
  objectUrls.clear()
})
// #endif

// #ifndef H5
function getCanvas(): Promise<any> {
  return new Promise((resolve, reject) => {
    uni.createSelectorQuery().in(instance?.proxy).select(`#${CANVAS_ID}`).fields({ node: true, size: true }, () => {}).exec((res) => {
      const canvas = res?.[0]?.node
      canvas ? resolve(canvas) : reject(new Error('canvas 初始化失败'))
    })
  })
}

function getImageInfo(src: string) {
  return new Promise<UniApp.GetImageInfoSuccessData>((resolve, reject) => uni.getImageInfo({ src, success: resolve, fail: () => reject(new Error('图片无法读取')) }))
}

function getFileSize(filePath: string) {
  return new Promise<number>(resolve => uni.getFileInfo({ filePath, success: r => resolve(r.size), fail: () => resolve(0) }))
}

async function addFilesMp(files: { path: string, size: number }[]) {
  const room = MAX_FILES - items.value.length
  if (room <= 0)
    return toast(`最多同时处理 ${MAX_FILES} 张`)
  for (const f of files.slice(0, room)) {
    try {
      const info = await getImageInfo(f.path)
      items.value.push({
        id: ++seq,
        name: f.path.split('/').pop() || `image-${seq}`,
        src: f.path,
        type: info.type ? `image/${info.type}` : '',
        size: f.size,
        width: info.width,
        height: info.height,
        status: 'pending',
      })
    }
    catch {
      toast('有图片无法读取')
    }
  }
  scheduleProcess()
}

async function processItemMp(item: Item) {
  const fmt = resolveFormat(format.value, item.name, item.type)
  const { width, height } = targetSize(item.width, item.height, { mode: resizeMode.value, scale: scale.value, maxWidth: maxWidth.value, maxHeight: maxHeight.value }, MAX_SIDE)
  const canvas = await getCanvas()
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const img = canvas.createImage()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('图片无法解码'))
    img.src = item.src
  })
  ctx.clearRect(0, 0, width, height)
  if (fmt !== 'png') {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
  }
  ctx.drawImage(img, 0, 0, width, height)
  const path = await new Promise<string>((resolve, reject) => {
    uni.canvasToTempFilePath({
      canvas,
      fileType: fmt === 'png' ? 'png' : 'jpg',
      quality: quality.value / 100,
      destWidth: width,
      destHeight: height,
      success: r => resolve(r.tempFilePath),
      fail: () => reject(new Error('导出失败')),
    } as any, instance?.proxy)
  })
  Object.assign(item, { outUrl: path, outSize: await getFileSize(path), outWidth: width, outHeight: height, outFormat: fmt === 'png' ? 'png' : 'jpeg' })
}

function downloadMp(item: Item) {
  if (!item.outUrl)
    return
  uni.saveImageToPhotosAlbum({
    filePath: item.outUrl,
    success: () => toast('已保存到相册', 'success'),
    fail: () => toast('保存失败，请检查相册权限'),
  })
}
// #endif

/* ---------------- 平台无关的入口 ---------------- */

function chooseImages() {
  uni.chooseImage({
    count: MAX_FILES,
    sizeType: ['original'],
    success: (res) => {
      const files = (res.tempFiles as any[]).map(f => ({ name: f.name, size: f.size, type: f.type, path: f.path }))
      // #ifdef H5
      addFilesH5(files)
      // #endif
      // #ifndef H5
      addFilesMp(files)
      // #endif
    },
  })
}

function processItem(item: Item) {
  // #ifdef H5
  return processItemH5(item)
  // #endif
  // #ifndef H5

  return processItemMp(item)
  // #endif
}

function download(item: Item) {
  // #ifdef H5
  downloadH5(item)
  // #endif
  // #ifndef H5
  downloadMp(item)
  // #endif
}

/* ---------------- 处理队列 ---------------- */

let running = false
let rerun = false

/** 逐张处理，避免同时解码多张大图占满内存；处理中途设置变化会在本轮结束后重跑 */
async function runQueue() {
  if (running) {
    rerun = true
    return
  }
  running = true
  do {
    rerun = false
    for (const item of items.value) {
      if (item.status !== 'pending')
        continue
      item.status = 'processing'
      try {
        await processItem(item)
        item.status = 'done'
        item.error = undefined
      }
      catch (e: any) {
        item.status = 'error'
        item.error = e?.message || '处理失败'
      }
    }
  } while (rerun || items.value.some(i => i.status === 'pending'))
  running = false
}

let timer: ReturnType<typeof setTimeout> | undefined
function scheduleProcess() {
  clearTimeout(timer)
  timer = setTimeout(runQueue, 50)
}

/** 设置变化后全部重新处理 */
watch([format, quality, resizeMode, scale, maxWidth, maxHeight], () => {
  items.value.forEach(i => (i.status = 'pending'))
  clearTimeout(timer)
  timer = setTimeout(runQueue, 300)
})

function remove(item: Item) {
  items.value = items.value.filter(i => i.id !== item.id)
  // #ifdef H5
  revokeUrl(item.src)
  revokeUrl(item.outUrl)
  // #endif
}

function clearAll() {
  items.value.forEach(remove)
}

async function downloadAll() {
  for (const item of items.value.filter(i => i.status === 'done')) {
    download(item)
    // 连续触发下载时留一点间隔，避免被浏览器拦截
    await new Promise(r => setTimeout(r, 400))
  }
}

function preview(item: Item) {
  if (item.outUrl)
    uni.previewImage({ urls: [item.outUrl] })
}

function percentClass(item: Item) {
  return (item.outSize || 0) > item.size ? 'is-bigger' : 'is-smaller'
}
</script>

<template>
  <ot-tool-layout>
    <ot-panel title="设置">
      <view class="flex flex-col gap-3 text-13px text-sub">
        <view class="ot-ic__row">
          <text class="ot-ic__label">输出格式</text>
          <ot-segmented v-model="format" :options="formatOptions" size="small" />
        </view>
        <view class="ot-ic__row">
          <text class="ot-ic__label">质量</text>
          <view class="min-w-0 flex-1">
            <ot-slider v-model="quality" :min="10" :max="100" :step="5" :disabled="!qualityApplies" />
          </view>
          <text class="ot-mono w-36px text-right">{{ quality }}</text>
        </view>
        <view v-if="!qualityApplies" class="text-12px text-muted -mt-2">
          PNG 为无损格式，质量设置无效；想明显减小体积请改用 JPG / WebP 或缩小尺寸
        </view>
        <view class="ot-ic__row">
          <text class="ot-ic__label">尺寸</text>
          <ot-segmented v-model="resizeMode" :options="resizeOptions" size="small" />
        </view>
        <view v-if="resizeMode === 'scale'" class="ot-ic__row">
          <text class="ot-ic__label">缩放到</text>
          <view class="min-w-0 flex-1">
            <ot-slider v-model="scale" :min="5" :max="100" :step="5" />
          </view>
          <text class="ot-mono w-36px text-right">{{ scale }}%</text>
        </view>
        <view v-if="resizeMode === 'fit'" class="ot-ic__row">
          <text class="ot-ic__label">最大宽高</text>
          <view class="ot-ic__num">
            <input v-model.number="maxWidth" type="number" class="min-w-0 flex-1 text-center" placeholder="不限">
          </view>
          <text class="text-muted">×</text>
          <view class="ot-ic__num">
            <input v-model.number="maxHeight" type="number" class="min-w-0 flex-1 text-center" placeholder="不限">
          </view>
          <text class="text-12px text-muted">px，0 为不限</text>
        </view>
      </view>
    </ot-panel>

    <ot-panel :title="`图片 · ${items.length}`">
      <template #extra>
        <template v-if="items.length">
          <wd-button size="small" type="info" plain @click="clearAll">
            清空
          </wd-button>
          <wd-button size="small" type="info" plain :disabled="processing || !summary.count" @click="downloadAll">
            <!-- #ifdef H5 -->
            全部下载
            <!-- #endif -->
            <!-- #ifndef H5 -->
            全部保存
            <!-- #endif -->
          </wd-button>
        </template>
        <wd-button size="small" icon="add" :disabled="items.length >= MAX_FILES" @click="chooseImages">
          添加
        </wd-button>
      </template>

      <view v-if="!items.length" class="ot-ic__empty" @click="chooseImages">
        <view class="i-carbon-image-copy text-36px text-muted" />
        <text class="text-14px text-main">点击选择图片（最多 {{ MAX_FILES }} 张）</text>
        <!-- #ifdef H5 -->
        <text class="text-12px text-muted">也可以把图片拖到这里，或 Ctrl + V 粘贴截图</text>
        <!-- #endif -->
        <text class="text-12px text-muted">图片只在本地处理，不会上传</text>
      </view>

      <view v-if="summary.count" class="ot-ic__summary">
        已处理 {{ summary.count }} 张：{{ formatBytes(summary.before) }} → {{ formatBytes(summary.after) }}
        <text :class="summary.after > summary.before ? 'text-red-500' : 'text-emerald-600'" class="ml-1 font-600">
          {{ changePercent(summary.before, summary.after) }}
        </text>
      </view>

      <view v-for="item in items" :key="item.id" class="ot-ic__item">
        <image :src="item.outUrl || item.src" mode="aspectFill" class="ot-ic__thumb" @click="preview(item)" />
        <view class="min-w-0 flex-1">
          <view class="truncate text-14px text-main">
            {{ item.name }}
          </view>
          <view class="mt-1 text-12px text-muted">
            {{ item.width }}×{{ item.height }} · {{ formatBytes(item.size) }}
          </view>
          <view v-if="item.status === 'done'" class="mt-0.5 text-12px">
            <text class="text-muted">→ {{ item.outWidth }}×{{ item.outHeight }} · {{ item.outFormat?.toUpperCase() }} · </text>
            <text class="text-main font-500">{{ formatBytes(item.outSize || 0) }}</text>
            <text class="ot-ic__pct" :class="percentClass(item)">{{ changePercent(item.size, item.outSize || 0) }}</text>
          </view>
          <view v-else-if="item.status === 'error'" class="mt-0.5 text-12px text-red-500">
            {{ item.error }}
          </view>
          <view v-else class="mt-0.5 text-12px text-muted">
            处理中…
          </view>
          <view v-if="item.status === 'done' && (item.outSize || 0) > item.size" class="mt-0.5 text-12px text-[#b45309]">
            比原图更大，建议降低质量、改用其他格式或直接使用原图
          </view>
        </view>
        <view class="flex shrink-0 flex-col items-end gap-2">
          <wd-button size="small" :disabled="item.status !== 'done'" @click="download(item)">
            <!-- #ifdef H5 -->
            下载
            <!-- #endif -->
            <!-- #ifndef H5 -->
            保存
            <!-- #endif -->
          </wd-button>
          <view class="i-carbon-close cursor-pointer text-16px text-muted" @click="remove(item)" />
        </view>
      </view>
    </ot-panel>

    <!-- #ifdef H5 -->
    <view v-if="dragging" class="ot-ic__drop">
      <view class="ot-ic__drop-inner">
        <view class="i-carbon-image-copy text-40px" />
        <text class="text-16px font-500">松开即可添加图片</text>
      </view>
    </view>
    <!-- #endif -->

    <!-- #ifndef H5 -->
    <canvas id="ot-imgcompress-canvas" type="2d" class="ot-ic__canvas" />
    <!-- #endif -->
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-ic__row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ot-ic__label {
  flex-shrink: 0;
  width: 60px;
}

.ot-ic__num {
  display: flex;
  width: 76px;
  height: 32px;
  padding: 0 6px;
  border-radius: 8px;
  background: var(--ot-fill);
  color: var(--ot-text);
  align-items: center;
}

.ot-ic__empty {
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

.ot-ic__summary {
  margin-bottom: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: var(--ot-text);
  background: var(--ot-fill);
}

.ot-ic__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;

  & + & {
    border-top: 1px solid var(--ot-border);
  }
}

.ot-ic__thumb {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  border-radius: 10px;
  background: var(--ot-fill);
  cursor: zoom-in;
}

.ot-ic__pct {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 6px;
  font-size: 11px;

  &.is-smaller {
    color: #059669;
    background: rgba(16, 185, 129, 0.12);
  }

  &.is-bigger {
    color: #dc2626;
    background: rgba(239, 68, 68, 0.1);
  }
}

/* #ifdef H5 */
.ot-ic__drop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  padding: 16px;
  background: color-mix(in srgb, var(--ot-bg) 75%, transparent);
  backdrop-filter: blur(2px);
  pointer-events: none;
}

.ot-ic__drop-inner {
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

.ot-ic__canvas {
  position: fixed;
  left: -9999px;
  top: 0;
  width: 1px;
  height: 1px;
}
</style>
