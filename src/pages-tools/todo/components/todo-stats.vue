<script lang="ts" setup>
// 完成统计：累计完成、本周完成、连续完成天数、累计专注；最近 N 天每天的完成数与专注分钟
import type { ITodoStats } from '@/api/todo'
import { getTodoStats } from '@/api/todo'
import { addDays, weekday } from '../../datecalc/date'
import { streakOf } from '../views'

const RANGES = [
  { value: 14, label: '14 天' },
  { value: 30, label: '30 天' },
  { value: 90, label: '90 天' },
]

const range = ref(14)
const stats = ref<ITodoStats>()
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    stats.value = await getTodoStats(range.value)
  }
  catch {}
  finally {
    loading.value = false
  }
}

watch(range, load)
onMounted(load)
defineExpose({ load })

const days = computed(() => {
  const s = stats.value
  if (!s)
    return []
  return Array.from({ length: range.value }, (_, i) => {
    const d = addDays(s.today, i - range.value + 1)
    return { date: d, done: s.days[d] ?? 0, focus: s.focus[d] ?? 0 }
  })
})
const maxDone = computed(() => Math.max(1, ...days.value.map(d => d.done)))
const maxFocus = computed(() => Math.max(1, ...days.value.map(d => d.focus)))

const summary = computed(() => {
  const s = stats.value
  if (!s)
    return null
  // 本周：周一到今天
  const monday = addDays(s.today, -((weekday(s.today) + 6) % 7))
  let week = 0
  let weekFocus = 0
  for (let d = monday; d <= s.today; d = addDays(d, 1)) {
    week += s.days[d] ?? 0
    weekFocus += s.focus[d] ?? 0
  }
  return {
    today: s.days[s.today] ?? 0,
    week,
    weekFocus,
    streak: streakOf(s.days, s.today),
    total: s.totalDone,
    totalFocus: s.totalFocus,
  }
})

function hours(minutes: number) {
  return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时${minutes % 60 ? ` ${minutes % 60} 分` : ''}` : `${minutes} 分钟`
}

function label(date: string) {
  return range.value <= 14 || date.endsWith('01') || date.endsWith('15') ? `${Number(date.slice(5, 7))}/${Number(date.slice(8))}` : ''
}
</script>

<template>
  <view class="ot-ts">
    <view v-if="summary" class="ot-ts__cards">
      <view class="ot-ts__card">
        <text class="ot-ts__num">{{ summary.today }}</text>
        <text class="ot-ts__k">今天完成</text>
      </view>
      <view class="ot-ts__card">
        <text class="ot-ts__num">{{ summary.week }}</text>
        <text class="ot-ts__k">本周完成</text>
      </view>
      <view class="ot-ts__card">
        <text class="ot-ts__num">{{ summary.streak }}<text class="text-13px font-400"> 天</text></text>
        <text class="ot-ts__k">连续完成</text>
      </view>
      <view class="ot-ts__card">
        <text class="ot-ts__num">{{ summary.total }}</text>
        <text class="ot-ts__k">累计完成</text>
      </view>
      <view class="ot-ts__card">
        <text class="ot-ts__num is-small">{{ hours(summary.weekFocus) }}</text>
        <text class="ot-ts__k">本周专注</text>
      </view>
      <view class="ot-ts__card">
        <text class="ot-ts__num is-small">{{ hours(summary.totalFocus) }}</text>
        <text class="ot-ts__k">累计专注</text>
      </view>
    </view>

    <view class="mt-4 flex items-center gap-2">
      <text class="flex-1 text-13px text-main font-600">每天完成数</text>
      <ot-segmented v-model="range" :options="RANGES" size="small" />
    </view>
    <view class="ot-ts__chart">
      <view v-for="d in days" :key="d.date" class="ot-ts__col" :title="`${d.date}：完成 ${d.done} 项`">
        <text v-if="d.done && range <= 30" class="ot-ts__val">{{ d.done }}</text>
        <view class="ot-ts__bar" :style="{ height: `${d.done / maxDone * 100}%` }" />
        <text class="ot-ts__x">{{ label(d.date) }}</text>
      </view>
    </view>

    <text class="mt-4 block text-13px text-main font-600">每天专注（分钟）</text>
    <view class="ot-ts__chart">
      <view v-for="d in days" :key="d.date" class="ot-ts__col" :title="`${d.date}：专注 ${d.focus} 分钟`">
        <text v-if="d.focus && range <= 30" class="ot-ts__val">{{ d.focus }}</text>
        <view class="ot-ts__bar is-focus" :style="{ height: `${d.focus / maxFocus * 100}%` }" />
        <text class="ot-ts__x">{{ label(d.date) }}</text>
      </view>
    </view>
    <text class="mt-3 block text-12px text-muted">统计的是你本人完成的待办（含共享清单里你完成的）；清空已完成的待办不影响统计。</text>
  </view>
</template>

<style lang="scss" scoped>
.ot-ts__cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;

  @media (min-width: 900px) {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}

.ot-ts__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 6px;
  border-radius: 12px;
  background: var(--ot-fill);
}

.ot-ts__num {
  font-size: 22px;
  font-weight: 700;
  color: var(--wot-color-theme);

  &.is-small {
    font-size: 15px;
    line-height: 30px;
  }
}

.ot-ts__k {
  margin-top: 2px;
  font-size: 12px;
  color: var(--ot-text-3);
}

.ot-ts__chart {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 140px;
  margin-top: 8px;
  padding: 18px 0 18px;
  border-bottom: 1px solid var(--ot-border);
}

.ot-ts__col {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  height: 100%;
}

.ot-ts__bar {
  width: 70%;
  min-height: 1px;
  border-radius: 3px 3px 0 0;
  background: var(--wot-color-theme);

  &.is-focus {
    background: #f97316;
  }
}

.ot-ts__val {
  margin-bottom: 2px;
  font-size: 10px;
  color: var(--ot-text-3);
}

.ot-ts__x {
  position: absolute;
  bottom: -18px;
  font-size: 10px;
  white-space: nowrap;
  color: var(--ot-text-3);
}
</style>
