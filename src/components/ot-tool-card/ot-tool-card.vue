<script setup lang="ts">
import type { Tool } from '@/tools/types'
import { useToolStore } from '@/store/tool'
import { getCategory } from '@/tools/categories'
import { openTool } from '@/tools/registry'

const props = defineProps<{ tool: Tool }>()

const toolStore = useToolStore()
const color = computed(() => getCategory(props.tool.category).color)
</script>

<template>
  <view class="ot-tool-card" hover-class="is-hover" @click="openTool(tool)">
    <view class="flex items-start justify-between">
      <view class="ot-tool-card__icon" :style="{ color, backgroundColor: `${color}1a` }">
        <view :class="tool.icon" class="text-20px" />
      </view>
      <view
        class="ot-tool-card__fav"
        :class="toolStore.isFavorite(tool.id) ? 'i-carbon-star-filled text-amber-400' : 'i-carbon-star text-muted'"
        @click.stop="toolStore.toggleFavorite(tool.id)"
      />
    </view>
    <view class="mt-3 flex items-center gap-1">
      <text class="truncate text-15px text-main font-600">{{ tool.name }}</text>
      <text v-if="tool.isNew" class="ot-tool-card__new">NEW</text>
    </view>
    <view class="ot-ellipsis-2 mt-1 text-12px text-muted leading-18px">
      {{ tool.desc }}
    </view>
  </view>
</template>

<style lang="scss" scoped>
.ot-tool-card {
  box-sizing: border-box;
  height: 100%;
  padding: 14px;
  border-radius: 14px;
  background: var(--ot-card);
  border: 1px solid var(--ot-border);
  cursor: pointer;
  transition:
    transform 0.15s,
    box-shadow 0.15s,
    border-color 0.15s;

  /* #ifdef H5 */
  &:hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--wot-color-theme) 35%, var(--ot-border));
    box-shadow: var(--ot-shadow);
  }
  /* #endif */

  &.is-hover {
    opacity: 0.85;
  }
}

.ot-tool-card__icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ot-tool-card__fav {
  font-size: 18px;
  padding: 2px;
}

.ot-tool-card__new {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 14px;
  padding: 0 4px;
  border-radius: 4px;
  color: #fff;
  background: #ef4444;
}
</style>
