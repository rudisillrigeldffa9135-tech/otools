<script setup lang="ts">
// 首页「今日」：今天与逾期的待办（可直接勾选完成）、近期纪念日、未读提醒
import type { IToday } from '@/api/notify'
import { getToday } from '@/api/notify'
import { completeTodo } from '@/api/todo'
import { isLoggedIn } from '@/router/auth'
import { toast } from '@/utils/common'

const data = ref<IToday>()
const doneIds = ref<Set<number>>(new Set())

const PRIORITY_HEX = ['#94a3b8', '#3b82f6', '#f59e0b', '#ef4444']
const GRADIENTS: Record<string, string> = {
  '': 'linear-gradient(135deg, #4f6ef7, #8b5cf6)',
  'red': 'linear-gradient(135deg, #f43f5e, #f97316)',
  'orange': 'linear-gradient(135deg, #f97316, #f59e0b)',
  'amber': 'linear-gradient(135deg, #f59e0b, #eab308)',
  'green': 'linear-gradient(135deg, #22c55e, #14b8a6)',
  'teal': 'linear-gradient(135deg, #14b8a6, #0ea5e9)',
  'blue': 'linear-gradient(135deg, #3b82f6, #6366f1)',
  'indigo': 'linear-gradient(135deg, #6366f1, #a855f7)',
  'purple': 'linear-gradient(135deg, #a855f7, #ec4899)',
  'pink': 'linear-gradient(135deg, #ec4899, #f43f5e)',
  'gray': 'linear-gradient(135deg, #64748b, #334155)',
}

async function refresh() {
  if (!isLoggedIn()) {
    data.value = undefined
    return
  }
  try {
    data.value = await getToday()
    doneIds.value = new Set()
  }
  catch {}
}

const remaining = computed(() => (data.value?.todoCount ?? 0) - doneIds.value.size)

async function complete(id: number) {
  if (doneIds.value.has(id))
    return
  doneIds.value = new Set([...doneIds.value, id])
  try {
    const res = await completeTodo(id, true)
    if (res.next)
      toast('已完成，已生成下一次')
  }
  catch {
    const s = new Set(doneIds.value)
    s.delete(id)
    doneIds.value = s
  }
}

function open(path: string) {
  uni.navigateTo({ url: path })
}

function dayText(a: IToday['anniversaries'][number]) {
  if (a.kind === 'today')
    return '今天'
  if (a.kind === 'countdown')
    return `${a.days} 天后`
  return `第 ${a.days} 天`
}

onMounted(refresh)
defineExpose({ refresh })
</script>

<template>
  <view v-if="data" class="ot-today">
    <view v-if="data.unread" class="ot-today__unread" @click="open('/pages/notify/index')">
      <view class="i-carbon-notification-new text-16px" />
      <text class="flex-1">{{ data.unread }} 条未读提醒</text>
      <view class="i-carbon-chevron-right" />
    </view>

    <view class="ot-today__grid">
      <!-- 今日待办 -->
      <view class="ot-today__card">
        <view class="ot-today__head" @click="open('/pages-tools/todo/index')">
          <view class="i-carbon-task text-17px text-[var(--wot-color-theme)]" />
          <text class="flex-1 font-600">今日待办</text>
          <text class="text-12px text-muted">{{ remaining > 0 ? `${remaining} 项` : '' }}</text>
          <view class="i-carbon-chevron-right text-muted" />
        </view>
        <view v-if="!data.todos.length" class="ot-today__empty" @click="open('/pages-tools/todo/index')">
          今天没有待办 · 去添加
        </view>
        <view v-for="t in data.todos.slice(0, 5)" :key="t.id" class="ot-today__todo" :class="{ 'is-done': doneIds.has(t.id) }">
          <view
            class="ot-today__check" :style="{ borderColor: PRIORITY_HEX[t.priority], background: doneIds.has(t.id) ? PRIORITY_HEX[t.priority] : '' }"
            @click="complete(t.id)"
          >
            <view v-if="doneIds.has(t.id)" class="i-carbon-checkmark text-11px text-white" />
          </view>
          <text class="min-w-0 flex-1 truncate" @click="open('/pages-tools/todo/index')">{{ t.title }}</text>
          <text class="shrink-0 text-12px" :class="t.overdue ? 'text-red-500' : 'text-muted'">{{ t.overdue ? '逾期' : t.dueTime || '今天' }}</text>
        </view>
        <view v-if="data.todoCount > 5" class="ot-today__more" @click="open('/pages-tools/todo/index')">
          还有 {{ data.todoCount - 5 }} 项
        </view>
      </view>

      <!-- 纪念日 -->
      <view class="ot-today__card">
        <view class="ot-today__head" @click="open('/pages-tools/anniversary/index')">
          <view class="i-carbon-favorite text-17px text-[#ec4899]" />
          <text class="flex-1 font-600">纪念日</text>
          <view class="i-carbon-chevron-right text-muted" />
        </view>
        <view v-if="!data.anniversaries.length" class="ot-today__empty" @click="open('/pages-tools/anniversary/index')">
          最近 30 天没有纪念日 · 去添加
        </view>
        <view v-for="a in data.anniversaries.slice(0, 4)" :key="a.id" class="ot-today__ann" @click="open('/pages-tools/anniversary/index')">
          <view class="ot-today__emoji" :style="{ background: GRADIENTS[a.color] ?? GRADIENTS[''] }">
            {{ a.emoji || '📌' }}
          </view>
          <view class="min-w-0 flex-1">
            <text class="block truncate">{{ a.title }}</text>
            <text v-if="a.nth" class="block truncate text-11px text-muted">{{ a.nth }}</text>
          </view>
          <text class="shrink-0 text-13px font-600" :class="a.kind === 'today' ? 'text-red-500' : a.kind === 'countdown' ? 'text-[var(--wot-color-theme)]' : 'text-orange-500'">
            {{ dayText(a) }}
          </text>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.ot-today {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.ot-today__unread {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  color: #b45309;
  background: rgba(245, 158, 11, 0.12);
  cursor: pointer;
}

.ot-today__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;

  @media (min-width: 768px) {
    grid-template-columns: 1fr 1fr;
  }
}

.ot-today__card {
  padding: 12px 14px;
  border-radius: 14px;
  font-size: 14px;
  color: var(--ot-text);
  background: var(--ot-card);
  border: 1px solid var(--ot-border);
}

.ot-today__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  cursor: pointer;
}

.ot-today__empty {
  padding: 10px 0 4px;
  font-size: 13px;
  color: var(--ot-text-3);
  cursor: pointer;
}

.ot-today__todo {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  cursor: pointer;

  &.is-done text:first-of-type {
    color: var(--ot-text-3);
    text-decoration: line-through;
  }
}

.ot-today__check {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 17px;
  height: 17px;
  border: 2px solid;
  border-radius: 50%;
}

.ot-today__more {
  padding-top: 4px;
  font-size: 12px;
  color: var(--wot-color-theme);
  cursor: pointer;
}

.ot-today__ann {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  cursor: pointer;
}

.ot-today__emoji {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  font-size: 16px;
}
</style>
