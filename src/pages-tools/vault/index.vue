<script lang="ts" setup>
import type { IVaultForm, IVaultItem, IVaultSummary } from '@/api/vault'
import dayjs from 'dayjs'
import { createVaultItem, deleteVaultItem, getVaultItem, listVault, updateVaultItem } from '@/api/vault'
import { copyText, getRandomInts, toast } from '@/utils/common'

definePage({
  style: { navigationBarTitleText: '密码管理' },
})

const list = ref<IVaultSummary[]>([])
const loading = ref(false)
const keyword = ref('')
/** 已获取的明细（含密码），只保存在内存中 */
const details = reactive(new Map<number, IVaultItem>())
const expandedId = ref<number>()
const revealedIds = reactive(new Set<number>())
/** 当前展开条目的明细（同一时间只展开一条） */
const current = computed(() => (expandedId.value ? details.get(expandedId.value) : undefined))

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw)
    return list.value
  return list.value.filter(item => [item.name, item.url, item.username].some(s => s.toLowerCase().includes(kw)))
})

async function load() {
  loading.value = true
  try {
    list.value = await listVault()
  }
  finally {
    loading.value = false
  }
}

onLoad(load)
onUnload(() => details.clear())

async function fetchDetail(id: number, force = false) {
  if (force || !details.has(id))
    details.set(id, await getVaultItem(id))
  return details.get(id)!
}

async function toggleExpand(item: IVaultSummary) {
  if (expandedId.value === item.id) {
    expandedId.value = undefined
    return
  }
  expandedId.value = item.id
  await fetchDetail(item.id).catch(() => {})
}

function toggleReveal(id: number) {
  revealedIds.has(id) ? revealedIds.delete(id) : revealedIds.add(id)
}

/* ---------------- 展示辅助 ---------------- */

const AVATAR_COLORS = ['#4f6ef7', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#0ea5e9', '#ec4899', '#14b8a6']

function avatarColor(name: string) {
  let h = 0
  for (const ch of name)
    h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function normalizeUrl(url: string) {
  if (!url)
    return ''
  return /^[a-z][\w+.-]*:\/\//i.test(url) ? url : `https://${url}`
}

function hostOf(url: string) {
  const m = normalizeUrl(url).match(/^[a-z][\w+.-]*:\/\/([^/?#]+)/i)
  return m ? m[1] : url
}

function formatTime(ts: number) {
  return dayjs(ts * 1000).format('YYYY-MM-DD HH:mm')
}

function openUrl(url: string) {
  const full = normalizeUrl(url)
  // #ifdef H5
  if (/^https?:\/\//i.test(full)) {
    window.open(full, '_blank', 'noopener,noreferrer')
    return
  }
  // #endif
  copyText(full)
}

/* ---------------- 新增 / 编辑 ---------------- */

const showForm = ref(false)
const saving = ref(false)
const editingId = ref<number>()
const showFormPassword = ref(false)
const form = reactive<IVaultForm>({ name: '', url: '', username: '', password: '', notes: '' })

function resetForm(data?: Partial<IVaultForm>) {
  Object.assign(form, { name: '', url: '', username: '', password: '', notes: '' }, data)
}

function openCreate() {
  editingId.value = undefined
  showFormPassword.value = false
  resetForm()
  showForm.value = true
}

async function openEdit(id: number) {
  const item = await fetchDetail(id)
  editingId.value = id
  showFormPassword.value = false
  resetForm(item)
  showForm.value = true
}

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+?'

async function generatePassword() {
  const idx = await getRandomInts(16, CHARSET.length)
  form.password = idx.map(i => CHARSET[i]).join('')
  showFormPassword.value = true
}

async function save() {
  if (!form.name.trim())
    return toast('请填写网站名称')
  saving.value = true
  try {
    const data = { ...form, name: form.name.trim(), url: form.url.trim() }
    if (editingId.value) {
      await updateVaultItem(editingId.value, data)
      details.delete(editingId.value)
      if (expandedId.value === editingId.value)
        await fetchDetail(editingId.value)
    }
    else {
      await createVaultItem(data)
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

function remove(item: IVaultSummary) {
  uni.showModal({
    title: '删除确认',
    content: `确定删除「${item.name}」吗？删除后无法恢复。`,
    confirmColor: '#ef4444',
    success: async ({ confirm }) => {
      if (!confirm)
        return
      await deleteVaultItem(item.id)
      details.delete(item.id)
      list.value = list.value.filter(i => i.id !== item.id)
      toast('已删除', 'success')
    },
  })
}
</script>

<template>
  <ot-tool-layout>
    <ot-panel>
      <view class="flex items-center gap-2">
        <view class="ot-vault__search">
          <view class="i-carbon-search text-15px text-muted" />
          <input v-model="keyword" class="min-w-0 flex-1 text-14px" placeholder="搜索网站、网址或账号">
        </view>
        <wd-button icon="add" @click="openCreate">
          新增
        </wd-button>
      </view>
      <view class="mt-2 text-12px text-muted">
        共 {{ list.length }} 条 · 密码与备注在服务端加密存储，仅本人账号可查看
      </view>
    </ot-panel>

    <view v-if="loading && !list.length" class="py-10 text-center text-13px text-muted">
      加载中…
    </view>

    <ot-panel v-else-if="!filtered.length">
      <view class="flex flex-col items-center gap-3 py-8">
        <view class="i-carbon-password text-40px text-muted" />
        <text class="text-13px text-muted">{{ keyword ? '没有匹配的条目' : '还没有保存任何账号' }}</text>
        <wd-button v-if="!keyword" size="small" plain @click="openCreate">
          添加第一条
        </wd-button>
      </view>
    </ot-panel>

    <view v-for="item in filtered" :key="item.id" class="ot-vault__item">
      <view class="flex cursor-pointer items-center gap-3" @click="toggleExpand(item)">
        <view class="ot-vault__avatar" :style="{ backgroundColor: avatarColor(item.name) }">
          {{ item.name.slice(0, 1).toUpperCase() }}
        </view>
        <view class="min-w-0 flex-1">
          <view class="truncate text-15px text-main font-500">
            {{ item.name }}
          </view>
          <view class="truncate text-12px text-muted">
            {{ [item.username, item.url && hostOf(item.url)].filter(Boolean).join(' · ') || '—' }}
          </view>
        </view>
        <view
          v-if="item.username" class="i-carbon-user-follow shrink-0 p-1 text-17px text-muted"
          title="复制账号" @click.stop="copyText(item.username)"
        />
        <view
          class="shrink-0 text-18px text-muted transition-transform"
          :class="expandedId === item.id ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down'"
        />
      </view>

      <view v-if="expandedId === item.id" class="mt-3">
        <view v-if="!current" class="py-3 text-center text-13px text-muted">
          加载中…
        </view>
        <template v-else>
          <view class="ot-vault__row">
            <text class="ot-vault__label">账号</text>
            <text class="ot-mono min-w-0 flex-1 break-all" user-select selectable>{{ current.username || '—' }}</text>
            <view class="i-carbon-copy ot-vault__btn" @click="copyText(current.username)" />
          </view>
          <view class="ot-vault__row">
            <text class="ot-vault__label">密码</text>
            <text class="ot-mono min-w-0 flex-1 break-all" user-select selectable>
              {{ revealedIds.has(item.id) ? (current.password || '—') : (current.password ? '••••••••••' : '—') }}
            </text>
            <view
              class="ot-vault__btn" :class="revealedIds.has(item.id) ? 'i-carbon-view-off' : 'i-carbon-view'"
              @click="toggleReveal(item.id)"
            />
            <view class="i-carbon-copy ot-vault__btn" @click="copyText(current.password)" />
          </view>
          <view v-if="item.url" class="ot-vault__row">
            <text class="ot-vault__label">网址</text>
            <text class="min-w-0 flex-1 break-all" user-select selectable>{{ item.url }}</text>
            <view class="i-carbon-launch ot-vault__btn" @click="openUrl(item.url)" />
          </view>
          <view v-if="current.notes" class="ot-vault__row items-start!">
            <text class="ot-vault__label">备注</text>
            <text class="min-w-0 flex-1 whitespace-pre-wrap break-all" user-select selectable>{{ current.notes }}</text>
          </view>
          <view class="mt-3 flex items-center gap-2">
            <text class="flex-1 text-12px text-muted">更新于 {{ formatTime(item.updatedAt) }}</text>
            <wd-button size="small" type="info" plain @click="remove(item)">
              删除
            </wd-button>
            <wd-button size="small" @click="openEdit(item.id)">
              编辑
            </wd-button>
          </view>
        </template>
      </view>
    </view>

    <wd-popup
      v-model="showForm" position="center" :z-index="1000" closable
      custom-style="width: 92vw; max-width: 480px; border-radius: 16px;"
    >
      <view class="ot-vault__form">
        <view class="mb-4 text-16px text-main font-600">
          {{ editingId ? '编辑账号' : '新增账号' }}
        </view>
        <view class="ot-vault__field-label">
          网站名称 <text class="text-red-500">*</text>
        </view>
        <view class="ot-vault__field">
          <input v-model="form.name" class="flex-1" placeholder="如：GitHub" :maxlength="100">
        </view>
        <view class="ot-vault__field-label">
          网址
        </view>
        <view class="ot-vault__field">
          <input v-model="form.url" class="flex-1" placeholder="如：https://github.com" :maxlength="500">
        </view>
        <view class="ot-vault__field-label">
          账号
        </view>
        <view class="ot-vault__field">
          <input v-model="form.username" class="flex-1" placeholder="用户名 / 邮箱 / 手机号" :maxlength="200">
        </view>
        <view class="ot-vault__field-label">
          密码
        </view>
        <view class="ot-vault__field">
          <input
            v-model="form.password" class="ot-mono min-w-0 flex-1" placeholder="密码"
            :password="!showFormPassword" :maxlength="1000"
          >
          <view
            class="ot-vault__btn" :class="showFormPassword ? 'i-carbon-view-off' : 'i-carbon-view'"
            @click="showFormPassword = !showFormPassword"
          />
          <view class="i-carbon-renew ot-vault__btn" title="生成随机密码" @click="generatePassword" />
        </view>
        <view class="ot-vault__field-label">
          备注
        </view>
        <view class="ot-vault__field">
          <textarea
            v-model="form.notes" class="h-72px flex-1 py-2" placeholder="密保问题、恢复码等（加密保存）"
            :maxlength="5000"
          />
        </view>
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
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-vault__search {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  background: var(--ot-fill);
  color: var(--ot-text);
}

.ot-vault__item {
  padding: 14px 16px;
  border-radius: 14px;
  background: var(--ot-card);
  border: 1px solid var(--ot-border);
}

.ot-vault__avatar {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  color: #fff;
  font-weight: 600;
  font-size: 17px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ot-vault__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 10px;
  background: var(--ot-fill);
  font-size: 13px;
  color: var(--ot-text);

  & + & {
    margin-top: 8px;
  }
}

.ot-vault__label {
  flex-shrink: 0;
  width: 40px;
  color: var(--ot-text-3);
}

.ot-vault__btn {
  flex-shrink: 0;
  padding: 4px;
  font-size: 16px;
  color: var(--ot-text-3);
  cursor: pointer;

  &:hover {
    color: var(--ot-text);
  }
}

.ot-vault__form {
  box-sizing: border-box;
  padding: 20px;
  max-height: 85vh;
  overflow-y: auto;
  background: var(--ot-card);
  color: var(--ot-text);
}

.ot-vault__field-label {
  margin: 12px 0 6px;
  font-size: 13px;
  color: var(--ot-text-2);
}

.ot-vault__field {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  background: var(--ot-fill);
  font-size: 14px;

  textarea {
    width: 100%;
    font-size: 14px;
  }
}
</style>
