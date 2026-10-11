<script setup lang="ts">
// 带标题的卡片容器，右侧 extra 插槽放操作按钮
defineProps<{ title?: string }>()
</script>

<template>
  <view class="ot-panel">
    <view v-if="title || $slots.extra" class="mb-3 flex items-center justify-between gap-2">
      <text class="text-14px text-main font-600">{{ title }}</text>
      <view class="flex flex-wrap items-center justify-end gap-2">
        <slot name="extra" />
      </view>
    </view>
    <slot />
  </view>
</template>

<style lang="scss" scoped>
.ot-panel {
  padding: 16px;
  border-radius: 14px;
  background: var(--ot-card);
  border: 1px solid var(--ot-border);
}
</style>
