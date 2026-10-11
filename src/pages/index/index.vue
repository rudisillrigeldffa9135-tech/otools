<script lang="ts" setup>
import type { CategoryId } from '@/tools/types'
import { useToolStore } from '@/store/tool'
import { categories } from '@/tools/categories'
import { openTool, searchTools, tools } from '@/tools/registry'

defineOptions({
  name: 'Home',
})
definePage({
  type: 'home',
  style: {
    navigationBarTitleText: 'OTools 工具箱',
  },
})

const toolStore = useToolStore()
const keyword = ref('')
const activeCategory = ref<CategoryId | 'all'>('all')

const categoryTabs = computed(() => [
  { id: 'all' as const, name: '全部', count: tools.length },
  ...categories
    .map(c => ({ id: c.id, name: c.name, count: tools.filter(t => t.category === c.id).length }))
    .filter(c => c.count > 0),
])

const searchResult = computed(() => searchTools(keyword.value))
const filteredTools = computed(() =>
  activeCategory.value === 'all' ? tools : tools.filter(t => t.category === activeCategory.value),
)

function onSearchConfirm() {
  // 回车时只有一个结果则直接打开
  if (searchResult.value.length === 1)
    openTool(searchResult.value[0])
}
</script>

<template>
  <view class="ot-container pb-6">
    <!-- 头部 -->
    <view class="pb-5 pt-6 md:pb-8 md:pt-12 md:text-center">
      <view class="text-24px text-main font-700 md:text-36px">
        简单好用的在线工具箱
      </view>
      <view class="mt-2 text-14px text-muted md:text-16px">
        {{ tools.length }} 个实用工具，即用即走，账号密码加密同步
      </view>
      <view class="ot-search mt-4 md:mx-auto md:mt-6">
        <view class="i-carbon-search text-18px text-muted" />
        <input
          v-model="keyword"
          class="min-w-0 flex-1 text-left text-15px text-main"
          placeholder="搜索工具，如 JSON、时间戳、二维码"
          placeholder-class="text-muted"
          confirm-type="search"
          @confirm="onSearchConfirm"
        >
        <view v-if="keyword" class="i-carbon-close-filled cursor-pointer text-16px text-muted" @click="keyword = ''" />
      </view>
    </view>

    <!-- 搜索结果 -->
    <template v-if="keyword.trim()">
      <view class="ot-section-title">
        搜索结果 · {{ searchResult.length }}
      </view>
      <view v-if="searchResult.length" class="ot-grid">
        <ot-tool-card v-for="tool in searchResult" :key="tool.id" :tool="tool" />
      </view>
      <view v-else class="py-16 text-center text-muted">
        <view class="i-carbon-search-locate mx-auto mb-2 text-40px" />
        没有找到相关工具
      </view>
    </template>

    <template v-else>
      <!-- 最近使用 -->
      <template v-if="toolStore.recents.length">
        <view class="ot-section-title">
          最近使用
        </view>
        <scroll-view scroll-x class="mb-2 whitespace-nowrap" :show-scrollbar="false">
          <view
            v-for="tool in toolStore.recents" :key="tool.id"
            class="ot-chip" hover-class="opacity-70"
            @click="openTool(tool)"
          >
            <view :class="tool.icon" class="text-15px" />
            <text>{{ tool.name }}</text>
          </view>
        </scroll-view>
      </template>

      <!-- 收藏 -->
      <template v-if="toolStore.favorites.length">
        <view class="ot-section-title">
          我的收藏
        </view>
        <view class="ot-grid mb-2">
          <ot-tool-card v-for="tool in toolStore.favorites" :key="tool.id" :tool="tool" />
        </view>
      </template>

      <!-- 全部工具 -->
      <view class="ot-section-title">
        全部工具
      </view>
      <scroll-view scroll-x class="mb-3 whitespace-nowrap" :show-scrollbar="false">
        <view
          v-for="tab in categoryTabs" :key="tab.id"
          class="ot-tab" :class="{ 'is-active': activeCategory === tab.id }"
          @click="activeCategory = tab.id"
        >
          {{ tab.name }}
          <text class="ml-1 text-12px opacity-60">{{ tab.count }}</text>
        </view>
      </scroll-view>
      <view class="ot-grid">
        <ot-tool-card v-for="tool in filteredTools" :key="tool.id" :tool="tool" />
      </view>
    </template>
  </view>
</template>

<style lang="scss" scoped>
.ot-search {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 560px;
  height: 46px;
  padding: 0 16px;
  border-radius: 12px;
  background: var(--ot-card);
  border: 1px solid var(--ot-border);
  box-shadow: var(--ot-shadow);
  transition: border-color 0.15s;

  &:focus-within {
    border-color: var(--wot-color-theme);
  }
}

.ot-section-title {
  margin: 16px 0 10px;
  font-size: 15px;
  font-weight: 600;
  color: var(--ot-text);
}

.ot-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  margin-right: 8px;
  border-radius: 16px;
  background: var(--ot-card);
  border: 1px solid var(--ot-border);
  color: var(--ot-text-2);
  font-size: 13px;
  cursor: pointer;
}

.ot-tab {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 14px;
  margin-right: 8px;
  border-radius: 8px;
  color: var(--ot-text-2);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;

  &.is-active {
    background: var(--wot-color-theme);
    color: #fff;
  }
}
</style>
