<script lang="ts" setup>
// 一个会话（仅 H5）：终端 + 侧边面板（文件、监控、快捷命令），连接中 / 出错时显示遮罩
import type { Session } from '../lib/sessions'
import { toast } from '@/utils/common'
import { dropMonState } from '../lib/monitor-state'
import { closeSession, duplicateSession, getConn, reconnect, writers } from '../lib/sessions'
import { dropSftpState } from '../lib/sftp-state'
import { data, saveSettings } from '../lib/store'
import { hostLabel } from '../lib/types'
import { shellQuote } from '../lib/util'
import WsMonitor from './ws-monitor.vue'
import WsSftp from './ws-sftp.vue'
import WsSnippetsPanel from './ws-snippets-panel.vue'
import WsTerminal from './ws-terminal.vue'

const props = defineProps<{
  session: Session
  active: boolean
  wide: boolean
}>()

const emit = defineEmits<{
  editHost: [id: string]
}>()

const s = props.session
const term = ref<InstanceType<typeof WsTerminal>>()
let shellId = 0
let shellOpenFor = -1

const fullscreen = ref(false)
const searching = ref(false)
const query = ref('')
const ctrlOn = ref(false)
const altOn = ref(false)

function send(text: string) {
  const conn = getConn(s.key)
  if (conn && shellId && s.status === 'connected')
    conn.ssh.write(shellId, text)
}

/** 终端输入：断开时按回车重连；手机辅助键的 Ctrl / Alt 作用于下一个按键 */
function onInput(d: string) {
  if (s.status !== 'connected') {
    if ((s.status === 'closed' || s.status === 'error') && d === '\r')
      reconnect(s)
    return
  }
  if (ctrlOn.value && d.length === 1) {
    const c = d.toUpperCase().charCodeAt(0)
    if (c >= 64 && c <= 95)
      d = String.fromCharCode(c & 31)
    ctrlOn.value = false
  }
  if (altOn.value) {
    d = `\x1B${d}`
    altOn.value = false
  }
  send(d)
}

function onResize(size: { cols: number, rows: number }) {
  const conn = getConn(s.key)
  if (conn && shellId)
    conn.ssh.resize(shellId, size.cols, size.rows)
}

async function openShell() {
  const conn = getConn(s.key)
  if (!conn || !term.value || shellOpenFor === s.generation)
    return
  shellOpenFor = s.generation
  if (s.generation > 1)
    term.value.write('\r\n\x1B[90m──────── 已重新连接 ────────\x1B[0m\r\n')
  if (s.banner)
    term.value.write(s.banner.replace(/\r?\n/g, '\r\n'))
  const { cols, rows } = term.value.size()
  try {
    shellId = await conn.ssh.shell(conn.id, {
      cols,
      rows,
      env: { LANG: 'en_US.UTF-8', LC_CTYPE: 'en_US.UTF-8' },
      onData: d => term.value?.write(d),
      onExit: (code) => {
        shellId = 0
        term.value?.write(`\r\n\x1B[90m[Shell 已退出，代码 ${code}]\x1B[0m\r\n`)
        // Shell 退出（如输入 exit）后断开连接
        if (s.status === 'connected')
          getConn(s.key)?.close()
      },
    })
    if (s.host.initCommand)
      send(`${s.host.initCommand.replace(/\r?\n/g, '\r')}\r`)
    if (props.active)
      term.value.focus()
  }
  catch (e: any) {
    term.value.write(`\r\n\x1B[31m无法打开终端：${e?.message || e}\x1B[0m\r\n`)
  }
}

watch(() => [s.generation, s.status] as const, ([, status], old) => {
  if (status === 'connected')
    nextTick(openShell)
  if ((status === 'closed' || status === 'error') && old?.[1] === 'connected') {
    shellId = 0
    term.value?.write(`\r\n\x1B[31m${s.error || '连接已断开'}\x1B[0m\r\n\x1B[90m按回车键重新连接\x1B[0m\r\n`)
  }
})

watch(() => props.active, (v) => {
  if (v) {
    nextTick(() => {
      term.value?.fit()
      term.value?.focus()
    })
  }
})

watch(() => s.panel, () => nextTick(() => term.value?.fit()))
watch(fullscreen, () => nextTick(() => term.value?.fit()))

onMounted(() => {
  writers.set(s.key, send)
  if (s.status === 'connected')
    nextTick(openShell)
})
onBeforeUnmount(() => {
  writers.delete(s.key)
  dropSftpState(s.key)
  dropMonState(s.key)
})

function togglePanel(p: Session['panel']) {
  s.panel = s.panel === p ? '' : p
}

function find(prev = false) {
  if (!query.value)
    return
  const found = prev ? term.value?.findPrevious(query.value) : term.value?.findNext(query.value)
  if (!found)
    toast('没有找到')
}

function closeSearch() {
  searching.value = false
  term.value?.clearSearch()
  term.value?.focus()
}

function exportLog() {
  const text = term.value?.getText() || ''
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  a.download = `${s.title}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.log`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function changeFont(delta: number) {
  const fontSize = Math.min(28, Math.max(10, data.settings.fontSize + delta))
  saveSettings({ fontSize }).catch(() => {})
}

function openMenu() {
  const items: [string, () => void][] = [
    ['复制会话（再开一个）', () => duplicateSession(s)],
    ['清屏', () => term.value?.clear()],
    ['导出终端内容', exportLog],
    ['字号放大', () => changeFont(1)],
    ['字号缩小', () => changeFont(-1)],
    [fullscreen.value ? '退出全屏' : '全屏', () => (fullscreen.value = !fullscreen.value)],
    ...(s.hostId ? [['编辑服务器', () => emit('editHost', s.hostId)] as [string, () => void]] : []),
    ['关闭会话', () => closeSession(s.key)],
  ]
  uni.showActionSheet({
    itemList: items.map(i => i[0]),
    success: ({ tapIndex }) => items[tapIndex]?.[1](),
  })
}

function cdTo(path: string) {
  send(`cd ${shellQuote(path)}\r`)
  term.value?.focus()
}

function runSnippet(text: string) {
  send(text)
  term.value?.focus()
}

const KEYS = [
  { label: 'Esc', seq: '\x1B' },
  { label: 'Tab', seq: '\t' },
  { label: 'Ctrl', mod: 'ctrl' },
  { label: 'Alt', mod: 'alt' },
  { label: '↑', seq: '\x1B[A' },
  { label: '↓', seq: '\x1B[B' },
  { label: '←', seq: '\x1B[D' },
  { label: '→', seq: '\x1B[C' },
  { label: 'Home', seq: '\x1B[H' },
  { label: 'End', seq: '\x1B[F' },
  { label: 'PgUp', seq: '\x1B[5~' },
  { label: 'PgDn', seq: '\x1B[6~' },
  { label: '^C', seq: '\x03' },
  { label: '^D', seq: '\x04' },
  { label: '|', seq: '|' },
  { label: '/', seq: '/' },
  { label: '-', seq: '-' },
  { label: '~', seq: '~' },
]

function pressKey(k: typeof KEYS[number]) {
  if (k.mod === 'ctrl')
    ctrlOn.value = !ctrlOn.value
  else if (k.mod === 'alt')
    altOn.value = !altOn.value
  else if (k.seq)
    onInput(k.seq)
  term.value?.focus()
}

const showKeys = computed(() => !props.wide)
</script>

<template>
  <view class="ot-ss" :class="{ 'is-full': fullscreen, 'is-wide': wide }">
    <view class="ot-ss__bar">
      <view class="ot-ss__dot" :class="`is-${s.status}`" />
      <text class="ot-ss__label truncate">{{ hostLabel(s.host) }}</text>
      <view class="flex-1" />
      <view v-if="s.status === 'closed' || s.status === 'error'" class="ot-ss__btn is-primary" @click="reconnect(s)">
        <view class="i-carbon-renew" /><text>重连</text>
      </view>
      <view class="ot-ss__btn" :class="{ 'is-on': s.panel === 'files' }" title="文件（SFTP）" @click="togglePanel('files')">
        <view class="i-carbon-folder" /><text v-if="wide">文件</text>
      </view>
      <view class="ot-ss__btn" :class="{ 'is-on': s.panel === 'monitor' }" title="服务器监控" @click="togglePanel('monitor')">
        <view class="i-carbon-dashboard" /><text v-if="wide">监控</text>
      </view>
      <view class="ot-ss__btn" :class="{ 'is-on': s.panel === 'snippets' }" title="快捷命令" @click="togglePanel('snippets')">
        <view class="i-carbon-flash" /><text v-if="wide">命令</text>
      </view>
      <view class="ot-ss__btn" title="搜索（Ctrl+Shift+F）" @click="searching = !searching">
        <view class="i-carbon-search" />
      </view>
      <view class="ot-ss__btn" title="更多" @click="openMenu">
        <view class="i-carbon-overflow-menu-horizontal" />
      </view>
    </view>

    <view class="ot-ss__body">
      <view class="ot-ss__main">
        <view v-if="searching" class="ot-ss__search">
          <input v-model="query" class="min-w-0 flex-1 text-13px" placeholder="在终端输出中搜索" :focus="true" confirm-type="search" @confirm="find(false)">
          <view class="i-carbon-chevron-up ot-ss__icon" title="上一个" @click="find(true)" />
          <view class="i-carbon-chevron-down ot-ss__icon" title="下一个" @click="find(false)" />
          <view class="i-carbon-close ot-ss__icon" @click="closeSearch" />
        </view>
        <view class="ot-ss__term">
          <ws-terminal ref="term" :settings="data.settings" @data="onInput" @resize="onResize" @search="searching = true" />
          <view v-if="s.status === 'connecting' && !s.generation" class="ot-ss__overlay">
            <view class="ot-ss__card">
              <view class="i-carbon-renew animate-spin text-28px text-[var(--wot-color-theme)]" />
              <text class="mt-3 text-14px text-main">{{ s.statusText || '正在连接…' }}</text>
              <text class="mt-1 text-12px text-muted">{{ hostLabel(s.host) }}</text>
              <wd-button size="small" type="info" plain custom-class="mt-4" @click="closeSession(s.key)">
                取消
              </wd-button>
            </view>
          </view>
          <view v-else-if="s.status === 'connecting'" class="ot-ss__toast">
            <view class="i-carbon-renew animate-spin" />{{ s.statusText || '正在重新连接…' }}
          </view>
          <view v-if="s.status === 'error' && !s.generation" class="ot-ss__overlay">
            <view class="ot-ss__card">
              <view class="i-carbon-warning-alt text-30px text-red-500" />
              <text class="mt-3 text-14px text-main font-600">连接失败</text>
              <text class="mt-2 break-all text-13px text-main">{{ s.error }}</text>
              <text v-if="s.hint" class="mt-2 text-12px text-muted leading-18px">{{ s.hint }}</text>
              <view class="mt-4 flex gap-2">
                <wd-button size="small" @click="reconnect(s)">
                  重试
                </wd-button>
                <wd-button v-if="s.hostId" size="small" type="info" plain @click="emit('editHost', s.hostId)">
                  编辑服务器
                </wd-button>
                <wd-button size="small" type="info" plain @click="closeSession(s.key)">
                  关闭
                </wd-button>
              </view>
            </view>
          </view>
        </view>
        <view v-if="showKeys" class="ot-ss__keys">
          <view
            v-for="k in KEYS" :key="k.label" class="ot-ss__key"
            :class="{ 'is-on': (k.mod === 'ctrl' && ctrlOn) || (k.mod === 'alt' && altOn) }"
            @click="pressKey(k)"
          >
            {{ k.label }}
          </view>
        </view>
      </view>

      <view v-if="s.panel" class="ot-ss__panel">
        <ws-sftp v-if="s.panel === 'files'" :session="s" @cd="cdTo" @close="s.panel = ''" />
        <ws-monitor v-else-if="s.panel === 'monitor'" :session="s" @close="s.panel = ''" />
        <ws-snippets-panel v-else-if="s.panel === 'snippets'" @send="runSnippet" @close="s.panel = ''" />
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.ot-ss {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--ot-card);

  &.is-full {
    position: fixed;
    inset: 0;
    z-index: 900;
  }
}

.ot-ss__bar {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 38px;
  padding: 0 8px 0 12px;
  border-bottom: 1px solid var(--ot-border);
  font-size: 13px;
}

.ot-ss__dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  margin-right: 4px;
  border-radius: 50%;
  background: #a1a1aa;

  &.is-connected {
    background: #22c55e;
  }

  &.is-connecting {
    background: #f59e0b;
  }

  &.is-error,
  &.is-closed {
    background: #ef4444;
  }
}

.ot-ss__label {
  min-width: 0;
  color: var(--ot-text-2);
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
}

.ot-ss__btn {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  color: var(--ot-text-2);
  font-size: 13px;
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
  }

  &.is-on {
    color: var(--wot-color-theme);
    background: color-mix(in srgb, var(--wot-color-theme) 12%, transparent);
  }

  &.is-primary {
    color: #fff;
    background: var(--wot-color-theme);
  }
}

.ot-ss__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.is-wide .ot-ss__body {
  flex-direction: row;
}

.ot-ss__main {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.ot-ss__term {
  position: relative;
  flex: 1;
  min-height: 0;
}

.ot-ss__panel {
  display: flex;
  flex-direction: column;
  height: 46%;
  min-height: 0;
  border-top: 1px solid var(--ot-border);
}

.is-wide .ot-ss__panel {
  width: 400px;
  height: auto;
  border-top: none;
  border-left: 1px solid var(--ot-border);
}

.ot-ss__search {
  position: absolute;
  top: 8px;
  right: 16px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 4px;
  width: min(320px, 80%);
  height: 34px;
  padding: 0 6px 0 12px;
  border-radius: 8px;
  background: var(--ot-card);
  color: var(--ot-text);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

.ot-ss__icon {
  flex-shrink: 0;
  padding: 4px;
  font-size: 16px;
  color: var(--ot-text-2);
  cursor: pointer;
}

.ot-ss__overlay {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.35);
}

.ot-ss__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 420px;
  padding: 24px 20px;
  border-radius: 14px;
  text-align: center;
  background: var(--ot-card);
}

.ot-ss__toast {
  position: absolute;
  top: 10px;
  left: 50%;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  color: #fff;
  background: rgba(0, 0, 0, 0.65);
  transform: translateX(-50%);
}

.ot-ss__keys {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
  padding: 6px;
  overflow-x: auto;
  border-top: 1px solid var(--ot-border);
  background: var(--ot-fill);
  scrollbar-width: none;
}

.ot-ss__key {
  flex-shrink: 0;
  min-width: 34px;
  height: 32px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 32px;
  text-align: center;
  color: var(--ot-text);
  background: var(--ot-card);
  user-select: none;

  &.is-on {
    color: #fff;
    background: var(--wot-color-theme);
  }
}
</style>
