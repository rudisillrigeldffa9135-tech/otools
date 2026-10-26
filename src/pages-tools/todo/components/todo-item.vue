<script lang="ts" setup>
// 待办列表的一行：完成勾选框（颜色表示优先级）、标题、日期 / 重复 / 提醒 / 子任务 / 标签 / 清单等信息
import type { ITodo } from '@/api/todo'
import { priorityHex } from '../colors'
import { dueLabel, isOverdue } from '../views'

const props = defineProps<{
  todo: ITodo
  today: string
  /** 智能视图里显示所在清单 */
  listName?: string
  listColor?: string
  /** 共享清单里别人创建的，显示创建者 */
  creator?: string
  active?: boolean
  /** 手动排序时显示拖动把手 */
  draggable?: boolean
}>()

const emit = defineEmits<{
  toggle: []
  open: []
  dragstart: [e: PointerEvent]
}>()

const overdue = computed(() => isOverdue(props.todo, props.today))
const due = computed(() => dueLabel(props.todo.dueDate, props.todo.dueTime, props.today))
const subDone = computed(() => props.todo.subtasks.filter(s => s.done).length)
</script>

<template>
  <view class="ot-ti" :class="{ 'is-done': todo.done, 'is-active': active }" @click="emit('open')">
    <!-- #ifdef H5 -->
    <view v-if="draggable" class="ot-ti__handle" title="拖动排序" @click.stop @pointerdown.stop.prevent="emit('dragstart', $event as PointerEvent)">
      <view class="i-carbon-draggable" />
    </view>
    <!-- #endif -->
    <view
      class="ot-ti__check" :style="{ borderColor: priorityHex(todo.priority), background: todo.done ? priorityHex(todo.priority) : '' }"
      :title="todo.done ? '标记为未完成' : '完成'" @click.stop="emit('toggle')"
    >
      <view v-if="todo.done" class="i-carbon-checkmark text-12px text-white" />
    </view>
    <view class="min-w-0 flex-1">
      <text class="ot-ti__title">{{ todo.title }}</text>
      <view v-if="due || todo.repeat || todo.remind !== null || todo.subtasks.length || todo.note || todo.tags.length || listName || creator" class="ot-ti__meta">
        <text v-if="due" :class="{ 'is-overdue': overdue }">
          <text class="i-carbon-calendar ot-ti__icon" />{{ due }}
        </text>
        <text v-if="todo.repeat" class="i-carbon-repeat ot-ti__icon" title="重复" />
        <text v-if="todo.remind !== null && todo.dueDate" class="i-carbon-notification ot-ti__icon" title="提醒" />
        <text v-if="todo.subtasks.length">
          <text class="i-carbon-list-checked ot-ti__icon" />{{ subDone }}/{{ todo.subtasks.length }}
        </text>
        <text v-if="todo.note" class="i-carbon-document ot-ti__icon" title="有备注" />
        <text v-for="tag in todo.tags" :key="tag" class="ot-ti__tag">#{{ tag }}</text>
        <text v-if="listName" class="ot-ti__list">
          <text class="ot-ti__dot" :style="{ background: listColor }" />{{ listName }}
        </text>
        <text v-if="creator" class="ot-ti__creator">{{ creator }}</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.ot-ti {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 10px;
  border-radius: 10px;
  cursor: pointer;
  user-select: none;

  &:hover {
    background: var(--ot-fill);
  }

  &.is-active {
    background: rgba(79, 110, 247, 0.08);
  }

  &.is-done .ot-ti__title {
    color: var(--ot-text-3);
    text-decoration: line-through;
  }
}

.ot-ti__handle {
  display: flex;
  align-items: center;
  height: 20px;
  margin: 0 -4px 0 -6px;
  font-size: 15px;
  color: var(--ot-text-3);
  cursor: grab;
  touch-action: none;
}

.ot-ti__check {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border: 2px solid;
  border-radius: 50%;
  transition: background 0.15s;
}

.ot-ti__title {
  display: block;
  font-size: 14px;
  line-height: 22px;
  color: var(--ot-text);
  word-break: break-word;
}

.ot-ti__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 10px;
  margin-top: 2px;
  font-size: 12px;
  color: var(--ot-text-3);

  .is-overdue {
    color: #ef4444;
  }
}

.ot-ti__icon {
  display: inline-block;
  margin-right: 2px;
  vertical-align: -2px;
  font-size: 12px;
}

.ot-ti__tag {
  color: var(--wot-color-theme);
}

.ot-ti__list {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ot-ti__dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.ot-ti__creator {
  padding: 0 5px;
  border-radius: 4px;
  background: var(--ot-fill);
}
</style>
