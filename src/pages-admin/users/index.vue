<script lang="ts" setup>
import type { IAdminUser, Role } from '@/api/admin'
import dayjs from 'dayjs'
import { createUser, deleteUser, listUsers, updateUser } from '@/api/admin'
import { useUserStore } from '@/store/user'
import { toast } from '@/utils/common'

definePage({
  style: { navigationBarTitleText: '用户管理' },
})

const userStore = useUserStore()
const users = ref<IAdminUser[]>([])
const loading = ref(false)

const roleOptions: { value: Role, label: string }[] = [
  { value: 'user', label: '普通用户' },
  { value: 'admin', label: '管理员' },
]

async function load() {
  loading.value = true
  try {
    users.value = await listUsers()
  }
  finally {
    loading.value = false
  }
}

onLoad(load)

function isSelf(u: IAdminUser) {
  return u.id === userStore.userInfo.userId
}

/* ---------------- 新建 / 编辑 ---------------- */

const showForm = ref(false)
const saving = ref(false)
const editing = ref<IAdminUser>()
const form = reactive({ username: '', nickname: '', password: '', role: 'user' as Role, disabled: false })

function openCreate() {
  editing.value = undefined
  Object.assign(form, { username: '', nickname: '', password: '', role: 'user', disabled: false })
  showForm.value = true
}

function openEdit(u: IAdminUser) {
  editing.value = u
  Object.assign(form, { username: u.username, nickname: u.nickname, password: '', role: u.role, disabled: u.disabled })
  showForm.value = true
}

async function save() {
  if (form.password && form.password.length < 8)
    return toast('密码至少 8 位')
  saving.value = true
  try {
    if (editing.value) {
      await updateUser(editing.value.id, {
        nickname: form.nickname.trim(),
        // 自己的角色与状态不可修改，不提交避免服务端拒绝
        ...(isSelf(editing.value) ? {} : { role: form.role, disabled: form.disabled }),
        ...(form.password ? { password: form.password } : {}),
      })
    }
    else {
      if (!form.username.trim() || !form.password)
        return toast('请填写用户名和密码')
      await createUser({ username: form.username.trim(), nickname: form.nickname.trim(), password: form.password, role: form.role })
    }
    showForm.value = false
    toast('已保存', 'success')
    await load()
  }
  catch {
    // 错误提示已由 http 层弹出
  }
  finally {
    saving.value = false
  }
}

function remove(u: IAdminUser) {
  uni.showModal({
    title: '删除用户',
    content: `确定删除「${u.username}」吗？该用户的 ${u.itemCount} 条密码库数据和 ${u.linkCount} 个短链接将一并删除，且无法恢复。`,
    confirmColor: '#ef4444',
    success: async ({ confirm }) => {
      if (!confirm)
        return
      await deleteUser(u.id)
      users.value = users.value.filter(i => i.id !== u.id)
      toast('已删除', 'success')
    },
  })
}
</script>

<template>
  <view class="ot-container flex flex-col gap-3 pb-8 pt-4 md:pt-6" style="max-width: 960px">
    <ot-panel :title="`用户 · ${users.length}`">
      <template #extra>
        <wd-button size="small" icon="add" @click="openCreate">
          新建用户
        </wd-button>
      </template>

      <view v-if="loading && !users.length" class="py-6 text-center text-13px text-muted">
        加载中…
      </view>

      <view v-for="u in users" :key="u.id" class="ot-user">
        <view class="ot-user__avatar">
          {{ (u.nickname || u.username).slice(0, 1).toUpperCase() }}
        </view>
        <view class="min-w-0 flex-1">
          <view class="flex flex-wrap items-center gap-1.5">
            <text class="text-14px text-main font-500">{{ u.nickname || u.username }}</text>
            <wd-tag v-if="u.role === 'admin'" type="primary" plain>
              管理员
            </wd-tag>
            <wd-tag v-if="u.disabled" type="danger" plain>
              已禁用
            </wd-tag>
            <wd-tag v-if="isSelf(u)" plain>
              我
            </wd-tag>
          </view>
          <view class="mt-2px truncate text-12px text-muted">
            @{{ u.username }} · {{ u.itemCount }} 条密码 · {{ u.linkCount }} 个短链 · 创建于 {{ dayjs(u.createdAt * 1000).format('YYYY-MM-DD') }}
          </view>
        </view>
        <view class="i-carbon-edit ot-user__btn" title="编辑" @click="openEdit(u)" />
        <view v-if="!isSelf(u)" class="i-carbon-trash-can ot-user__btn hover:text-red-500!" title="删除" @click="remove(u)" />
      </view>
    </ot-panel>

    <view class="px-1 text-12px text-muted leading-20px">
      管理员可创建、禁用、删除用户和重置密码，但无法查看任何用户的密码库内容。禁用或重置密码会让该用户所有设备立即下线。
    </view>

    <wd-popup
      v-model="showForm" position="center" :z-index="1000" closable
      custom-style="width: 92vw; max-width: 440px; border-radius: 16px;"
    >
      <view class="ot-user-form">
        <view class="mb-4 text-16px text-main font-600">
          {{ editing ? `编辑用户 @${editing.username}` : '新建用户' }}
        </view>

        <template v-if="!editing">
          <view class="ot-user-form__label">
            用户名 <text class="text-red-500">*</text>
          </view>
          <view class="ot-user-form__field">
            <input v-model="form.username" class="flex-1" placeholder="3~32 位字母、数字、_ . -" :maxlength="32">
          </view>
        </template>

        <view class="ot-user-form__label">
          昵称
        </view>
        <view class="ot-user-form__field">
          <input v-model="form.nickname" class="flex-1" placeholder="可选" :maxlength="32">
        </view>

        <view class="ot-user-form__label">
          {{ editing ? '重置密码' : '密码' }} <text v-if="!editing" class="text-red-500">*</text>
        </view>
        <view class="ot-user-form__field">
          <input v-model="form.password" class="flex-1" password :placeholder="editing ? '留空则不修改' : '至少 8 位'" :maxlength="128">
        </view>

        <template v-if="!editing || !isSelf(editing)">
          <view class="ot-user-form__label">
            角色
          </view>
          <ot-segmented v-model="form.role" :options="roleOptions" />

          <view v-if="editing" class="mt-4 flex items-center justify-between">
            <text class="text-13px text-sub">禁用账号</text>
            <wd-switch v-model="form.disabled" size="20px" />
          </view>
        </template>

        <view class="mt-5 flex justify-end gap-2">
          <wd-button type="info" plain @click="showForm = false">
            取消
          </wd-button>
          <wd-button :loading="saving" @click="save">
            保存
          </wd-button>
        </view>
      </view>
    </wd-popup>
  </view>
</template>

<style lang="scss" scoped>
.ot-user {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;

  & + & {
    border-top: 1px solid var(--ot-border);
  }
}

.ot-user__avatar {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--ot-fill);
  color: var(--ot-text-2);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ot-user__btn {
  flex-shrink: 0;
  padding: 6px;
  font-size: 17px;
  color: var(--ot-text-3);
  cursor: pointer;

  &:hover {
    color: var(--ot-text);
  }
}

.ot-user-form {
  box-sizing: border-box;
  padding: 20px;
  background: var(--ot-card);
  color: var(--ot-text);
}

.ot-user-form__label {
  margin: 12px 0 6px;
  font-size: 13px;
  color: var(--ot-text-2);
}

.ot-user-form__field {
  display: flex;
  align-items: center;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  background: var(--ot-fill);
  font-size: 14px;
}
</style>
