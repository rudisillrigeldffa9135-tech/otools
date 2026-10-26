<script lang="ts" setup>
// 清单设置：新建 / 改名 / 颜色；共享成员（创建者可按用户名邀请、移除，成员可退出）；删除清单
import type { ITodoList } from '@/api/todo'
import { addTodoListMember, createTodoList, deleteTodoList, removeTodoListMember, updateTodoList } from '@/api/todo'
import { toast } from '@/utils/common'
import { LIST_COLORS } from '../colors'

const props = defineProps<{
  /** 为空表示新建 */
  list?: ITodoList | null
  me: number
}>()

const emit = defineEmits<{
  saved: [list: ITodoList]
  /** 清单被删除，或自己退出了 */
  removed: [id: number]
}>()

const open = defineModel<boolean>({ required: true })

const name = ref('')
const color = ref('')
const username = ref('')
const saving = ref(false)
const inviting = ref(false)

const isOwner = computed(() => !props.list || props.list.isOwner)

watch(open, (v) => {
  if (!v)
    return
  name.value = props.list?.name ?? ''
  color.value = props.list?.color ?? ''
  username.value = ''
})

async function save() {
  const n = name.value.trim()
  if (!n)
    return toast('请填写清单名称')
  saving.value = true
  try {
    const list = props.list
      ? await updateTodoList(props.list.id, { name: n, color: color.value })
      : await createTodoList(n, color.value)
    emit('saved', list)
    if (!props.list)
      open.value = false
    else
      toast('已保存', 'success')
  }
  catch {}
  finally {
    saving.value = false
  }
}

async function invite() {
  const u = username.value.trim()
  if (!u || !props.list)
    return
  inviting.value = true
  try {
    emit('saved', await addTodoListMember(props.list.id, u))
    username.value = ''
    toast('已添加，对方刷新后即可看到这个清单', 'success')
  }
  catch {}
  finally {
    inviting.value = false
  }
}

function removeMember(userId: number, nickname: string) {
  const list = props.list
  if (!list)
    return
  const self = userId === props.me
  uni.showModal({
    title: self ? '退出清单' : '移除成员',
    content: self ? `退出「${list.name}」后将看不到其中的待办，确定退出吗？` : `把 ${nickname} 移出「${list.name}」？对方将看不到这个清单。`,
    confirmColor: '#ef4444',
    success: async ({ confirm }) => {
      if (!confirm)
        return
      await removeTodoListMember(list.id, userId)
      if (self) {
        emit('removed', list.id)
        open.value = false
      }
      else {
        emit('saved', { ...list, members: list.members.filter(m => m.id !== userId) })
      }
    },
  })
}

function remove() {
  const list = props.list
  if (!list)
    return
  uni.showModal({
    title: '删除清单',
    content: `删除「${list.name}」及其中的全部待办${list.members.length ? '，所有成员都将看不到' : ''}，删除后无法恢复。`,
    confirmColor: '#ef4444',
    success: async ({ confirm }) => {
      if (!confirm)
        return
      await deleteTodoList(list.id)
      emit('removed', list.id)
      open.value = false
      toast('已删除', 'success')
    },
  })
}
</script>

<template>
  <wd-popup v-model="open" position="center" :z-index="1100" custom-style="border-radius: 16px; width: min(92vw, 420px);">
    <view class="ot-ls">
      <view class="flex items-center gap-2">
        <view class="i-carbon-list text-18px text-[var(--wot-color-theme)]" />
        <text class="flex-1 text-16px text-main font-600">{{ list ? '清单设置' : '新建清单' }}</text>
        <view class="i-carbon-close cursor-pointer text-18px text-muted" @click="open = false" />
      </view>

      <template v-if="isOwner">
        <view class="ot-ls__input mt-4">
          <input v-model="name" class="min-w-0 flex-1 text-14px" placeholder="清单名称，如：工作、家庭、购物" :maxlength="30" confirm-type="done" @confirm="save">
        </view>
        <view class="mt-3 flex flex-wrap gap-2">
          <view
            v-for="c in LIST_COLORS" :key="c.value" class="ot-ls__color" :class="{ 'is-active': color === c.value }"
            :style="{ background: c.hex }" :title="c.label" @click="color = c.value"
          >
            <view v-if="color === c.value" class="i-carbon-checkmark text-12px text-white" />
          </view>
        </view>
        <wd-button block custom-class="mt-4" :loading="saving" @click="save">
          {{ list ? '保存' : '创建' }}
        </wd-button>
      </template>
      <view v-else class="mt-3 text-13px text-sub">
        「{{ list?.name }}」由 {{ list?.owner.nickname || list?.owner.username }} 创建并共享给你，你可以查看、添加和编辑其中的待办。
      </view>

      <!-- 共享成员 -->
      <template v-if="list">
        <view class="ot-ls__section">
          <text class="ot-ls__title">共享成员</text>
          <view class="ot-ls__member">
            <view class="ot-ls__avatar">
              {{ (list.owner.nickname || list.owner.username).slice(0, 1) }}
            </view>
            <text class="min-w-0 flex-1 truncate">{{ list.owner.nickname || list.owner.username }} <text class="text-12px text-muted">@{{ list.owner.username }}</text></text>
            <text class="text-12px text-muted">创建者</text>
          </view>
          <view v-for="m in list.members" :key="m.id" class="ot-ls__member">
            <view class="ot-ls__avatar">
              {{ (m.nickname || m.username).slice(0, 1) }}
            </view>
            <text class="min-w-0 flex-1 truncate">{{ m.nickname || m.username }} <text class="text-12px text-muted">@{{ m.username }}</text></text>
            <text v-if="isOwner" class="ot-ls__link is-danger" @click="removeMember(m.id, m.nickname || m.username)">移除</text>
            <text v-else-if="m.id === me" class="ot-ls__link is-danger" @click="removeMember(m.id, m.nickname || m.username)">退出</text>
          </view>
          <view v-if="isOwner" class="mt-2 flex items-center gap-2">
            <view class="ot-ls__input flex-1">
              <input v-model="username" class="min-w-0 flex-1 text-14px" placeholder="输入对方的用户名" :maxlength="32" confirm-type="done" @confirm="invite">
            </view>
            <wd-button size="small" :loading="inviting" @click="invite">
              邀请
            </wd-button>
          </view>
          <text class="mt-2 block text-12px text-muted leading-18px">
            成员可以查看、添加、编辑和完成清单里的待办；只有创建者可以改名、管理成员和删除清单。
          </text>
        </view>
        <view v-if="isOwner" class="mt-4 text-center">
          <text class="ot-ls__link is-danger" @click="remove">删除清单</text>
        </view>
      </template>
    </view>
  </wd-popup>
</template>

<style lang="scss" scoped>
.ot-ls {
  padding: 18px;
  font-size: 14px;
  color: var(--ot-text);
}

.ot-ls__input {
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  background: var(--ot-fill);
}

.ot-ls__color {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;

  &.is-active {
    box-shadow:
      0 0 0 2px var(--ot-card),
      0 0 0 4px var(--wot-color-theme);
  }
}

.ot-ls__section {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--ot-border);
}

.ot-ls__title {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ot-text-3);
}

.ot-ls__member {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
}

.ot-ls__avatar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #4f6ef7, #8b5cf6);
}

.ot-ls__link {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--wot-color-theme);
  cursor: pointer;

  &.is-danger {
    color: #ef4444;
  }
}
</style>
