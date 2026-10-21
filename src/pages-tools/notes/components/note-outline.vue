<script lang="ts" setup>
// 大纲：列出所有标题，按级别缩进，点击跳转；当前所在的标题高亮
import type { OutlineItem } from '../markdown'

const props = defineProps<{
  items: OutlineItem[]
  /** 当前所在标题的下标，-1 表示没有 */
  active?: number
}>()

const emit = defineEmits<{ jump: [item: OutlineItem] }>()

/** 以最高的标题级别为基准缩进（文档里只有 ## 时不会整体空出一格） */
const baseLevel = computed(() => Math.min(...props.items.map(i => i.level), 6))
</script>

<template>
  <view class="ot-outline">
    <view v-if="!items.length" class="ot-outline__empty">
      还没有标题。用 # 开头的行写标题，就会出现在这里
    </view>
    <view
      v-for="(item, i) in items" :key="`${item.line}-${i}`"
      class="ot-outline__item" :class="{ 'is-active': i === active, [`is-h${item.level}`]: true }"
      :style="{ paddingLeft: `${8 + (item.level - baseLevel) * 14}px` }"
      :title="item.text"
      @click="emit('jump', item)"
    >
      {{ item.text }}
    </view>
  </view>
</template>

<style lang="scss" scoped>
.ot-outline {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ot-outline__empty {
  padding: 16px 8px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ot-text-3);
}

.ot-outline__item {
  overflow: hidden;
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--ot-text-2);
  cursor: pointer;

  &.is-h1 {
    font-weight: 600;
    color: var(--ot-text);
  }

  &:hover {
    background: var(--ot-fill);
    color: var(--ot-text);
  }

  &.is-active {
    color: var(--wot-color-theme);
    background: rgba(79, 110, 247, 0.08);
    font-weight: 600;
  }
}
</style>
