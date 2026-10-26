<script lang="ts" setup>
// 站内提醒：待办到期、纪念日、里程碑等（保留 30 天）
import type { INotification } from '@/api/notify'
import dayjs from 'dayjs'
import { clearNotifications, listNotifications, readNotifications } from '@/api/notify'
import { toast } from '@/utils/common'

definePage({
  style: { navigationBarTitleText: '提醒' },
})

const items = ref<INotification[]>([])
const unread = ref(0)
const loading = ref(true)

const ICONS: Record<string, string> = {
  todo: 'i-carbon-task',
  anniversary: 'i-carbon-favorite',
  milestone: 'i-carbon-trophy',
  test: 'i-carbon-notification',
}

async function load() {
  try {
    const data = await listNotifications()
    items.value = data.items
    unread.value = data.unread
  }
  catch {}
  finally {
    loading.value = false
  }
}

function timeText(sec: number) {
  const d = dayjs(sec * 1000)
  if (d.isSame(dayjs(), 'day'))
    return d.format('HH:mm')
  if (d.isSame(dayjs().subtract(1, 'day'), 'day'))
    return `昨天 ${d.format('HH:mm')}`
  return d.format('MM-DD HH:mm')
}

async function open(n: INotification) {
  if (!n.read) {
    n.read = true
    unread.value = Math.max(0, unread.value - 1)
    readNotifications([n.id]).catch(() => {})
  }
  if (n.path)
    uni.navigateTo({ url: n.path, fail: () => uni.switchTab({ url: n.path }) })
}

async function readAll() {
  await readNotifications()
  items.value.forEach(n => (n.read = true))
  unread.value = 0
}

function clearAll() {
  uni.showModal({
    title: '清空提醒',
    content: '删除全部提醒记录？',
    confirmColor: '#ef4444',
    success: async ({ confirm }) => {
      if (!confirm)
        return
      await clearNotifications()
      items.value = []
      unread.value = 0
      toast('已清空', 'success')
    },
  })
}

onShow(load)
</script>

<template>
  <view class="ot-container flex flex-col gap-3 pb-6 pt-4 md:pt-6" style="max-width: 760px">
    <ot-panel :title="`提醒${unread ? ` · ${unread} 条未读` : ''}`">
      <template #extra>
        <text v-if="unread" class="ot-nt__link" @click="readAll">全部已读</text>
        <text v-if="items.length" class="ot-nt__link is-muted" @click="clearAll">清空</text>
      </template>
      <view v-if="loading" class="py-10 text-center text-13px text-muted">
        加载中…
      </view>
      <view v-else-if="!items.length" class="ot-nt__empty">
        <view class="i-carbon-notification-off text-40px text-muted" />
        <text class="mt-2 text-13px text-muted">还没有提醒。给待办或纪念日设置提醒后，到点会出现在这里</text>
      </view>
      <view v-for="n in items" :key="n.id" class="ot-nt__item" :class="{ 'is-unread': !n.read }" @click="open(n)">
        <view class="ot-nt__icon" :class="`is-${n.kind}`">
          <view :class="ICONS[n.kind] || 'i-carbon-notification'" />
        </view>
        <view class="min-w-0 flex-1">
          <text class="block truncate text-14px text-main" :class="{ 'font-600': !n.read }">{{ n.title }}</text>
          <text v-if="n.body" class="mt-0.5 block truncate text-12px text-muted">{{ n.body }}</text>
        </view>
        <view class="flex flex-col items-end gap-1">
          <text class="text-11px text-muted">{{ timeText(n.createdAt) }}</text>
          <view v-if="!n.read" class="ot-nt__dot" />
        </view>
      </view>
    </ot-panel>
    <view class="px-1 text-12px text-muted leading-20px">
      提醒保留 30 天。想在不打开网站时也收到提醒，可以在「我的 → 提醒方式」开启浏览器推送或日历订阅。
    </view>
  </view>
</template>

<style lang="scss" scoped>
.ot-nt__link {
  font-size: 13px;
  color: var(--wot-color-theme);
  cursor: pointer;

  &.is-muted {
    margin-left: 12px;
    color: var(--ot-text-3);
  }
}

.ot-nt__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 16px;
  text-align: center;
}

.ot-nt__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 6px;
  border-radius: 10px;
  cursor: pointer;

  & + & {
    border-top: 1px solid var(--ot-border);
  }

  &:hover {
    background: var(--ot-fill);
  }
}

.ot-nt__icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  font-size: 18px;
  color: var(--wot-color-theme);
  background: rgba(79, 110, 247, 0.1);

  &.is-anniversary,
  &.is-milestone {
    color: #ec4899;
    background: rgba(236, 72, 153, 0.1);
  }
}

.ot-nt__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
}
</style>
