<script setup lang="ts">
// 结果行：标签 + 等宽值 + 一键复制
import { copyText } from '@/utils/common'

defineProps<{ label: string, value: string }>()
</script>

<template>
  <view class="ot-result">
    <view class="w-80px shrink-0 text-13px text-muted">
      {{ label }}
    </view>
    <text class="ot-mono min-w-0 flex-1 break-all text-13px text-main" user-select selectable>{{ value || '—' }}</text>
    <view class="i-carbon-copy shrink-0 cursor-pointer p-1 text-16px text-muted" @click="copyText(value)" />
  </view>
</template>

<style lang="scss" scoped>
.ot-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--ot-fill);

  & + & {
    margin-top: 8px;
  }
}
</style>
