<script lang="ts" setup>
import type { IPasteDetail, IPasteListItem, IPasteSummary } from '@/api/paste'
import dayjs from 'dayjs'
import { createPaste, deletePaste, getPaste, listPastes } from '@/api/paste'
import { isLoggedIn, LOGIN_PAGE } from '@/router/auth'
import { copyText, toast } from '@/utils/common'
import { getPageUrl } from '@/utils/site'
import QrPopup from '../qrcode/components/qr-popup.vue'

definePage({
  style: { navigationBarTitleText: '文本快传' },
})

const MAX_LENGTH = 50_000
const PAGE_PATH = '/pages-tools/paste/index'

/** 未登录时只能取件；发送与「我的快传」需要登录 */
const loggedIn = ref(isLoggedIn())

const TTL_OPTIONS = [
  { value: 600, label: '10 分钟' },
  { value: 3600, label: '1 小时' },
  { value: 86400, label: '1 天' },
  { value: 7 * 86400, label: '7 天' },
  { value: 30 * 86400, label: '30 天' },
]

const nowSec = ref(Math.floor(Date.now() / 1000))
let ticker: ReturnType<typeof setInterval> | undefined

/** ABC23K → ABC 23K，便于朗读与核对 */
function prettyCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`
}

function linkOf(code: string) {
  return getPageUrl(`${PAGE_PATH}?code=${code}`)
}

function remainText(expiresAt: number) {
  const s = expiresAt - nowSec.value
  if (s <= 0)
    return '已过期'
  if (s < 60)
    return '即将过期'
  if (s < 3600)
    return `${Math.floor(s / 60)} 分钟后过期`
  if (s < 86400)
    return `${Math.floor(s / 3600)} 小时后过期`
  return `${Math.floor(s / 86400)} 天后过期`
}

/* ---------------- 发送 ---------------- */

const content = ref('')
const ttl = ref(3600)
const burn = ref(false)
const sending = ref(false)
const sent = ref<IPasteSummary>()

async function pasteFromClipboard() {
  uni.getClipboardData({
    success: ({ data }) => {
      if (data)
        content.value = data.slice(0, MAX_LENGTH)
      else
        toast('剪贴板为空')
    },
    fail: () => toast('无法读取剪贴板，请手动粘贴'),
  })
}

async function send() {
  if (!content.value.trim())
    return toast('请输入要发送的内容')
  sending.value = true
  try {
    sent.value = await createPaste({ content: content.value, expiresIn: ttl.value, burnAfterRead: burn.value })
    content.value = ''
    copyText(sent.value.code)
    await loadList()
  }
  catch {
    // 错误提示已由 http 层弹出
  }
  finally {
    sending.value = false
  }
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

/** 扫码即可在另一台设备上打开并提取 */
function toQrcode(code: string) {
  showQrcode(linkOf(code), `文本快传 取件码 ${prettyCode(code)}`)
}

/* ---------------- 取件 ---------------- */

const codeInput = ref('')
const fetching = ref(false)
const fetched = ref<IPasteDetail>()
const fetchError = ref('')

/** 只保留取件码允许的字符并转大写 */
const normalizedCode = computed(() => codeInput.value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6))

/** 登录后回到本页，已输入的取件码一并带上 */
function toLogin() {
  const code = normalizedCode.value
  const back = code.length === 6 ? `${PAGE_PATH}?code=${code}` : PAGE_PATH
  uni.navigateTo({ url: `${LOGIN_PAGE}?redirect=${encodeURIComponent(back)}` })
}

async function fetchByCode(code = normalizedCode.value) {
  if (code.length !== 6)
    return toast('请输入 6 位取件码')
  fetching.value = true
  fetchError.value = ''
  fetched.value = undefined
  try {
    // 错误显示在取件区域里，不再额外弹 toast
    fetched.value = await getPaste(code, { hideErrorToast: true })
    tick()
    if (fetched.value.burned)
      toast('内容已销毁，请及时复制')
    if (loggedIn.value)
      loadList()
  }
  catch (e: any) {
    fetchError.value = e?.message || '提取失败'
  }
  finally {
    fetching.value = false
  }
}

/* ---------------- 我的快传 ---------------- */

const list = ref<IPasteListItem[]>([])
const listLoading = ref(false)

/** 刷新「当前时间」，保证剩余时间与刚拿到的数据一致 */
function tick() {
  nowSec.value = Math.floor(Date.now() / 1000)
}

async function loadList() {
  tick()
  listLoading.value = true
  try {
    list.value = await listPastes()
  }
  finally {
    listLoading.value = false
  }
}

/** 复制完整内容（自己的快传，查看不会触发阅后即焚） */
async function copyContent(item: IPasteListItem) {
  try {
    const detail = await getPaste(item.code)
    copyText(detail.content)
  }
  catch {}
}

function remove(item: IPasteListItem) {
  uni.showModal({
    title: '删除快传',
    content: `确定删除取件码 ${prettyCode(item.code)} 吗？删除后无法再提取。`,
    confirmColor: '#ef4444',
    success: async ({ confirm }) => {
      if (!confirm)
        return
      await deletePaste(item.code)
      list.value = list.value.filter(i => i.code !== item.code)
      if (sent.value?.code === item.code)
        sent.value = undefined
      toast('已删除', 'success')
    },
  })
}

onLoad((query) => {
  // 从分享链接打开：自动提取
  const code = String(query?.code || '').replace(/[^a-z0-9]/gi, '').toUpperCase()
  if (code.length === 6) {
    codeInput.value = code
    fetchByCode(code)
  }
})
onShow(() => {
  loggedIn.value = isLoggedIn()
  if (loggedIn.value)
    loadList()
  ticker = setInterval(tick, 30_000)
})
onHide(() => clearInterval(ticker))
onUnload(() => clearInterval(ticker))
</script>

<template>
  <ot-tool-layout>
    <!-- 取件 -->
    <ot-panel title="取件">
      <view class="flex items-center gap-2">
        <view class="ot-paste__code-input">
          <view class="i-carbon-password shrink-0 text-16px text-muted" />
          <input
            v-model="codeInput" class="ot-mono min-w-0 flex-1 text-16px tracking-widest uppercase"
            placeholder="输入 6 位取件码" :maxlength="8" confirm-type="done" @confirm="fetchByCode()"
          >
        </view>
        <wd-button :loading="fetching" :disabled="normalizedCode.length !== 6" @click="fetchByCode()">
          提取
        </wd-button>
      </view>
      <view v-if="fetchError" class="ot-paste__msg is-error">
        <view class="i-carbon-warning-filled shrink-0" />
        <text>{{ fetchError }}</text>
      </view>
      <view v-if="fetched" class="ot-paste__fetched">
        <view v-if="fetched.burned" class="ot-paste__msg is-warn mb-3 mt-0!">
          <view class="i-carbon-fire shrink-0" />
          <text>阅后即焚：内容已从服务器删除，关闭页面后无法再次查看，请及时复制</text>
        </view>
        <text class="ot-paste__content" user-select selectable>{{ fetched.content }}</text>
        <view class="mt-3 flex items-center gap-2">
          <text class="flex-1 text-12px text-muted">
            {{ fetched.size }} 字 · {{ fetched.isOwner ? '我发送的' : '他人分享' }}
            <template v-if="!fetched.burned"> · {{ remainText(fetched.expiresAt) }}</template>
          </text>
          <wd-button size="small" icon="copy" @click="copyText(fetched.content)">
            复制内容
          </wd-button>
        </view>
      </view>
    </ot-panel>

    <ot-panel v-if="!loggedIn">
      <view class="flex flex-wrap items-center gap-3">
        <view class="i-carbon-locked shrink-0 text-20px text-muted" />
        <text class="min-w-0 flex-1 text-13px text-sub leading-20px">无需登录即可凭取件码提取内容。登录后可以发送文字，并在所有设备上查看自己发送的快传。</text>
        <wd-button size="small" @click="toLogin">
          登录
        </wd-button>
      </view>
    </ot-panel>

    <template v-else>
      <!-- 发送 -->
      <ot-panel title="发送">
        <template #extra>
          <text class="text-12px" :class="content.length > MAX_LENGTH * 0.9 ? 'text-red-500' : 'text-muted'">{{ content.length }}/{{ MAX_LENGTH }}</text>
          <wd-button size="small" type="info" plain @click="pasteFromClipboard">
            从剪贴板粘贴
          </wd-button>
        </template>
        <ot-textarea v-model="content" :height="130" :mono="false" placeholder="输入或粘贴要传到其他设备的文字、链接、验证码等" />
        <view class="mt-3 flex flex-col gap-3 text-13px text-sub">
          <view class="flex items-center gap-3">
            <text class="w-60px shrink-0">有效期</text>
            <ot-segmented v-model="ttl" :options="TTL_OPTIONS" size="small" />
          </view>
          <view class="flex items-center gap-3">
            <text class="w-60px shrink-0">阅后即焚</text>
            <wd-switch v-model="burn" size="20px" />
            <text class="text-12px text-muted">他人提取一次后立即删除（你自己查看不受影响）</text>
          </view>
        </view>
        <wd-button block custom-class="mt-4" :loading="sending" :disabled="content.length > MAX_LENGTH" @click="send">
          发送
        </wd-button>

        <view v-if="sent" class="ot-paste__result">
          <text class="text-13px text-sub">取件码（已复制）</text>
          <text class="ot-paste__big-code ot-mono" user-select selectable>{{ prettyCode(sent.code) }}</text>
          <text class="text-12px text-muted">
            {{ remainText(sent.expiresAt) }}{{ sent.burnAfterRead ? ' · 阅后即焚' : '' }} · 在另一台设备打开「文本快传」输入取件码，或扫码打开
          </text>
          <view class="mt-3 flex flex-wrap justify-center gap-2">
            <wd-button size="small" icon="copy" @click="copyText(sent.code)">
              复制取件码
            </wd-button>
            <wd-button size="small" type="info" plain :disabled="!linkOf(sent.code)" @click="copyText(linkOf(sent.code))">
              复制链接
            </wd-button>
            <wd-button size="small" type="info" plain @click="toQrcode(sent.code)">
              二维码
            </wd-button>
          </view>
        </view>
      </ot-panel>

      <!-- 我的快传 -->
      <ot-panel :title="`我的快传 · ${list.length}`">
        <template #extra>
          <view class="i-carbon-renew cursor-pointer text-17px text-muted" :class="{ 'animate-spin': listLoading }" @click="loadList" />
        </template>
        <view v-if="!list.length" class="py-6 text-center text-13px text-muted">
          {{ listLoading ? '加载中…' : '还没有快传，发送后会显示在这里，你的所有设备都能看到' }}
        </view>
        <view v-for="item in list" :key="item.code" class="ot-paste__item">
          <view class="flex items-start gap-2">
            <text class="min-w-0 flex-1 break-all text-14px text-main leading-relaxed">{{ item.preview }}</text>
            <text class="ot-paste__code-tag ot-mono" @click="copyText(item.code)">{{ prettyCode(item.code) }}</text>
          </view>
          <view class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-12px text-muted">
            <text>{{ dayjs(item.createdAt * 1000).format('MM-DD HH:mm') }}</text>
            <text>{{ item.size }} 字</text>
            <text>{{ remainText(item.expiresAt) }}</text>
            <text v-if="item.views">被提取 {{ item.views }} 次</text>
            <text v-if="item.burnAfterRead" class="ot-paste__burn">阅后即焚</text>
          </view>
          <view class="ot-paste__actions">
            <view class="ot-paste__action" @click="copyContent(item)">
              <view class="i-carbon-copy" />复制内容
            </view>
            <view class="ot-paste__action" @click="copyText(item.code)">
              <view class="i-carbon-password" />复制取件码
            </view>
            <view class="ot-paste__action" @click="toQrcode(item.code)">
              <view class="i-carbon-qr-code" />二维码
            </view>
            <view class="ot-paste__action is-danger" @click="remove(item)">
              <view class="i-carbon-trash-can" />删除
            </view>
          </view>
        </view>
      </ot-panel>
    </template>

    <view class="px-1 text-12px text-muted leading-20px">
      内容在服务端加密保存，到期自动删除。拿到取件码或链接的人无需登录即可提取，请只发给信任的人，敏感内容建议开启阅后即焚；你登录的所有设备都能在「我的快传」中看到自己发送的内容。
    </view>
    <qr-popup v-model="qrOpen" :text="qrText" :note="qrNote" />
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-paste__code-input {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 12px;
  border-radius: 10px;
  background: var(--ot-fill);
  color: var(--ot-text);
}

.ot-paste__msg {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 13px;

  &.is-error {
    color: #dc2626;
    background: rgba(239, 68, 68, 0.08);
  }

  &.is-warn {
    color: #b45309;
    background: rgba(245, 158, 11, 0.12);
  }
}

.ot-paste__fetched {
  margin-top: 12px;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid var(--ot-border);
}

.ot-paste__content {
  display: block;
  max-height: 360px;
  overflow-y: auto;
  padding: 12px;
  border-radius: 10px;
  background: var(--ot-fill);
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--ot-text);
}

.ot-paste__result {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-top: 16px;
  padding: 16px;
  border-radius: 12px;
  text-align: center;
  border: 1px solid rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.06);
}

.ot-paste__big-code {
  margin: 4px 0;
  font-size: 34px;
  font-weight: 700;
  letter-spacing: 4px;
  color: var(--wot-color-theme);
}

.ot-paste__item {
  padding: 12px 0;

  & + & {
    border-top: 1px solid var(--ot-border);
  }
}

.ot-paste__code-tag {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--wot-color-theme);
  background: rgba(79, 110, 247, 0.1);
  cursor: pointer;
}

.ot-paste__burn {
  padding: 0 6px;
  border-radius: 6px;
  color: #c2410c;
  background: rgba(249, 115, 22, 0.12);
}

.ot-paste__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.ot-paste__action {
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
</style>
