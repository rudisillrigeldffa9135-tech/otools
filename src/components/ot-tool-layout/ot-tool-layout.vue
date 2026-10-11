<script setup lang="ts">
// 工具页统一外壳：根据当前路由自动识别工具，展示标题 / 描述 / 收藏，并记录最近使用
import { useToolStore } from '@/store/tool'
import { getCategory } from '@/tools/categories'
import { getToolByPath } from '@/tools/registry'
import { currRoute } from '@/utils'

const toolStore = useToolStore()
const path = ref('')

onLoad(() => {
  path.value = currRoute().path
  const tool = getToolByPath(path.value)
  if (tool) {
    toolStore.addRecent(tool.id)
    uni.setNavigationBarTitle({ title: tool.name })
  }
})

const tool = computed(() => getToolByPath(path.value))
const color = computed(() => (tool.value ? getCategory(tool.value.category).color : ''))
</script>

<template>
  <view class="ot-container pb-8 pt-4 md:pt-6" style="max-width: 960px">
    <view v-if="tool" class="mb-4 flex items-center gap-3">
      <view class="ot-tool-layout__icon" :style="{ color, backgroundColor: `${color}1a` }">
        <view :class="tool.icon" class="text-24px" />
      </view>
      <view class="min-w-0 flex-1">
        <view class="text-18px text-main font-600 md:text-22px">
          {{ tool.name }}
        </view>
        <view class="mt-2px text-13px text-muted">
          {{ tool.desc }}
        </view>
      </view>
      <view
        class="p-1 text-22px"
        :class="toolStore.isFavorite(tool.id) ? 'i-carbon-star-filled text-amber-400' : 'i-carbon-star text-muted'"
        @click="toolStore.toggleFavorite(tool.id)"
      />
    </view>
    <view class="flex flex-col gap-3">
      <slot />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.ot-tool-layout__icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
