<script lang="ts" setup>
import type { SiteGroup } from './utils'
import type { IVaultForm, IVaultItem, IVaultSummary } from '@/api/vault'
import dayjs from 'dayjs'
import { createVaultItem, deleteVaultItem, getVaultItem, listVault, updateVaultItem } from '@/api/vault'
import { copyText, getRandomInts, toast } from '@/utils/common'
import { formatCode, parseTotp, totp } from './totp'
import { findDuplicate, groupBySite, hostOf, matchKeyword, normalizeUrl, passwordStrength } from './utils'

definePage({
  style: { navigationBarTitleText: '密码管理' },
})

const list = ref<IVaultSummary[]>([])
const loading = ref(false)
const keyword = ref('')
/** 已获取的明细（含密码），只保存在内存中，离开页面即清空 */
const details = reactive(new Map<number, IVaultItem>())
const expandedId = ref<number>()
const revealedIds = reactive(new Set<number>())
/** 当前展开条目的明细（同一时间只展开一条） */
const current = computed(() => (expandedId.value ? details.get(expandedId.value) : undefined))

const groups = computed(() => groupBySite(list.value.filter(i => matchKeyword(i, keyword.value))))
const siteCount = computed(() => groupBySite(list.value).length)

async function load() {
  loading.value = true
  try {
    list.value = await listVault()
  }
  finally {
    loading.value = false
  }
}

// 从密码体检跳转过来时直接打开对应条目的编辑框
onLoad(async (query) => {
  await load()
  const id = Number(query?.edit)
  if (id)
    openEdit(id)
})

/* ---------------- 两步验证码 ---------------- */

/** 每秒更新一次，驱动验证码与倒计时刷新；页面不可见时停止 */
const nowMs = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined
onShow(() => {
  nowMs.value = Date.now()
  ticker = setInterval(() => (nowMs.value = Date.now()), 1000)
})
onHide(() => clearInterval(ticker))
onUnload(() => {
  clearInterval(ticker)
  details.clear()
})

/** 解析密钥并生成当前验证码；密钥无效时返回错误信息 */
function totpOf(secret: string, timeMs = nowMs.value): { code?: string, remaining?: number, period?: number, error?: string } {
  if (!secret.trim())
    return {}
  try {
    const config = parseTotp(secret)
    return { ...totp(config, timeMs), period: config.period }
  }
  catch (e: any) {
    return { error: e?.message || '密钥无效' }
  }
}

/** 展开条目的验证码（随 nowMs 每秒刷新） */
const currentTotp = computed(() => (current.value?.totp ? totpOf(current.value.totp) : {}))

/** 列表行上直接复制验证码 */
async function copyTotp(id: number) {
  try {
    const item = await fetchDetail(id)
    const t = totpOf(item.totp, Date.now())
    if (!t.code)
      return toast(t.error || '该账号没有两步验证密钥')
    copyText(t.code)
  }
  catch {}
}

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

/** 列表行上直接复制密码：未加载过明细时先取明细 */
async function copyPassword(id: number) {
  try {
    const item = await fetchDetail(id)
    if (!item.password)
      return toast('该账号没有保存密码')
    copyText(item.password)
  }
  catch {
    // 错误提示已由 http 层弹出
  }
}

/* ---------------- 展示辅助 ---------------- */

const AVATAR_COLORS = ['#4f6ef7', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#0ea5e9', '#ec4899', '#14b8a6']

function avatarColor(key: string) {
  let h = 0
  for (const ch of key)
    h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
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
  // 小程序无法直接打开外部网页，复制后到浏览器中打开
  copyText(full)
}

/* ---------------- 新增 / 编辑 ---------------- */

const showForm = ref(false)
const saving = ref(false)
const editingId = ref<number>()
const showFormPassword = ref(false)
const EMPTY_FORM: IVaultForm = { name: '', url: '', username: '', label: '', password: '', notes: '', totp: '' }
const form = reactive<IVaultForm>({ ...EMPTY_FORM })

/** 表单里实时预览验证码，便于确认密钥填对了 */
const formTotp = computed(() => totpOf(form.totp))

/** 粘贴 / 扫描到 otpauth 链接时，用其中的发行方与账号补全空着的字段 */
watch(() => form.totp, (value) => {
  if (!/^otpauth:/i.test(value.trim()))
    return
  try {
    const { issuer, account } = parseTotp(value)
    if (issuer && !form.name.trim())
      form.name = issuer
    if (account && !form.username.trim())
      form.username = account
  }
  catch {}
})

/** 扫描网站提供的两步验证二维码（小程序 / App；H5 请粘贴密钥或链接） */
function scanTotp() {
  uni.scanCode({
    onlyFromCamera: false,
    scanType: ['qrCode'],
    success: ({ result }) => {
      form.totp = result
      if (!/^otpauth:\/\/totp\//i.test(result))
        toast('这不是两步验证二维码')
    },
  })
}

const strength = computed(() => passwordStrength(form.password))
/** 同一网站下已有相同账号时提示（不阻止保存） */
const duplicate = computed(() => findDuplicate(list.value, form, editingId.value))
/** 新增时按输入的名称 / 网址提示已有网站，点击即可带入，保证同一网站归到同一组 */
const siteSuggestions = computed(() => {
  if (editingId.value)
    return []
  const name = form.name.trim().toLowerCase()
  const host = hostOf(form.url)
  if (!name && !host)
    return []
  return groupBySite(list.value)
    .filter((g) => {
      // 已经完全对上的网站不用再提示
      if (g.name.toLowerCase() === name && (!host || !g.host || g.host === host))
        return false
      return (name && g.name.toLowerCase().includes(name)) || (host && g.host === host)
    })
    .slice(0, 4)
})

function resetForm(data?: Partial<IVaultForm>) {
  Object.assign(form, EMPTY_FORM, data)
}

/** 新增账号；从某个网站分组进入时自动带上网站名称与网址 */
function openCreate(group?: SiteGroup<IVaultSummary>) {
  editingId.value = undefined
  showFormPassword.value = false
  resetForm(group ? { name: group.name, url: group.url } : undefined)
  showForm.value = true
}

function toHealth() {
  uni.navigateTo({ url: '/pages-tools/vaultcheck/index' })
}

async function openEdit(id: number) {
  const item = await fetchDetail(id)
  editingId.value = id
  showFormPassword.value = false
  resetForm(item)
  showForm.value = true
}

function applySuggestion(group: SiteGroup<IVaultSummary>) {
  form.name = group.name
  if (group.url)
    form.url = group.url
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
  if (formTotp.value.error)
    return toast(`两步验证密钥无效：${formTotp.value.error}`)
  saving.value = true
  try {
    const data = { ...form, name: form.name.trim(), url: form.url.trim(), label: form.label.trim(), totp: form.totp.trim() }
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

function accountTitle(item: IVaultSummary) {
  return item.username || '（未填写账号）'
}

function remove(item: IVaultSummary) {
  uni.showModal({
    title: '删除确认',
    content: `确定删除「${item.name}」的账号「${accountTitle(item)}」吗？删除后无法恢复。`,
    confirmColor: '#ef4444',
    success: async ({ confirm }) => {
      if (!confirm)
        return
      await deleteVaultItem(item.id)
      details.delete(item.id)
      if (expandedId.value === item.id)
        expandedId.value = undefined
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
          <input v-model="keyword" class="min-w-0 flex-1 text-14px" placeholder="搜索网站、网址、账号或备注名">
          <view v-if="keyword" class="i-carbon-close cursor-pointer text-15px text-muted" @click="keyword = ''" />
        </view>
        <wd-button icon="add" @click="openCreate()">
          新增
        </wd-button>
      </view>
      <view class="mt-2 text-12px text-muted">
        {{ siteCount }} 个网站 · {{ list.length }} 个账号 · 密码与备注在服务端加密存储，仅本人可查看
        <text v-if="list.length" class="ml-1 cursor-pointer text-[var(--wot-color-theme)]" @click="toHealth">· 密码体检</text>
      </view>
    </ot-panel>

    <view v-if="loading && !list.length" class="py-10 text-center text-13px text-muted">
      加载中…
    </view>

    <ot-panel v-else-if="!groups.length">
      <view class="flex flex-col items-center gap-3 py-8">
        <view class="i-carbon-password text-40px text-muted" />
        <text class="text-13px text-muted">{{ keyword ? '没有匹配的账号' : '还没有保存任何账号' }}</text>
        <wd-button v-if="!keyword" size="small" plain @click="openCreate()">
          添加第一个账号
        </wd-button>
      </view>
    </ot-panel>

    <view v-for="group in groups" :key="group.key" class="ot-vault__group">
      <!-- 网站 -->
      <view class="ot-vault__site">
        <view class="ot-vault__avatar" :style="{ backgroundColor: avatarColor(group.key) }">
          {{ group.name.slice(0, 1).toUpperCase() }}
        </view>
        <view class="min-w-0 flex-1">
          <view class="flex items-center gap-1.5">
            <text class="truncate text-15px text-main font-600">{{ group.name }}</text>
            <text v-if="group.items.length > 1" class="ot-vault__count">{{ group.items.length }} 个账号</text>
          </view>
          <view v-if="group.host || group.url" class="truncate text-12px text-muted">
            {{ group.host || group.url }}
          </view>
        </view>
        <view v-if="group.url" class="i-carbon-launch ot-vault__btn" title="打开网站" @click="openUrl(group.url)" />
        <view class="ot-vault__add" @click="openCreate(group)">
          <view class="i-carbon-add text-15px" />
          <text>账号</text>
        </view>
      </view>

      <!-- 账号 -->
      <view v-for="item in group.items" :key="item.id" class="ot-vault__account" :class="{ 'is-open': expandedId === item.id }">
        <view class="flex cursor-pointer items-center gap-2" @click="toggleExpand(item)">
          <view class="i-carbon-user-avatar shrink-0 text-17px text-muted" />
          <view class="min-w-0 flex-1">
            <view class="flex items-center gap-1.5">
              <text class="truncate text-14px" :class="item.username ? 'text-main' : 'text-muted'">{{ accountTitle(item) }}</text>
              <text v-if="item.label" class="ot-vault__label-tag">{{ item.label }}</text>
            </view>
            <!-- 同组内网站名称不一致时（如「GitHub 工作」）显示出来，便于区分 -->
            <view v-if="item.name !== group.name" class="truncate text-12px text-muted">
              {{ item.name }}
            </view>
          </view>
          <view v-if="item.username" class="i-carbon-user-follow ot-vault__btn" title="复制账号" @click.stop="copyText(item.username)" />
          <view class="i-carbon-password ot-vault__btn" title="复制密码" @click.stop="copyPassword(item.id)" />
          <view v-if="item.hasTotp" class="i-carbon-time ot-vault__btn" title="复制两步验证码" @click.stop="copyTotp(item.id)" />
          <view class="shrink-0 text-17px text-muted" :class="expandedId === item.id ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down'" />
        </view>

        <view v-if="expandedId === item.id" class="mt-3">
          <view v-if="!current" class="py-3 text-center text-13px text-muted">
            加载中…
          </view>
          <template v-else>
            <view class="ot-vault__row">
              <text class="ot-vault__row-label">账号</text>
              <text class="ot-mono min-w-0 flex-1 break-all" user-select selectable>{{ current.username || '—' }}</text>
              <view v-if="current.username" class="i-carbon-copy ot-vault__btn" @click="copyText(current.username)" />
            </view>
            <view class="ot-vault__row">
              <text class="ot-vault__row-label">密码</text>
              <text class="ot-mono min-w-0 flex-1 break-all" user-select selectable>
                {{ revealedIds.has(item.id) ? (current.password || '—') : (current.password ? '••••••••••' : '—') }}
              </text>
              <template v-if="current.password">
                <view
                  class="ot-vault__btn" :class="revealedIds.has(item.id) ? 'i-carbon-view-off' : 'i-carbon-view'"
                  @click="toggleReveal(item.id)"
                />
                <view class="i-carbon-copy ot-vault__btn" @click="copyText(current.password)" />
              </template>
            </view>
            <view v-if="current.totp" class="ot-vault__row">
              <text class="ot-vault__row-label">验证码</text>
              <template v-if="currentTotp.code">
                <text class="ot-vault__totp ot-mono" user-select selectable>{{ formatCode(currentTotp.code) }}</text>
                <view class="ot-vault__countdown" :class="{ 'is-urgent': (currentTotp.remaining || 0) <= 5 }">
                  <view class="ot-vault__countdown-bar" :style="{ width: `${((currentTotp.remaining || 0) / (currentTotp.period || 30)) * 100}%` }" />
                </view>
                <text class="ot-mono w-24px shrink-0 text-right text-12px text-muted">{{ currentTotp.remaining }}s</text>
                <view class="i-carbon-copy ot-vault__btn" @click="copyText(currentTotp.code)" />
              </template>
              <text v-else class="min-w-0 flex-1 text-12px text-red-500">{{ currentTotp.error }}</text>
            </view>
            <view v-if="current.url" class="ot-vault__row">
              <text class="ot-vault__row-label">网址</text>
              <text class="min-w-0 flex-1 break-all" user-select selectable>{{ current.url }}</text>
              <view class="i-carbon-launch ot-vault__btn" @click="openUrl(current.url)" />
            </view>
            <view v-if="current.notes" class="ot-vault__row ot-vault__row--top">
              <text class="ot-vault__row-label">备注</text>
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
    </view>

    <wd-popup
      v-model="showForm" position="center" :z-index="1000" closable
      custom-style="width: 92vw; max-width: 480px; border-radius: 16px;"
    >
      <view class="ot-vault__form">
        <view class="mb-1 text-16px text-main font-600">
          {{ editingId ? '编辑账号' : '新增账号' }}
        </view>

        <view class="ot-vault__field-label">
          网站名称 <text class="text-red-500">*</text>
        </view>
        <view class="ot-vault__field">
          <input v-model="form.name" class="flex-1" placeholder="如：GitHub" :maxlength="100">
        </view>
        <view v-if="siteSuggestions.length" class="mt-2 flex flex-wrap items-center gap-1.5">
          <text class="text-12px text-muted">已有网站：</text>
          <view v-for="g in siteSuggestions" :key="g.key" class="ot-vault__suggest" @click="applySuggestion(g)">
            {{ g.name }}<text class="ml-1 text-muted">{{ g.items.length }}</text>
          </view>
        </view>

        <view class="ot-vault__field-label">
          网址
        </view>
        <view class="ot-vault__field">
          <input v-model="form.url" class="flex-1" placeholder="如：github.com（同一网址的账号会归为一组）" :maxlength="500">
        </view>

        <view class="flex gap-3">
          <view class="ot-vault__col-3 min-w-0">
            <view class="ot-vault__field-label">
              账号
            </view>
            <view class="ot-vault__field">
              <input v-model="form.username" class="min-w-0 flex-1" placeholder="用户名 / 邮箱 / 手机号" :maxlength="200">
            </view>
          </view>
          <view class="ot-vault__col-2 min-w-0">
            <view class="ot-vault__field-label">
              账号备注名
            </view>
            <view class="ot-vault__field">
              <input v-model="form.label" class="min-w-0 flex-1" placeholder="如：工作号" :maxlength="30">
            </view>
          </view>
        </view>
        <view v-if="duplicate" class="ot-vault__warn">
          <view class="i-carbon-warning-alt shrink-0 text-15px" />
          <text>该网站下已有账号「{{ duplicate.username }}」{{ duplicate.label ? `（${duplicate.label}）` : '' }}，仍可继续保存。</text>
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
        <view v-if="form.password" class="mt-2 flex items-center gap-2">
          <view class="ot-vault__meter">
            <view
              v-for="n in 3" :key="n" class="ot-vault__meter-bar"
              :style="{ background: n <= strength.level ? strength.color : '' }"
            />
          </view>
          <text class="text-12px" :style="{ color: strength.color }">强度：{{ strength.text }}</text>
        </view>

        <view class="ot-vault__field-label">
          两步验证密钥 <text class="text-muted">（可选）</text>
        </view>
        <view class="ot-vault__field">
          <input
            v-model="form.totp" class="ot-mono min-w-0 flex-1" placeholder="Base32 密钥或 otpauth:// 链接"
            :maxlength="1000"
          >
          <!-- #ifndef H5 -->
          <view class="i-carbon-scan ot-vault__btn" title="扫描二维码" @click="scanTotp" />
          <!-- #endif -->
        </view>
        <view v-if="formTotp.code" class="mt-2 flex items-center gap-2 text-12px text-muted">
          <view class="i-carbon-checkmark-filled text-emerald-500" />
          <text>当前验证码 <text class="ot-mono text-main font-600">{{ formatCode(formTotp.code) }}</text>，可与网站或其他验证器核对</text>
        </view>
        <view v-else-if="formTotp.error" class="mt-2 text-12px text-red-500">
          {{ formTotp.error }}
        </view>
        <view v-else class="mt-2 text-12px text-muted leading-18px">
          在网站开启两步验证时，选择「无法扫描 / 手动输入」即可看到密钥。
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

.ot-vault__group {
  border-radius: 14px;
  background: var(--ot-card);
  border: 1px solid var(--ot-border);
  overflow: hidden;
}

.ot-vault__site {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
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

.ot-vault__count {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 18px;
  color: var(--wot-color-theme);
  background: rgba(79, 110, 247, 0.1);
}

.ot-vault__add {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--wot-color-theme);
  background: rgba(79, 110, 247, 0.08);
  cursor: pointer;

  &:hover {
    background: rgba(79, 110, 247, 0.16);
  }
}

.ot-vault__account {
  padding: 10px 16px 10px 20px;
  border-top: 1px solid var(--ot-border);

  &.is-open {
    background: color-mix(in srgb, var(--ot-fill) 45%, transparent);
    padding-bottom: 14px;
  }
}

.ot-vault__label-tag {
  flex-shrink: 0;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 6px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 18px;
  color: #b45309;
  background: rgba(245, 158, 11, 0.14);
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

.ot-vault__row--top {
  align-items: flex-start;
}

.ot-vault__row-label {
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

.ot-vault__col-3 {
  flex: 3;
}

.ot-vault__col-2 {
  flex: 2;
}

.ot-vault__suggest {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--ot-text);
  border: 1px solid var(--ot-border);
  cursor: pointer;

  &:hover {
    border-color: var(--wot-color-theme);
    color: var(--wot-color-theme);
  }
}

.ot-vault__warn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  color: #b45309;
  background: rgba(245, 158, 11, 0.12);
}

.ot-vault__totp {
  flex: 1;
  min-width: 0;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--wot-color-theme);
}

.ot-vault__countdown {
  flex-shrink: 0;
  width: 48px;
  height: 4px;
  border-radius: 2px;
  background: var(--ot-border);
  overflow: hidden;

  &.is-urgent .ot-vault__countdown-bar {
    background: #ef4444;
  }
}

.ot-vault__countdown-bar {
  height: 100%;
  border-radius: 2px;
  background: var(--wot-color-theme);
  transition: width 1s linear;
}

.ot-vault__meter {
  display: flex;
  gap: 4px;
  width: 120px;
}

.ot-vault__meter-bar {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--ot-border);
}
</style>
