<script lang="ts" setup>
import type { ExpireChoice } from './utils'
import type { IShortLink } from '@/api/shortlink'
import dayjs from 'dayjs'
import { createLink, deleteLink, listLinks, updateLink } from '@/api/shortlink'
import { useUserStore } from '@/store/user'
import { copyText, toast } from '@/utils/common'
import { getSiteOrigin } from '@/utils/site'
import QrPopup from '../qrcode/components/qr-popup.vue'
import { EXPIRE_OPTIONS, expiresAtOf, linkStatus, matchLink, validateCode, validateTarget } from './utils'

definePage({
  style: { navigationBarTitleText: '短链接' },
})

const userStore = useUserStore()
const isAdmin = computed(() => userStore.userInfo.role === 'admin')

const nowSec = () => Math.floor(Date.now() / 1000)

/** 短链前缀，仅用于输入自定义后缀时预览；真实短链以服务端返回为准 */
const shortPrefix = `${getSiteOrigin()}/s/`

/* ---------------- 列表状态 ---------------- */

const scope = ref<'mine' | 'all'>('mine')
const scopeOptions = [
  { value: 'mine', label: '我的' },
  { value: 'all', label: '全部用户' },
]
const links = ref<IShortLink[]>([])
const loading = ref(false)
const keyword = ref('')
const filtered = computed(() => links.value.filter(l => matchLink(l, keyword.value)))
const totalClicks = computed(() => links.value.reduce((s, l) => s + l.clicks, 0))

/* ---------------- 创建 ---------------- */

const form = reactive({ url: '', code: '', title: '', expire: 0 as number })
const creating = ref(false)
const formError = ref('')
/** 最近一次创建的结果 */
const created = ref<IShortLink>()

watch(form, () => {
  formError.value = ''
})

async function create() {
  formError.value = validateTarget(form.url) || validateCode(form.code)
  if (formError.value)
    return
  creating.value = true
  try {
    const link = await createLink({
      url: form.url.trim(),
      code: form.code.trim() || undefined,
      title: form.title.trim(),
      expiresAt: expiresAtOf(form.expire, nowSec()),
    })
    created.value = link
    Object.assign(form, { url: '', code: '', title: '' })
    // 「我的」视图下直接插到列表最前面，省一次请求
    if (scope.value === 'mine')
      links.value = [link, ...links.value]
    else
      await load()
    copyText(link.shortUrl)
  }
  catch {
    // 错误提示已由 http 层弹出
  }
  finally {
    creating.value = false
  }
}

async function pasteUrl() {
  uni.getClipboardData({
    success: ({ data }) => {
      if (data?.trim())
        form.url = data.trim()
      else
        toast('剪贴板为空')
    },
    fail: () => toast('无法读取剪贴板，请手动粘贴'),
  })
}

/* ---------------- 列表 ---------------- */

async function load() {
  loading.value = true
  try {
    links.value = await listLinks(scope.value === 'all')
  }
  finally {
    loading.value = false
  }
}

onLoad(load)
// 从浏览器回来时刷新点击数
onShow(() => {
  if (links.value.length)
    load()
})
watch(scope, load)

function statusOf(link: IShortLink) {
  return linkStatus(link, nowSec())
}

function formatTime(ts: number, withTime = false) {
  return ts ? dayjs(ts * 1000).format(withTime ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD') : ''
}

function openLink(url: string) {
  // #ifdef H5
  window.open(url, '_blank', 'noopener,noreferrer')
  return
  // #endif
  // #ifndef H5

  copyText(url)
  // #endif
}

/* ---------------- 分享二维码（在当前页弹窗展示） ---------------- */

const qrOpen = ref(false)
const qrText = ref('')
const qrNote = ref('')

function showQrcode(text: string, note: string) {
  if (!text)
    return toast('无法生成链接')
  qrText.value = text
  qrNote.value = note
  qrOpen.value = true
}

/** 短链二维码，备注用短链标题 */
function toQrcode(link: IShortLink) {
  showQrcode(link.shortUrl, link.title)
}

function replaceLink(link: IShortLink) {
  links.value = links.value.map(l => (l.id === link.id ? { ...link, owner: l.owner } : l))
  if (created.value?.id === link.id)
    created.value = link
}

async function toggleDisabled(link: IShortLink) {
  try {
    replaceLink(await updateLink(link.id, { disabled: !link.disabled }))
    toast(link.disabled ? '已启用' : '已停用', 'success')
  }
  catch {}
}

function remove(link: IShortLink) {
  uni.showModal({
    title: '删除短链接',
    content: `确定删除 /s/${link.code} 吗？删除后该短链将无法访问，且后缀可被重新使用。`,
    confirmColor: '#ef4444',
    success: async ({ confirm }) => {
      if (!confirm)
        return
      await deleteLink(link.id)
      links.value = links.value.filter(l => l.id !== link.id)
      if (created.value?.id === link.id)
        created.value = undefined
      toast('已删除', 'success')
    },
  })
}

/* ---------------- 编辑 ---------------- */

const editing = ref<IShortLink>()
const showEdit = ref(false)
const saving = ref(false)
const editError = ref('')
const editForm = reactive({ url: '', title: '', expire: 'keep' as ExpireChoice })
const editExpireOptions = [{ value: 'keep', label: '不修改' }, ...EXPIRE_OPTIONS]

function openEdit(link: IShortLink) {
  editing.value = link
  Object.assign(editForm, { url: link.url, title: link.title, expire: 'keep' })
  editError.value = ''
  showEdit.value = true
}

async function saveEdit() {
  if (!editing.value)
    return
  editError.value = validateTarget(editForm.url)
  if (editError.value)
    return
  saving.value = true
  try {
    const expiresAt = expiresAtOf(editForm.expire, nowSec())
    replaceLink(await updateLink(editing.value.id, {
      url: editForm.url.trim(),
      title: editForm.title.trim(),
      ...(expiresAt === undefined ? {} : { expiresAt }),
    }))
    showEdit.value = false
    toast('已保存', 'success')
  }
  catch {}
  finally {
    saving.value = false
  }
}
</script>

<template>
  <ot-tool-layout>
    <!-- 创建 -->
    <ot-panel title="生成短链">
      <view class="ot-sl__label">
        长链接 <text class="text-red-500">*</text>
      </view>
      <view class="ot-sl__field">
        <view class="i-carbon-link shrink-0 text-16px text-muted" />
        <input
          v-model="form.url" class="ot-sl__input" placeholder="粘贴要缩短的网址，如 https://example.com/very/long/path"
          :maxlength="2000" confirm-type="done" @confirm="create"
        >
        <view v-if="form.url" class="i-carbon-close-filled ot-sl__icon-btn" @click="form.url = ''" />
        <view v-else class="ot-sl__paste" @click="pasteUrl">
          粘贴
        </view>
      </view>

      <view class="mt-1 flex flex-col gap-0 md:flex-row md:gap-3">
        <view class="min-w-0 md:flex-1">
          <view class="ot-sl__label">
            自定义后缀 <text class="text-muted font-400">（可选）</text>
          </view>
          <view class="ot-sl__field">
            <text class="ot-sl__prefix">{{ shortPrefix }}</text>
            <input v-model="form.code" class="ot-sl__input ot-mono" placeholder="随机生成" :maxlength="32">
          </view>
        </view>
        <view class="min-w-0 md:flex-1">
          <view class="ot-sl__label">
            备注 <text class="text-muted font-400">（可选）</text>
          </view>
          <view class="ot-sl__field">
            <input v-model="form.title" class="ot-sl__input" placeholder="如：双十一活动页" :maxlength="100">
          </view>
        </view>
      </view>

      <view class="ot-sl__label">
        有效期
      </view>
      <ot-segmented v-model="form.expire" :options="EXPIRE_OPTIONS" size="small" />

      <view v-if="formError" class="ot-sl__error">
        <view class="i-carbon-warning-filled shrink-0 text-15px" />
        <text>{{ formError }}</text>
      </view>

      <wd-button block custom-class="mt-4" :loading="creating" @click="create">
        生成短链
      </wd-button>

      <view v-if="created" class="ot-sl__result">
        <view class="flex items-center gap-2">
          <view class="i-carbon-checkmark-filled shrink-0 text-16px text-emerald-500" />
          <text class="text-13px text-sub">已生成并复制到剪贴板</text>
        </view>
        <view class="ot-sl__result-url ot-mono" user-select selectable>
          {{ created.shortUrl }}
        </view>
        <view class="truncate text-12px text-muted">
          → {{ created.url }}
        </view>
        <view class="mt-3 flex flex-wrap gap-2">
          <wd-button size="small" icon="copy" @click="copyText(created.shortUrl)">
            复制
          </wd-button>
          <wd-button size="small" type="info" plain @click="openLink(created.shortUrl)">
            打开
          </wd-button>
          <wd-button size="small" type="info" plain @click="toQrcode(created)">
            生成二维码
          </wd-button>
        </view>
      </view>
    </ot-panel>

    <!-- 列表 -->
    <ot-panel :title="scope === 'all' ? '全部短链' : '我的短链'">
      <template #extra>
        <ot-segmented v-if="isAdmin" v-model="scope" :options="scopeOptions" size="small" />
      </template>

      <view class="flex items-center gap-2">
        <view class="ot-sl__search">
          <view class="i-carbon-search text-15px text-muted" />
          <input v-model="keyword" class="min-w-0 flex-1 text-14px" :placeholder="scope === 'all' ? '搜索后缀、链接、备注或用户' : '搜索后缀、链接或备注'">
          <view v-if="keyword" class="i-carbon-close cursor-pointer text-15px text-muted" @click="keyword = ''" />
        </view>
        <view class="i-carbon-renew ot-sl__icon-btn text-17px" :class="{ 'animate-spin': loading }" title="刷新" @click="load" />
      </view>
      <view class="mt-2 text-12px text-muted">
        共 {{ links.length }} 个短链 · 累计点击 {{ totalClicks }} 次
      </view>

      <view v-if="loading && !links.length" class="py-8 text-center text-13px text-muted">
        加载中…
      </view>
      <view v-else-if="!filtered.length" class="flex flex-col items-center gap-2 py-8">
        <view class="i-carbon-link text-36px text-muted" />
        <text class="text-13px text-muted">{{ keyword ? '没有匹配的短链' : '还没有短链，在上方生成一个吧' }}</text>
      </view>

      <view v-for="link in filtered" :key="link.id" class="ot-sl__item">
        <view class="flex items-start gap-2">
          <view class="min-w-0 flex-1">
            <view class="flex flex-wrap items-center gap-1.5">
              <text class="text-14px text-main font-500">{{ link.title || `/s/${link.code}` }}</text>
              <text class="ot-sl__tag" :class="`is-${statusOf(link).status}`">{{ statusOf(link).text }}</text>
              <text v-if="link.owner" class="ot-sl__tag is-owner">@{{ link.owner }}</text>
            </view>
            <view class="mt-1 flex items-center gap-1">
              <text class="ot-mono text-theme truncate text-13px" user-select selectable>{{ link.shortUrl }}</text>
              <view class="i-carbon-copy ot-sl__icon-btn" title="复制短链" @click="copyText(link.shortUrl)" />
            </view>
            <view class="truncate text-12px text-muted">
              → {{ link.url }}
            </view>
          </view>
          <view class="ot-sl__clicks">
            <text class="text-18px text-main font-600 leading-none">{{ link.clicks }}</text>
            <text class="mt-1 text-11px text-muted">次点击</text>
          </view>
        </view>

        <view class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-12px text-muted">
          <text>创建于 {{ formatTime(link.createdAt) }}</text>
          <text v-if="link.lastClickedAt">最近访问 {{ formatTime(link.lastClickedAt, true) }}</text>
          <text>{{ link.expiresAt ? `有效期至 ${formatTime(link.expiresAt, true)}` : '永久有效' }}</text>
        </view>

        <view class="ot-sl__actions">
          <view class="ot-sl__action" @click="openLink(link.shortUrl)">
            <view class="i-carbon-launch" />打开
          </view>
          <view class="ot-sl__action" @click="toQrcode(link)">
            <view class="i-carbon-qr-code" />二维码
          </view>
          <view class="ot-sl__action" @click="openEdit(link)">
            <view class="i-carbon-edit" />编辑
          </view>
          <view class="ot-sl__action" @click="toggleDisabled(link)">
            <view :class="link.disabled ? 'i-carbon-play' : 'i-carbon-pause'" />{{ link.disabled ? '启用' : '停用' }}
          </view>
          <view class="ot-sl__action is-danger" @click="remove(link)">
            <view class="i-carbon-trash-can" />删除
          </view>
        </view>
      </view>
    </ot-panel>

    <view class="px-1 text-12px text-muted leading-20px">
      短链使用 302 跳转，修改目标或停用后立即生效；点击数按浏览器访问统计，链接预览、爬虫等也可能计入。
    </view>

    <!-- 编辑 -->
    <wd-popup
      v-model="showEdit" position="center" :z-index="1000" closable
      custom-style="width: 92vw; max-width: 460px; border-radius: 16px;"
    >
      <view v-if="editing" class="ot-sl__form">
        <view class="text-16px text-main font-600">
          编辑短链
        </view>
        <view class="ot-mono mt-1 truncate text-13px text-muted">
          {{ editing.shortUrl }}
        </view>
        <view class="ot-sl__label">
          目标链接
        </view>
        <view class="ot-sl__field">
          <input v-model="editForm.url" class="ot-sl__input" :maxlength="2000">
        </view>
        <view class="ot-sl__label">
          备注
        </view>
        <view class="ot-sl__field">
          <input v-model="editForm.title" class="ot-sl__input" placeholder="可选" :maxlength="100">
        </view>
        <view class="ot-sl__label">
          有效期 <text class="text-muted font-400">（当前：{{ editing.expiresAt ? `至 ${formatTime(editing.expiresAt, true)}` : '永久' }}）</text>
        </view>
        <ot-segmented v-model="editForm.expire" :options="editExpireOptions" size="small" />
        <view class="mt-1 text-12px text-muted">
          重新选择有效期从现在开始计算，可用于让已过期的短链恢复
        </view>
        <view v-if="editError" class="ot-sl__error">
          <view class="i-carbon-warning-filled shrink-0 text-15px" />
          <text>{{ editError }}</text>
        </view>
        <view class="mt-5 flex justify-end gap-2">
          <wd-button type="info" plain @click="showEdit = false">
            取消
          </wd-button>
          <wd-button :loading="saving" @click="saveEdit">
            保存
          </wd-button>
        </view>
      </view>
    </wd-popup>
    <qr-popup v-model="qrOpen" :text="qrText" :note="qrNote" />
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-sl__label {
  margin: 12px 0 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--ot-text-2);
}

.ot-sl__field {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 12px;
  border-radius: 10px;
  background: var(--ot-fill);
  font-size: 14px;
}

.ot-sl__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  font-size: 14px;
  color: var(--ot-text);
}

.ot-sl__prefix {
  flex-shrink: 1;
  min-width: 0;
  max-width: 55%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--ot-text-3);
  font-family: var(--ot-font-mono);
}

.ot-sl__paste {
  flex-shrink: 0;
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--wot-color-theme);
  background: rgba(79, 110, 247, 0.1);
  cursor: pointer;
}

.ot-sl__icon-btn {
  flex-shrink: 0;
  padding: 4px;
  font-size: 15px;
  color: var(--ot-text-3);
  cursor: pointer;

  &:hover {
    color: var(--ot-text);
  }
}

.ot-sl__error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: #dc2626;
  background: rgba(239, 68, 68, 0.08);
}

.ot-sl__result {
  margin-top: 16px;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.06);
}

.ot-sl__result-url {
  margin: 8px 0 4px;
  font-size: 18px;
  font-weight: 600;
  color: var(--wot-color-theme);
  word-break: break-all;
}

.ot-sl__search {
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

.ot-sl__item {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--ot-border);
}

.text-theme {
  color: var(--wot-color-theme);
}

.ot-sl__tag {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 18px;

  &.is-active {
    color: #059669;
    background: rgba(16, 185, 129, 0.12);
  }

  &.is-expiring {
    color: #b45309;
    background: rgba(245, 158, 11, 0.14);
  }

  &.is-expired,
  &.is-disabled {
    color: var(--ot-text-3);
    background: var(--ot-fill);
  }

  &.is-owner {
    color: var(--wot-color-theme);
    background: rgba(79, 110, 247, 0.1);
  }
}

.ot-sl__clicks {
  flex-shrink: 0;
  min-width: 56px;
  padding: 6px 8px;
  border-radius: 10px;
  background: var(--ot-fill);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.ot-sl__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--ot-border);
}

.ot-sl__action {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--ot-text-2);
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
    color: var(--ot-text);
  }

  &.is-danger:hover {
    color: #ef4444;
  }
}

.ot-sl__form {
  box-sizing: border-box;
  padding: 20px;
  background: var(--ot-card);
  color: var(--ot-text);
}
</style>
