<script lang="ts" setup>
// 四象限（艾森豪威尔矩阵）：按「重要（中高优先级）」与「紧急（明天及以前到期）」把未完成的待办分成四块
import type { ITodo } from '@/api/todo'
import type { Quadrant } from '../views'
import { priorityHex } from '../colors'
import { dueLabel, quadrantOf } from '../views'

const props = defineProps<{
  todos: ITodo[]
  today: string
}>()

const emit = defineEmits<{
  open: [todo: ITodo]
  toggle: [todo: ITodo]
  add: [title: string, quadrant: Quadrant]
}>()

const QUADRANTS: { q: Quadrant, title: string, hint: string, color: string }[] = [
  { q: 1, title: '重要且紧急', hint: '马上做', color: '#ef4444' },
  { q: 2, title: '重要不紧急', hint: '计划做', color: '#f59e0b' },
  { q: 3, title: '紧急不重要', hint: '尽快处理或交给别人', color: '#3b82f6' },
  { q: 4, title: '不重要不紧急', hint: '有空再做', color: '#94a3b8' },
]

const groups = computed(() => {
  const map: Record<Quadrant, ITodo[]> = { 1: [], 2: [], 3: [], 4: [] }
  for (const t of props.todos) {
    if (!t.done)
      map[quadrantOf(t, props.today)].push(t)
  }
  for (const list of Object.values(map))
    list.sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || b.priority - a.priority)
  return map
})

const inputs = reactive<Record<Quadrant, string>>({ 1: '', 2: '', 3: '', 4: '' })
function add(q: Quadrant) {
  const title = inputs[q].trim()
  if (!title)
    return
  emit('add', title, q)
  inputs[q] = ''
}
</script>

<template>
  <view class="ot-tm">
    <view v-for="item in QUADRANTS" :key="item.q" class="ot-tm__box" :style="{ '--c': item.color }">
      <view class="ot-tm__head">
        <text class="ot-tm__title">{{ item.title }}</text>
        <text class="text-11px text-muted">{{ item.hint }} · {{ groups[item.q].length }}</text>
      </view>
      <view class="ot-tm__list">
        <view v-for="t in groups[item.q]" :key="t.id" class="ot-tm__row" @click="emit('open', t)">
          <view class="ot-tm__check" :style="{ borderColor: priorityHex(t.priority) }" @click.stop="emit('toggle', t)" />
          <text class="min-w-0 flex-1 truncate">{{ t.title }}</text>
          <text v-if="t.dueDate" class="shrink-0 text-11px" :class="t.dueDate < today ? 'text-red-500' : 'text-muted'">{{ dueLabel(t.dueDate, null, today) }}</text>
        </view>
        <view class="ot-tm__add">
          <view class="i-carbon-add text-14px text-muted" />
          <input v-model="inputs[item.q]" class="min-w-0 flex-1 text-13px" placeholder="添加" :maxlength="500" confirm-type="done" :confirm-hold="true" @confirm="add(item.q)">
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.ot-tm {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
}

.ot-tm__box {
  display: flex;
  flex-direction: column;
  min-height: 200px;
  padding: 10px 12px;
  border-radius: 12px;
  border-top: 3px solid var(--c);
  background: var(--ot-fill);
}

.ot-tm__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 6px;
}

.ot-tm__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--c);
}

.ot-tm__list {
  display: flex;
  flex-direction: column;
  max-height: 320px;
  overflow-y: auto;
}

.ot-tm__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 4px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--ot-text);
  cursor: pointer;

  &:hover {
    background: var(--ot-card);
  }
}

.ot-tm__check {
  flex-shrink: 0;
  box-sizing: border-box;
  width: 15px;
  height: 15px;
  border: 2px solid;
  border-radius: 50%;
}

.ot-tm__add {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 4px;
  color: var(--ot-text);
}
</style>
