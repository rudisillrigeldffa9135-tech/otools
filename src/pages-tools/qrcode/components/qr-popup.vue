<script lang="ts" setup>
// 分享用的二维码弹窗：直接在当前页面展示，可保存图片、复制链接
import { copyText } from '@/utils/common'
import QrView from './qr-view.vue'

const props = withDefaults(defineProps<{
  /** 二维码内容（通常是分享链接） */
  text: string
  /** 二维码下方的文字，同时画进保存的图片 */
  note?: string
  title?: string
}>(), {
  note: '',
  title: '扫码打开',
})

const show = defineModel<boolean>({ default: false })
const view = ref<InstanceType<typeof QrView>>()
</script>

<template>
  <wd-popup v-model="show" position="center" custom-style="border-radius: 16px;">
    <view class="ot-qr-popup">
      <view class="flex items-center gap-2">
        <view class="i-carbon-qr-code text-18px text-[var(--wot-color-theme)]" />
        <text class="flex-1 text-16px text-main font-600">{{ props.title }}</text>
        <view class="i-carbon-close cursor-pointer text-18px text-muted" @click="show = false" />
      </view>
      <view class="mt-4 flex justify-center">
        <!-- 弹窗关闭时不渲染，避免小程序 canvas 盖在其他内容上 -->
        <qr-view v-if="show && props.text" ref="view" :text="props.text" :note="props.note" :size="200" />
      </view>
      <text class="ot-mono mt-3 block break-all text-center text-11px text-muted" user-select selectable>{{ props.text }}</text>
      <view class="mt-4 flex gap-2">
        <wd-button custom-class="flex-1" icon="download" @click="view?.save()">
          保存图片
        </wd-button>
        <wd-button custom-class="flex-1" type="info" plain icon="copy" @click="copyText(props.text)">
          复制链接
        </wd-button>
      </view>
    </view>
  </wd-popup>
</template>

<style lang="scss" scoped>
.ot-qr-popup {
  box-sizing: border-box;
  width: min(88vw, 340px);
  padding: 18px;
}
</style>
