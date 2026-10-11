<script lang="ts" setup>
import type { Analysis } from './content'
import { copyText, toast } from '@/utils/common'
import { analyze } from './content'
// #ifdef H5
import jsQR from 'jsqr'
// #endif

definePage({
  style: { navigationBarTitleText: '二维码识别' },
})

interface Item {
  id: number
  text: string
  /** 来源说明：文件名或「扫码」 */
  source: string
  /** H5 下的图片预览地址 */
  thumb?: string
  analysis: Analysis
}

const items = ref<Item[]>([])
const busy = ref(false)
let seq = 0

function addResult(text: string, source: string, thumb?: string) {
  items.value.unshift({ id: ++seq, text, source, thumb, analysis: analyze(text) })
  if (items.value.length > 20) {
    const removed = items.value.pop()
    // #ifdef H5
    revokeUrl(removed?.thumb)
    // #endif
  }
}

/* ---------------- H5：图片解码 ---------------- */

// #ifdef H5
const objectUrls = new Set<string>()
function revokeUrl(url?: string) {
  if (url && objectUrls.has(url)) {
    URL.revokeObjectURL(url)
    objectUrls.delete(url)
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片无法读取'))
    img.src = src
  })
}

/** 依次尝试几种尺寸：大图缩小后反而更容易识别，小图则保持原尺寸 */
function decodeImage(img: HTMLImageElement) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const longest = Math.max(img.naturalWidth, img.naturalHeight)
  const sides = [1600, 1000, 600, 2400].filter((s, i) => i === 0 || s < longest)
  for (const side of sides) {
    const ratio = Math.min(1, side / longest)
    canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio))
    // 透明背景的 PNG 二维码需要先铺白底
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })
    if (code?.data)
      return code.data
  }
  return null
}

async function decodeFiles(files: { name: string, url: string }[]) {
  busy.value = true
  let failed = 0
  for (const f of files) {
    try {
      const text = decodeImage(await loadImage(f.url))
      if (text === null) {
        failed++
        revokeUrl(f.url)
      }
      else {
        addResult(text, f.name, f.url)
      }
    }
    catch {
      failed++
      revokeUrl(f.url)
    }
  }
  busy.value = false
  if (failed)
    toast(files.length === 1 ? '没有识别到二维码' : `${failed} 张图片没有识别到二维码`)
}

function fromFiles(list: File[]) {
  const images = list.filter(f => f.type.startsWith('image/'))
  if (!images.length)
    return toast('请选择图片文件')
  decodeFiles(images.slice(0, 9).map((file) => {
    const url = URL.createObjectURL(file)
    objectUrls.add(url)
    return { name: file.name || '粘贴的图片', url }
  }))
}

const dragging = ref(false)
let dragDepth = 0
const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files')
function onPaste(e: ClipboardEvent) {
  const files = Array.from(e.clipboardData?.items || []).filter(i => i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean) as File[]
  if (files.length)
    fromFiles(files)
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
  fromFiles(Array.from(e.dataTransfer?.files || []))
}
const listeners = [['paste', onPaste], ['dragenter', onDragEnter], ['dragover', onDragOver], ['dragleave', onDragLeave], ['drop', onDrop]] as [string, EventListener][]
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

/* ---------------- 入口 ---------------- */

function chooseImage() {
  // #ifdef H5
  uni.chooseImage({
    count: 9,
    success: (res) => {
      const files = (res.tempFiles as any[]).map((f, i) => ({ name: f.name || `图片 ${i + 1}`, url: f.path as string }))
      decodeFiles(files)
    },
  })
  // #endif
  // #ifndef H5
  scan(false)
  // #endif
}

/** 小程序：调用微信扫码，支持相机与相册，也能识别条形码 */
function scan(onlyFromCamera: boolean) {
  uni.scanCode({
    onlyFromCamera,
    scanType: ['qrCode', 'barCode', 'datamatrix', 'pdf417'],
    success: res => addResult(res.result, res.scanType === 'QR_CODE' ? '扫码' : `扫码 · ${res.scanType}`),
    fail: (err: any) => {
      if (!/cancel/.test(err?.errMsg || ''))
        toast('没有识别到码')
    },
  })
}

function openLink(item: Item) {
  const link = item.analysis.link
  if (!link)
    return
  // #ifdef H5
  window.open(link, '_blank', 'noopener,noreferrer')
  // #endif
  // #ifndef H5
  copyText(link)
  // #endif
}

function remove(item: Item) {
  items.value = items.value.filter(i => i !== item)
  // #ifdef H5
  revokeUrl(item.thumb)
  // #endif
}

const KIND_ICON: Record<string, string> = {
  url: 'i-carbon-link',
  wifi: 'i-carbon-wifi',
  otpauth: 'i-carbon-two-factor-authentication',
  vcard: 'i-carbon-user-profile',
  mecard: 'i-carbon-user-profile',
  email: 'i-carbon-email',
  tel: 'i-carbon-phone',
  sms: 'i-carbon-chat',
  geo: 'i-carbon-location',
  event: 'i-carbon-calendar',
  text: 'i-carbon-text-align-left',
}
</script>

<template>
  <ot-tool-layout>
    <ot-panel>
      <view class="ot-qd__drop" @click="chooseImage">
        <view class="i-carbon-qr-code text-36px text-[#ec4899]" />
        <!-- #ifdef H5 -->
        <text class="mt-2 text-15px text-main font-600">选择图片识别二维码</text>
        <text class="mt-1 text-12px text-muted">也可以把图片拖到页面上，或直接粘贴截图（Ctrl+V）</text>
        <!-- #endif -->
        <!-- #ifndef H5 -->
        <text class="mt-2 text-15px text-main font-600">从相册选择图片</text>
        <text class="mt-1 text-12px text-muted">支持二维码与常见条形码</text>
        <!-- #endif -->
      </view>
      <!-- #ifndef H5 -->
      <wd-button class="mt-3" block icon="scan" @click="scan(true)">
        打开相机扫码
      </wd-button>
      <!-- #endif -->
      <view v-if="busy" class="mt-3 text-center text-13px text-muted">
        识别中…
      </view>
    </ot-panel>

    <ot-panel v-for="item in items" :key="item.id">
      <view class="flex items-start gap-3">
        <!-- #ifdef H5 -->
        <image v-if="item.thumb" :src="item.thumb" mode="aspectFit" class="ot-qd__thumb" />
        <!-- #endif -->
        <view class="min-w-0 flex-1">
          <view class="flex items-center gap-2">
            <view :class="KIND_ICON[item.analysis.kind]" class="text-16px text-[#ec4899]" />
            <text class="text-14px text-main font-600">{{ item.analysis.label }}</text>
            <text class="min-w-0 flex-1 truncate text-12px text-muted">{{ item.source }}</text>
            <view class="i-carbon-close shrink-0 cursor-pointer text-16px text-muted" @click="remove(item)" />
          </view>
          <view class="ot-qd__raw ot-mono">
            <text user-select selectable>{{ item.text || '（空内容）' }}</text>
          </view>
        </view>
      </view>
      <view v-if="item.analysis.fields.length" class="mt-3">
        <ot-result v-for="f in item.analysis.fields" :key="f.label + f.value" :label="f.label" :value="f.value" />
      </view>
      <view v-if="item.analysis.kind === 'otpauth'" class="mt-2 text-12px text-muted">
        这是两步验证密钥，可复制后粘贴到「密码管理」账号的两步验证中，自动生成验证码。
      </view>
      <view v-if="item.analysis.kind === 'url' && !/^https:/i.test(item.text)" class="mt-2 text-12px text-amber-600">
        该网址未使用 HTTPS，打开前请确认来源可信。
      </view>
      <view class="mt-3 flex justify-end gap-2">
        <wd-button v-if="item.analysis.link" size="small" type="info" plain @click="openLink(item)">
          <!-- #ifdef H5 -->
          打开
          <!-- #endif -->
          <!-- #ifndef H5 -->
          复制链接
          <!-- #endif -->
        </wd-button>
        <wd-button size="small" icon="copy" @click="copyText(item.text)">
          复制内容
        </wd-button>
      </view>
    </ot-panel>

    <view class="px-1 text-12px text-muted leading-20px">
      <!-- #ifdef H5 -->
      图片只在浏览器本地识别，不会上传。网页版只识别二维码（一张图识别一个），条形码请用小程序扫码。
      <!-- #endif -->
      <!-- #ifndef H5 -->
      使用微信扫码能力识别，图片不会上传到本站。
      <!-- #endif -->
    </view>

    <!-- #ifdef H5 -->
    <view v-if="dragging" class="ot-qd__mask">
      <view class="ot-qd__mask-inner">
        <view class="i-carbon-qr-code text-40px" />
        <text class="text-16px font-500">松开即可识别</text>
      </view>
    </view>
    <!-- #endif -->
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-qd__drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28px 16px;
  border-radius: 12px;
  border: 1.5px dashed var(--ot-border);
  background: var(--ot-fill);
  cursor: pointer;
  text-align: center;

  &:hover {
    border-color: #ec4899;
  }
}

.ot-qd__thumb {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  border-radius: 8px;
  background: var(--ot-fill);
}

.ot-qd__raw {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--ot-fill);
  font-size: 13px;
  line-height: 1.6;
  color: var(--ot-text);
  word-break: break-all;
  white-space: pre-wrap;
  max-height: 200px;
  overflow-y: auto;
}

/* #ifdef H5 */
.ot-qd__mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  padding: 16px;
  background: color-mix(in srgb, var(--ot-bg) 75%, transparent);
  backdrop-filter: blur(2px);
  pointer-events: none;
}

.ot-qd__mask-inner {
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 2px dashed #ec4899;
  border-radius: 16px;
  color: #ec4899;
}
/* #endif */
</style>
