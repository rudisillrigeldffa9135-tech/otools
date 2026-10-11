<script lang="ts" setup>
import UQRCode from 'uqrcodejs'
import { getCurrentInstance } from 'vue'
import { toast } from '@/utils/common'

definePage({
  style: { navigationBarTitleText: '二维码生成' },
})

const CANVAS_ID = 'ot-qrcode'
const instance = getCurrentInstance()

const text = ref('https://github.com')
const size = ref(220)
const sizeOptions = [
  { value: 160, label: '小' },
  { value: 220, label: '中' },
  { value: 280, label: '大' },
]
const level = ref<'L' | 'M' | 'Q' | 'H'>('M')
const levelOptions = ['L', 'M', 'Q', 'H']
const fg = ref('#1d2129')
const bg = ref('#ffffff')
const FG_PRESETS = ['#1d2129', '#4f6ef7', '#10b981', '#ef4444', '#8b5cf6']

let timer: ReturnType<typeof setTimeout> | undefined
function scheduleDraw() {
  clearTimeout(timer)
  timer = setTimeout(draw, 200)
}

function draw() {
  if (!text.value)
    return
  const qr = new UQRCode()
  qr.data = text.value
  qr.size = size.value
  qr.margin = 10
  qr.foregroundColor = fg.value
  qr.backgroundColor = bg.value
  qr.errorCorrectLevel = UQRCode.errorCorrectLevel[level.value]
  qr.make()
  // 旧版 canvas API 在 H5 与小程序上行为一致；组件内必须传入实例
  qr.canvasContext = uni.createCanvasContext(CANVAS_ID, instance?.proxy)
  qr.drawCanvas()
}

onReady(draw)
watch([text, size, level, fg, bg], scheduleDraw)

function save() {
  if (!text.value)
    return
  uni.canvasToTempFilePath({
    canvasId: CANVAS_ID,
    success: ({ tempFilePath }) => {
      // #ifdef H5
      const a = document.createElement('a')
      a.href = tempFilePath
      a.download = 'qrcode.png'
      a.click()
      // #endif
      // #ifndef H5
      uni.saveImageToPhotosAlbum({
        filePath: tempFilePath,
        success: () => toast('已保存到相册', 'success'),
        fail: () => toast('保存失败，请检查相册权限'),
      })
      // #endif
    },
    fail: () => toast('导出图片失败'),
  }, instance?.proxy)
}
</script>

<template>
  <ot-tool-layout>
    <view class="flex flex-col gap-3 md:flex-row">
      <ot-panel title="内容" class="min-w-0 flex-1">
        <ot-textarea v-model="text" :height="120" :mono="false" placeholder="输入文本或网址" />
        <view class="mt-4 flex flex-col gap-3 text-13px text-sub">
          <view class="flex items-center gap-3">
            <text class="w-60px">尺寸</text>
            <ot-segmented v-model="size" :options="sizeOptions" size="small" />
          </view>
          <view class="flex items-center gap-3">
            <text class="w-60px">容错率</text>
            <ot-segmented v-model="level" :options="levelOptions" size="small" />
          </view>
          <view class="flex items-center gap-3">
            <text class="w-60px">颜色</text>
            <view
              v-for="c in FG_PRESETS" :key="c"
              class="ot-dot" :class="{ 'is-active': fg === c }" :style="{ background: c }"
              @click="fg = c"
            />
          </view>
        </view>
      </ot-panel>

      <ot-panel title="预览" class="md:w-340px">
        <view class="flex flex-col items-center">
          <view class="rounded-xl p-2" :style="{ background: bg }">
            <canvas
              :id="CANVAS_ID" :canvas-id="CANVAS_ID"
              :style="{ width: `${size}px`, height: `${size}px` }"
            />
          </view>
          <view class="mt-4 w-full">
            <wd-button block :disabled="!text" @click="save">
              保存图片
            </wd-button>
          </view>
        </view>
      </ot-panel>
    </view>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-dot {
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
</style>
