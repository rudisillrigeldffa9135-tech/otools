<script lang="ts" setup>
// 便签分享的只读页面：凭分享链接免登录查看，内容始终是作者的最新版本
import type { ISharedNote } from '@/api/notes'
import dayjs from 'dayjs'
import { getSharedNote } from '@/api/notes'
import { copyText } from '@/utils/common'
import MdView from './components/md-view.vue'

definePage({
  style: { navigationBarTitleText: '分享的便签' },
})

const note = ref<ISharedNote>()
const loading = ref(true)
const error = ref('')

onLoad(async (query) => {
  const code = String(query?.c || '')
  if (!code) {
    loading.value = false
    error.value = '链接不完整，缺少分享码'
    return
  }
  try {
    note.value = await getSharedNote(code)
    uni.setNavigationBarTitle({ title: note.value.title || '分享的便签' })
    // #ifdef H5
    document.title = `${note.value.title || '分享的便签'} - OTools`
    // #endif
  }
  catch (e: any) {
    error.value = e?.message || '加载失败'
  }
  finally {
    loading.value = false
  }
})
</script>

<template>
  <view class="ot-container pb-10 pt-4 md:pt-8" style="max-width: 860px">
    <view v-if="loading" class="py-16 text-center text-13px text-muted">
      加载中…
    </view>
    <view v-else-if="error" class="ot-ns__empty">
      <view class="i-carbon-document-unknown text-44px text-muted" />
      <text class="mt-3 text-15px text-main">{{ error }}</text>
      <text class="mt-1 text-12px text-muted">请向分享者确认链接是否正确，或请对方重新分享</text>
    </view>
    <view v-else-if="note" class="ot-ns">
      <view class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--ot-border)] pb-3 text-12px text-muted">
        <view class="i-carbon-notebook text-15px text-[#f59e0b]" />
        <text>更新于 {{ dayjs(note.updatedAt * 1000).format('YYYY-MM-DD HH:mm') }}</text>
        <text v-if="note.shareExpiresAt">链接 {{ dayjs(note.shareExpiresAt * 1000).format('MM-DD HH:mm') }} 失效</text>
        <view class="flex-1" />
        <view class="ot-ns__action" @click="copyText(note.content)">
          <view class="i-carbon-copy" />复制 Markdown
        </view>
      </view>
      <md-view :source="note.content" />
    </view>
    <view class="mt-6 text-center text-12px text-muted">
      由 OTools · Markdown 便签分享，只读
    </view>
  </view>
</template>

<style lang="scss" scoped>
.ot-ns {
  padding: 20px 22px;
  border-radius: 14px;
  background: var(--ot-card);
  border: 1px solid var(--ot-border);
}

.ot-ns__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 16px;
  text-align: center;
}

.ot-ns__action {
  display: flex;
  align-items: center;
  gap: 3px;
  color: var(--ot-text-2);
  cursor: pointer;

  &:hover {
    color: var(--wot-color-theme);
  }
}
</style>
