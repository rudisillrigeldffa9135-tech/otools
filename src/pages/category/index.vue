<script lang="ts" setup>
import type { CategoryId } from '@/tools/types'
import { categories } from '@/tools/categories'
import { getToolsByCategory } from '@/tools/registry'

definePage({
  style: {
    navigationBarTitleText: '分类',
  },
})

const list = categories
  .map(c => ({ ...c, tools: getToolsByCategory(c.id) }))
  .filter(c => c.tools.length > 0)

const active = ref<CategoryId>(list[0]?.id)
const current = computed(() => list.find(c => c.id === active.value))
</script>

<template>
  <view class="ot-container flex gap-3 pt-4 md:gap-6 md:pt-6">
    <view class="ot-side">
      <view
        v-for="c in list" :key="c.id"
        class="ot-side__item" :class="{ 'is-active': active === c.id }"
        @click="active = c.id"
      >
        <view :class="c.icon" class="text-16px max-md:hidden" />
        <text>{{ c.name }}</text>
      </view>
    </view>

    <view v-if="current" class="min-w-0 flex-1 pb-6">
      <view class="mb-3 flex items-baseline gap-2">
        <text class="text-17px text-main font-600">{{ current.name }}</text>
        <text class="text-13px text-muted">{{ current.tools.length }} 个工具</text>
      </view>
      <view class="ot-grid ot-grid--side">
        <ot-tool-card v-for="tool in current.tools" :key="tool.id" :tool="tool" />
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.ot-side {
  flex-shrink: 0;
  width: 92px;
  align-self: flex-start;
  position: sticky;
  top: 72px;
}

.ot-side__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 4px;
  border-radius: 10px;
  color: var(--ot-text-2);
  font-size: 14px;
  cursor: pointer;

  &.is-active {
    background: var(--ot-card);
    color: var(--wot-color-theme);
    font-weight: 600;
    box-shadow: var(--ot-shadow);
  }
}

// 侧栏占了宽度，手机端只放 1 列
.ot-grid--side {
  grid-template-columns: minmax(0, 1fr);
}

@media (min-width: 640px) {
  .ot-grid--side {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 768px) {
  .ot-side {
    width: 168px;
  }
}

@media (min-width: 960px) {
  .ot-grid--side {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
