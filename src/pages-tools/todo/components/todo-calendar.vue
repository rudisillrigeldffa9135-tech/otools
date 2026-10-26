<script lang="ts" setup>
// 日历视图：按月查看每天的待办，点某一天在下方列出当天的待办，并可直接添加到这一天
import type { ITodo } from '@/api/todo'
import { addDays, addMonths, daysInMonth, weekday } from '../../datecalc/date'
import { shortLabel } from '../../datecalc/lunar'
import { priorityHex } from '../colors'

const props = defineProps<{
  todos: ITodo[]
  today: string
}>()

const emit = defineEmits<{
  open: [todo: ITodo]
  toggle: [todo: ITodo]
  add: [title: string, date: string]
}>()

const month = ref(props.today.slice(0, 7))
const selected = ref(props.today)
const newTitle = ref('')

const WEEK = ['一', '二', '三', '四', '五', '六', '日']

/** 6 行 × 7 列，以周一开头 */
const cells = computed(() => {
  const first = `${month.value}-01`
  const start = addDays(first, -((weekday(first) + 6) % 7))
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
})

const byDate = computed(() => {
  const map = new Map<string, ITodo[]>()
  for (const t of props.todos) {
    if (!t.dueDate)
      continue
    map.set(t.dueDate, [...(map.get(t.dueDate) ?? []), t])
  }
  for (const list of map.values())
    list.sort((a, b) => Number(a.done) - Number(b.done) || b.priority - a.priority || (a.dueTime || '99').localeCompare(b.dueTime || '99'))
  return map
})

const selectedTodos = computed(() => byDate.value.get(selected.value) ?? [])
const monthTitle = computed(() => `${month.value.slice(0, 4)} 年 ${Number(month.value.slice(5))} 月`)

function shift(n: number) {
  month.value = addMonths(`${month.value}-01`, n).slice(0, 7)
}

function goToday() {
  month.value = props.today.slice(0, 7)
  selected.value = props.today
}

function pick(date: string) {
  selected.value = date
  if (date.slice(0, 7) !== month.value)
    month.value = date.slice(0, 7)
}

function add() {
  const title = newTitle.value.trim()
  if (!title)
    return
  emit('add', title, selected.value)
  newTitle.value = ''
}

function lunar(date: string) {
  try {
    return shortLabel(date)
  }
  catch {
    return ''
  }
}

// 只在需要的月份范围内计算农历
const lastDay = computed(() => `${month.value}-${String(daysInMonth(Number(month.value.slice(0, 4)), Number(month.value.slice(5)))).padStart(2, '0')}`)
</script>

<template>
  <view class="ot-tc">
    <view class="ot-tc__head">
      <view class="ot-tc__nav" @click="shift(-1)">
        <view class="i-carbon-chevron-left" />
      </view>
      <text class="ot-tc__month">{{ monthTitle }}</text>
      <view class="ot-tc__nav" @click="shift(1)">
        <view class="i-carbon-chevron-right" />
      </view>
      <view class="flex-1" />
      <text class="ot-tc__today" @click="goToday">今天</text>
    </view>

    <view class="ot-tc__grid">
      <text v-for="w in WEEK" :key="w" class="ot-tc__week">{{ w }}</text>
      <view
        v-for="d in cells" :key="d" class="ot-tc__cell"
        :class="{ 'is-other': d.slice(0, 7) !== month, 'is-today': d === today, 'is-selected': d === selected }"
        @click="pick(d)"
      >
        <view class="flex items-baseline gap-1">
          <text class="ot-tc__day">{{ Number(d.slice(8)) }}</text>
          <text v-if="d <= lastDay && d.slice(0, 7) === month" class="ot-tc__lunar">{{ lunar(d) }}</text>
        </view>
        <view class="ot-tc__items">
          <text
            v-for="t in (byDate.get(d) ?? []).slice(0, 3)" :key="t.id" class="ot-tc__item"
            :class="{ 'is-done': t.done, 'is-overdue': !t.done && d < today }" :style="{ borderLeftColor: priorityHex(t.priority) }"
          >
            {{ t.title }}
          </text>
          <text v-if="(byDate.get(d)?.length ?? 0) > 3" class="ot-tc__more">+{{ byDate.get(d)!.length - 3 }}</text>
        </view>
        <view v-if="byDate.get(d)?.length" class="ot-tc__dots">
          <text v-for="t in byDate.get(d)!.slice(0, 4)" :key="t.id" class="ot-tc__dot" :style="{ background: t.done ? 'var(--ot-text-3)' : priorityHex(t.priority) }" />
        </view>
      </view>
    </view>

    <view class="ot-tc__list">
      <text class="ot-tc__list-title">{{ selected === today ? '今天' : selected }} · {{ selectedTodos.length }} 项</text>
      <view v-for="t in selectedTodos" :key="t.id" class="ot-tc__row" @click="emit('open', t)">
        <view
          class="ot-tc__check" :style="{ borderColor: priorityHex(t.priority), background: t.done ? priorityHex(t.priority) : '' }"
          @click.stop="emit('toggle', t)"
        >
          <view v-if="t.done" class="i-carbon-checkmark text-11px text-white" />
        </view>
        <text class="min-w-0 flex-1 truncate" :class="{ 'is-done': t.done }">{{ t.title }}</text>
        <text v-if="t.dueTime" class="text-12px text-muted">{{ t.dueTime }}</text>
      </view>
      <view class="ot-tc__add">
        <view class="i-carbon-add text-16px text-[var(--wot-color-theme)]" />
        <input v-model="newTitle" class="min-w-0 flex-1 text-14px" :placeholder="`添加到 ${selected === today ? '今天' : selected.slice(5)}`" :maxlength="500" confirm-type="done" :confirm-hold="true" @confirm="add">
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.ot-tc__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.ot-tc__nav {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  font-size: 16px;
  color: var(--ot-text-2);
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
  }
}

.ot-tc__month {
  font-size: 15px;
  font-weight: 600;
  color: var(--ot-text);
}

.ot-tc__today {
  padding: 3px 10px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--wot-color-theme);
  background: rgba(79, 110, 247, 0.08);
  cursor: pointer;
}

.ot-tc__grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 2px;
}

.ot-tc__week {
  padding: 4px 0;
  font-size: 12px;
  text-align: center;
  color: var(--ot-text-3);
}

.ot-tc__cell {
  position: relative;
  min-height: 86px;
  padding: 4px 4px 2px;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
  }

  &.is-other {
    opacity: 0.4;
  }

  &.is-selected {
    background: rgba(79, 110, 247, 0.08);
    box-shadow: inset 0 0 0 1px var(--wot-color-theme);
  }

  &.is-today .ot-tc__day {
    color: #fff;
    background: var(--wot-color-theme);
  }
}

.ot-tc__day {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  font-size: 13px;
  color: var(--ot-text);
}

.ot-tc__lunar {
  overflow: hidden;
  font-size: 10px;
  white-space: nowrap;
  color: var(--ot-text-3);
}

.ot-tc__items {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 2px;
}

.ot-tc__item {
  overflow: hidden;
  padding: 0 4px;
  border-left: 2px solid;
  border-radius: 2px;
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--ot-text-2);
  background: var(--ot-fill);

  &.is-done {
    color: var(--ot-text-3);
    text-decoration: line-through;
  }

  &.is-overdue {
    color: #ef4444;
  }
}

.ot-tc__more {
  font-size: 10px;
  color: var(--ot-text-3);
}

.ot-tc__dots {
  display: none;
  justify-content: center;
  gap: 2px;
  margin-top: 2px;
}

.ot-tc__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}

// 窄屏：格子里只显示圆点
@media (max-width: 640px) {
  .ot-tc__cell {
    min-height: 50px;
    text-align: center;
  }

  .ot-tc__lunar,
  .ot-tc__items {
    display: none;
  }

  .ot-tc__dots {
    display: flex;
  }
}

.ot-tc__list {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--ot-border);
}

.ot-tc__list-title {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ot-text-3);
}

.ot-tc__row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 38px;
  padding: 0 6px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--ot-text);
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
  }

  .is-done {
    color: var(--ot-text-3);
    text-decoration: line-through;
  }
}

.ot-tc__check {
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

.ot-tc__add {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 6px;
  color: var(--ot-text);
}
</style>
