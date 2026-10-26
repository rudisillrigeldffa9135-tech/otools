<script lang="ts" setup>
// 待办详情：标题、日期时间、重复、提醒、优先级、清单、标签、子任务、备注；改动通过 update 事件交给页面保存
import type { ITodo, ITodoForm, ITodoList, ITodoSubtask } from '@/api/todo'
import type { RepeatRule } from '../repeat'
import dayjs from 'dayjs'
import { addDays, weekday } from '../../datecalc/date'
import { colorHex, PRIORITIES, priorityHex, REMIND_OPTIONS, remindLabel } from '../colors'
import { describeRule } from '../repeat'
import { dueLabel, isOverdue } from '../views'
import RepeatPicker from './repeat-picker.vue'

const props = defineProps<{
  todo: ITodo
  lists: ITodoList[]
  today: string
  /** 创建者 / 完成者的名字 */
  personName: (id: number | null) => string
  me: number
  /** 显示「专注」（番茄钟）按钮 */
  canFocus?: boolean
}>()

const emit = defineEmits<{
  update: [patch: ITodoForm]
  toggle: []
  remove: []
  close: []
  focus: []
}>()

/* ---------------- 标题与备注：输入时不立即保存，停顿或离开时保存 ---------------- */

const title = ref(props.todo.title)
const note = ref(props.todo.note)
const titleFocused = ref(false)
const noteFocused = ref(false)
const newSubtask = ref('')
const newTag = ref('')
let noteTimer: ReturnType<typeof setTimeout> | undefined

watch(() => props.todo.id, () => {
  title.value = props.todo.title
  note.value = props.todo.note
  newSubtask.value = ''
  newTag.value = ''
})
// 共享清单里别人改了，同步过来（自己正在编辑的字段除外）
watch(() => props.todo.title, (v) => {
  if (!titleFocused.value)
    title.value = v
})
watch(() => props.todo.note, (v) => {
  if (!noteFocused.value)
    note.value = v
})

function saveTitle() {
  titleFocused.value = false
  const v = title.value.replace(/\s+/g, ' ').trim()
  if (!v) {
    title.value = props.todo.title
    return
  }
  if (v !== props.todo.title)
    emit('update', { title: v })
}

function onNoteInput(e: any) {
  note.value = e.detail.value
  clearTimeout(noteTimer)
  noteTimer = setTimeout(saveNote, 800)
}

function saveNote() {
  clearTimeout(noteTimer)
  if (note.value !== props.todo.note)
    emit('update', { note: note.value })
}

onBeforeUnmount(() => {
  saveNote()
})

/* ---------------- 日期、时间、重复、提醒 ---------------- */

const due = computed(() => dueLabel(props.todo.dueDate, null, props.today))
const overdue = computed(() => isOverdue(props.todo, props.today))
const nextMonday = computed(() => addDays(props.today, ((8 - weekday(props.today)) % 7) || 7))

function setDate(date: string | null) {
  emit('update', date ? { dueDate: date } : { dueDate: null, dueTime: null, repeat: null, remind: null })
}

const repeatOpen = ref(false)
function openRepeat() {
  if (!props.todo.dueDate)
    emit('update', { dueDate: props.today })
  repeatOpen.value = true
}
function setRepeat(rule: RepeatRule | null) {
  emit('update', { repeat: rule, ...(props.todo.dueDate ? {} : { dueDate: props.today }) })
}

const remindLabels = REMIND_OPTIONS.map(o => o.label)
const remindIndex = computed(() => REMIND_OPTIONS.findIndex(o => o.value === props.todo.remind))
function setRemind(index: number) {
  const value = REMIND_OPTIONS[index]?.value ?? null
  emit('update', { remind: value, ...(props.todo.dueDate || value === null ? {} : { dueDate: props.today }) })
}

/* ---------------- 清单 ---------------- */

const listOptions = computed(() => [{ id: null as number | null, name: '收集箱' }, ...props.lists.map(l => ({ id: l.id as number | null, name: l.name }))])
const listIndex = computed(() => Math.max(0, listOptions.value.findIndex(l => l.id === props.todo.listId)))
const currentList = computed(() => props.lists.find(l => l.id === props.todo.listId))

/* ---------------- 标签 ---------------- */

function addTag() {
  const tag = newTag.value.replace(/[\s#＃]/g, '').slice(0, 20)
  newTag.value = ''
  if (!tag || props.todo.tags.includes(tag))
    return
  if (props.todo.tags.length >= 10)
    return uni.showToast({ title: '标签最多 10 个', icon: 'none' })
  emit('update', { tags: [...props.todo.tags, tag] })
}
function removeTag(tag: string) {
  emit('update', { tags: props.todo.tags.filter(t => t !== tag) })
}

/* ---------------- 子任务 ---------------- */

function saveSubtasks(list: ITodoSubtask[]) {
  emit('update', { subtasks: list })
}
function addSubtask() {
  const text = newSubtask.value.trim()
  newSubtask.value = ''
  if (!text)
    return
  if (props.todo.subtasks.length >= 50)
    return uni.showToast({ title: '子任务最多 50 个', icon: 'none' })
  saveSubtasks([...props.todo.subtasks, { id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text, done: false }])
}
function toggleSubtask(s: ITodoSubtask) {
  saveSubtasks(props.todo.subtasks.map(x => (x.id === s.id ? { ...x, done: !x.done } : x)))
}
function renameSubtask(s: ITodoSubtask, text: string) {
  const v = text.trim()
  if (!v)
    return removeSubtask(s)
  if (v !== s.text)
    saveSubtasks(props.todo.subtasks.map(x => (x.id === s.id ? { ...x, text: v } : x)))
}
function removeSubtask(s: ITodoSubtask) {
  saveSubtasks(props.todo.subtasks.filter(x => x.id !== s.id))
}

const createdText = computed(() => {
  const t = props.todo
  const by = t.createdBy !== props.me ? ` · ${props.personName(t.createdBy)} 创建` : ''
  const done = t.done && t.doneAt ? ` · ${dayjs(t.doneAt * 1000).format('MM-DD HH:mm')} ${t.doneBy && t.doneBy !== props.me ? `由 ${props.personName(t.doneBy)} ` : ''}完成` : ''
  return `创建于 ${dayjs(t.createdAt * 1000).format('YYYY-MM-DD HH:mm')}${by}${done}`
})
</script>

<template>
  <view class="ot-td">
    <view class="ot-td__head">
      <view
        class="ot-td__check" :style="{ borderColor: priorityHex(todo.priority), background: todo.done ? priorityHex(todo.priority) : '' }"
        @click="emit('toggle')"
      >
        <view v-if="todo.done" class="i-carbon-checkmark text-13px text-white" />
      </view>
      <textarea
        v-model="title" class="ot-td__title" :class="{ 'is-done': todo.done }" auto-height :maxlength="500"
        placeholder="待办内容" @focus="titleFocused = true" @blur="saveTitle" @confirm="saveTitle"
      />
      <view class="ot-td__close" @click="emit('close')">
        <view class="i-carbon-close" />
      </view>
    </view>

    <view class="ot-td__rows">
      <!-- 日期 -->
      <view class="ot-td__row">
        <view class="i-carbon-calendar ot-td__icon" />
        <picker mode="date" :value="todo.dueDate || today" @change="setDate($event.detail.value)">
          <text class="ot-td__value" :class="{ 'is-empty': !todo.dueDate, 'is-danger': overdue }">{{ todo.dueDate ? due : '设置日期' }}</text>
        </picker>
        <view class="flex-1" />
        <text class="ot-td__quick" @click="setDate(today)">今天</text>
        <text class="ot-td__quick" @click="setDate(addDays(today, 1))">明天</text>
        <text class="ot-td__quick" @click="setDate(nextMonday)">下周一</text>
        <view v-if="todo.dueDate" class="i-carbon-close ot-td__clear" @click="setDate(null)" />
      </view>

      <!-- 时间 -->
      <view v-if="todo.dueDate" class="ot-td__row">
        <view class="i-carbon-time ot-td__icon" />
        <picker mode="time" :value="todo.dueTime || '09:00'" @change="emit('update', { dueTime: $event.detail.value })">
          <text class="ot-td__value" :class="{ 'is-empty': !todo.dueTime }">{{ todo.dueTime || '设置时间（不设为全天）' }}</text>
        </picker>
        <view class="flex-1" />
        <view v-if="todo.dueTime" class="i-carbon-close ot-td__clear" @click="emit('update', { dueTime: null })" />
      </view>

      <!-- 重复 -->
      <view class="ot-td__row" @click="openRepeat">
        <view class="i-carbon-repeat ot-td__icon" />
        <text class="ot-td__value" :class="{ 'is-empty': !todo.repeat }">{{ describeRule(todo.repeat) }}</text>
        <view class="flex-1" />
        <view v-if="todo.repeat" class="i-carbon-close ot-td__clear" @click.stop="emit('update', { repeat: null })" />
      </view>

      <!-- 提醒 -->
      <view class="ot-td__row">
        <view class="i-carbon-notification ot-td__icon" />
        <picker :range="remindLabels" :value="Math.max(0, remindIndex)" @change="setRemind(Number($event.detail.value))">
          <text class="ot-td__value" :class="{ 'is-empty': todo.remind === null || !todo.dueDate }">{{ todo.dueDate ? remindLabel(todo.remind, !!todo.dueTime) : '设置提醒' }}</text>
        </picker>
      </view>

      <!-- 优先级 -->
      <view class="ot-td__row">
        <view class="i-carbon-flag ot-td__icon" />
        <view class="flex gap-1.5">
          <view
            v-for="p in PRIORITIES" :key="p.value" class="ot-td__prio" :class="{ 'is-active': todo.priority === p.value }"
            :style="{ '--c': p.hex }" @click="emit('update', { priority: p.value })"
          >
            {{ p.label }}
          </view>
        </view>
      </view>

      <!-- 清单 -->
      <view class="ot-td__row">
        <view class="i-carbon-list ot-td__icon" />
        <picker :range="listOptions" range-key="name" :value="listIndex" @change="emit('update', { listId: listOptions[Number($event.detail.value)].id })">
          <text class="ot-td__value">
            <text v-if="currentList" class="ot-td__dot" :style="{ background: colorHex(currentList.color) }" />{{ currentList?.name ?? '收集箱' }}
            <text v-if="currentList && currentList.members.length" class="i-carbon-user-multiple align-[-2px] ml-1 text-12px text-muted" />
          </text>
        </picker>
      </view>

      <!-- 标签 -->
      <view class="ot-td__row is-wrap">
        <view class="i-carbon-tag ot-td__icon" />
        <view v-for="tag in todo.tags" :key="tag" class="ot-td__tag">
          #{{ tag }}
          <view class="i-carbon-close text-11px" @click="removeTag(tag)" />
        </view>
        <input v-model="newTag" class="ot-td__tag-input" placeholder="添加标签" :maxlength="20" confirm-type="done" @confirm="addTag" @blur="addTag">
      </view>
    </view>

    <!-- 子任务 -->
    <view class="ot-td__section">
      <text class="ot-td__section-title">子任务 {{ todo.subtasks.length ? `${todo.subtasks.filter(s => s.done).length}/${todo.subtasks.length}` : '' }}</text>
      <view v-for="s in todo.subtasks" :key="s.id" class="ot-td__sub">
        <view class="ot-td__sub-check" :class="{ 'is-done': s.done }" @click="toggleSubtask(s)">
          <view v-if="s.done" class="i-carbon-checkmark text-10px text-white" />
        </view>
        <input :value="s.text" class="ot-td__sub-text" :class="{ 'is-done': s.done }" :maxlength="300" @blur="renameSubtask(s, $event.detail.value)" @confirm="renameSubtask(s, $event.detail.value)">
        <view class="i-carbon-close ot-td__clear" @click="removeSubtask(s)" />
      </view>
      <view class="ot-td__sub">
        <view class="i-carbon-add text-14px text-muted" />
        <input v-model="newSubtask" class="ot-td__sub-text" placeholder="添加子任务，回车确认" :maxlength="300" confirm-type="done" :confirm-hold="true" @confirm="addSubtask">
      </view>
    </view>

    <!-- 备注 -->
    <view class="ot-td__section">
      <text class="ot-td__section-title">备注</text>
      <textarea
        :value="note" class="ot-td__note" auto-height :maxlength="5000" placeholder="添加备注"
        @input="onNoteInput" @focus="noteFocused = true" @blur="noteFocused = false; saveNote()"
      />
    </view>

    <view class="ot-td__foot">
      <text class="min-w-0 flex-1">{{ createdText }}</text>
      <view v-if="!todo.done && canFocus" class="ot-td__action" @click="emit('focus')">
        <view class="i-carbon-timer" />专注
      </view>
      <view class="ot-td__action is-danger" @click="emit('remove')">
        <view class="i-carbon-trash-can" />删除
      </view>
    </view>

    <repeat-picker v-model:open="repeatOpen" :model-value="todo.repeat" :due-date="todo.dueDate || today" @update:model-value="setRepeat" />
  </view>
</template>

<style lang="scss" scoped>
.ot-td {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ot-td__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.ot-td__check {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 20px;
  height: 20px;
  margin-top: 4px;
  border: 2px solid;
  border-radius: 50%;
  cursor: pointer;
}

.ot-td__title {
  flex: 1;
  min-width: 0;
  min-height: 28px;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.6;
  color: var(--ot-text);

  &.is-done {
    color: var(--ot-text-3);
    text-decoration: line-through;
  }
}

.ot-td__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  font-size: 18px;
  color: var(--ot-text-3);
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
  }
}

.ot-td__rows {
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: var(--ot-fill);
}

.ot-td__row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 4px 12px;
  font-size: 13px;
  cursor: pointer;

  & + & {
    border-top: 1px solid var(--ot-border);
  }

  &.is-wrap {
    flex-wrap: wrap;
    row-gap: 6px;
    padding-top: 8px;
    padding-bottom: 8px;
  }
}

.ot-td__icon {
  flex-shrink: 0;
  font-size: 16px;
  color: var(--ot-text-3);
}

.ot-td__value {
  white-space: nowrap;
  color: var(--ot-text);

  &.is-empty {
    color: var(--ot-text-3);
  }

  &.is-danger {
    color: #ef4444;
  }
}

.ot-td__quick {
  flex-shrink: 0;
  white-space: nowrap;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--ot-text-2);
  background: var(--ot-card);

  &:hover {
    color: var(--wot-color-theme);
  }
}

.ot-td__clear {
  flex-shrink: 0;
  font-size: 14px;
  color: var(--ot-text-3);
  cursor: pointer;

  &:hover {
    color: #ef4444;
  }
}

.ot-td__prio {
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--c);
  border: 1px solid var(--c);

  &.is-active {
    color: #fff;
    background: var(--c);
  }
}

.ot-td__dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border-radius: 50%;
}

.ot-td__tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--wot-color-theme);
  background: rgba(79, 110, 247, 0.1);
}

.ot-td__tag-input {
  flex: 1;
  min-width: 80px;
  font-size: 13px;
  color: var(--ot-text);
}

.ot-td__section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ot-td__section-title {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ot-text-3);
}

.ot-td__sub {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 4px;
  border-radius: 8px;

  &:hover {
    background: var(--ot-fill);
  }
}

.ot-td__sub-check {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 15px;
  height: 15px;
  border: 1.5px solid var(--ot-text-3);
  border-radius: 4px;
  cursor: pointer;

  &.is-done {
    border-color: var(--wot-color-theme);
    background: var(--wot-color-theme);
  }
}

.ot-td__sub-text {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--ot-text);

  &.is-done {
    color: var(--ot-text-3);
    text-decoration: line-through;
  }
}

.ot-td__note {
  box-sizing: border-box;
  width: 100%;
  min-height: 80px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--ot-text);
  background: var(--ot-fill);
}

.ot-td__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  padding-top: 10px;
  border-top: 1px solid var(--ot-border);
  font-size: 12px;
  color: var(--ot-text-3);
}

.ot-td__action {
  display: flex;
  align-items: center;
  gap: 3px;
  color: var(--ot-text-2);
  cursor: pointer;

  &:hover {
    color: var(--wot-color-theme);
  }

  &.is-danger:hover {
    color: #ef4444;
  }
}
</style>
