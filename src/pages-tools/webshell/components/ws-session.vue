<script lang="ts" setup>
// 一个会话（仅 H5），布局仿 FinalShell：左侧监控栏；右侧上方终端 + 命令输入栏，下方「文件 / 命令」面板（可拖动分隔条调整高度）
import type { Session } from '../lib/sessions'
import { copyText, toast } from '@/utils/common'
import { openMenu } from '../lib/menu'
import { dropMonState } from '../lib/monitor-state'
import { closeSession, duplicateSession, getConn, layoutPrefs, reconnect, writers } from '../lib/sessions'
import { dropSftpState } from '../lib/sftp-state'
import { data, saveSettings } from '../lib/store'
import { hostLabel } from '../lib/types'
import { shellQuote } from '../lib/util'
import WsCmdbar from './ws-cmdbar.vue'
import WsSftp from './ws-sftp.vue'
import WsSidebar from './ws-sidebar.vue'
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
const mainEl = ref<HTMLElement>()
let shellId = 0
let shellOpenFor = -1

const fullscreen = ref(false)
/** 右侧区域高度：底部面板最多占到给终端留出 160px 为止 */
const mainH = ref(600)
const bottomH = computed(() => Math.max(100, Math.min(props.wide ? layoutPrefs.bottomHeight : Math.min(layoutPrefs.bottomHeight, 300), mainH.value - 160)))
let resizeObs: ResizeObserver | undefined
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

watch(() => [layoutPrefs.sidebar, layoutPrefs.bottomOpen, bottomH.value, fullscreen.value], () => nextTick(() => term.value?.fit()))

onMounted(() => {
  resizeObs = new ResizeObserver(() => (mainH.value = mainEl.value?.clientHeight || mainH.value))
  if (mainEl.value)
    resizeObs.observe(mainEl.value)
  writers.set(s.key, send)
  if (s.status === 'connected')
    nextTick(openShell)
})
onBeforeUnmount(() => {
  resizeObs?.disconnect()
  writers.delete(s.key)
  dropSftpState(s.key)
  dropMonState(s.key)
})

/* ---------------- 底部面板与分隔条 ---------------- */

function showBottom(tab: Session['bottom']) {
  if (layoutPrefs.bottomOpen && s.bottom === tab) {
    layoutPrefs.bottomOpen = false
    return
  }
  s.bottom = tab
  layoutPrefs.bottomOpen = true
}

function startDrag(e: MouseEvent | TouchEvent) {
  e.preventDefault()
  const y0 = 'touches' in e ? e.touches[0].clientY : e.clientY
  const h0 = bottomH.value
  const max = Math.max(160, mainH.value - 160)
  const move = (ev: MouseEvent | TouchEvent) => {
    const y = 'touches' in ev ? ev.touches[0].clientY : ev.clientY
    layoutPrefs.bottomHeight = Math.round(Math.min(max, Math.max(120, h0 - (y - y0))))
  }
  const up = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
    window.removeEventListener('touchmove', move)
    window.removeEventListener('touchend', up)
    document.body.style.cursor = ''
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
  window.addEventListener('touchmove', move, { passive: false })
  window.addEventListener('touchend', up)
  document.body.style.cursor = 'row-resize'
}

/* ---------------- 终端右键菜单 ---------------- */

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

function termMenu(e: MouseEvent) {
  const connected = s.status === 'connected'
  openMenu(e, [
    { label: '复制', icon: 'i-carbon-copy', hint: 'Ctrl+Shift+C', disabled: !term.value?.hasSelection(), action: () => term.value?.copySelection() },
    { label: '粘贴', icon: 'i-carbon-paste', hint: 'Ctrl+Shift+V', disabled: !connected, action: () => term.value?.paste() },
    { label: '全选', icon: 'i-carbon-select-window', action: () => term.value?.selectAll() },
    { label: '查找', icon: 'i-carbon-search', hint: 'Ctrl+Shift+F', divider: true, action: () => (searching.value = true) },
    { label: '清屏', icon: 'i-carbon-clean', action: () => term.value?.clear() },
    { label: '导出终端内容', icon: 'i-carbon-document-export', action: exportLog },
    { label: '字号放大', icon: 'i-carbon-zoom-in', divider: true, action: () => changeFont(1) },
    { label: '字号缩小', icon: 'i-carbon-zoom-out', action: () => changeFont(-1) },
    { label: fullscreen.value ? '退出全屏' : '全屏', icon: 'i-carbon-fit-to-screen', action: () => (fullscreen.value = !fullscreen.value) },
    { label: layoutPrefs.sidebar ? '隐藏监控栏' : '显示监控栏', icon: 'i-carbon-side-panel-close', action: () => (layoutPrefs.sidebar = !layoutPrefs.sidebar) },
    { label: '复制会话', icon: 'i-carbon-copy-file', divider: true, action: () => duplicateSession(s) },
    { label: '重新连接', icon: 'i-carbon-renew', action: () => reconnect(s) },
    { label: '复制地址', icon: 'i-carbon-copy', action: () => copyText(s.host.host) },
    { label: '编辑服务器', icon: 'i-carbon-edit', disabled: !s.hostId, action: () => emit('editHost', s.hostId) },
    { label: '关闭会话', icon: 'i-carbon-close', danger: true, divider: true, action: () => closeSession(s.key) },
  ])
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
</script>

<template>
  <div class="ws-ss" :class="{ 'is-full': fullscreen }">
    <!-- 左侧监控栏 -->
    <div v-if="wide && layoutPrefs.sidebar" class="ws-ss__side">
      <ws-sidebar :session="s" />
    </div>

    <div ref="mainEl" class="ws-ss__main">
      <!-- 终端 -->
      <div class="ws-ss__term">
        <ws-terminal ref="term" :settings="data.settings" @data="onInput" @resize="onResize" @search="searching = true" @menu="termMenu" />
        <div v-if="searching" class="ws-ss__search">
          <input v-model="query" class="ws-ss__search-input" placeholder="在终端输出中搜索" @keydown.enter="find($event.shiftKey)" @keydown.esc="closeSearch">
          <span class="i-carbon-chevron-up ws-ss__icon" title="上一个（Shift+Enter）" @click="find(true)" />
          <span class="i-carbon-chevron-down ws-ss__icon" title="下一个（Enter）" @click="find(false)" />
          <span class="i-carbon-close ws-ss__icon" @click="closeSearch" />
        </div>
        <div v-if="s.status === 'connecting' && !s.generation" class="ws-ss__overlay">
          <div class="ws-ss__card">
            <span class="i-carbon-renew animate-spin text-28px text-[var(--wot-color-theme)]" />
            <span class="mt-3 text-14px text-main">{{ s.statusText || '正在连接…' }}</span>
            <span class="mt-1 text-12px text-muted">{{ hostLabel(s.host) }}</span>
            <wd-button size="small" type="info" plain custom-class="mt-4" @click="closeSession(s.key)">
              取消
            </wd-button>
          </div>
        </div>
        <div v-else-if="s.status === 'connecting'" class="ws-ss__toast">
          <span class="i-carbon-renew animate-spin" />{{ s.statusText || '正在重新连接…' }}
        </div>
        <div v-if="s.status === 'error' && !s.generation" class="ws-ss__overlay">
          <div class="ws-ss__card">
            <span class="i-carbon-warning-alt text-30px text-red-500" />
            <span class="mt-3 text-14px text-main font-600">连接失败</span>
            <span class="mt-2 break-all text-13px text-main">{{ s.error }}</span>
            <span v-if="s.hint" class="mt-2 text-12px text-muted leading-18px">{{ s.hint }}</span>
            <div class="mt-4 flex gap-2">
              <wd-button size="small" @click="reconnect(s)">
                重试
              </wd-button>
              <wd-button v-if="s.hostId" size="small" type="info" plain @click="emit('editHost', s.hostId)">
                编辑服务器
              </wd-button>
              <wd-button size="small" type="info" plain @click="closeSession(s.key)">
                关闭
              </wd-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 手机辅助键 -->
      <div v-if="!wide" class="ws-ss__keys">
        <span
          v-for="k in KEYS" :key="k.label" class="ws-ss__key"
          :class="{ 'is-on': (k.mod === 'ctrl' && ctrlOn) || (k.mod === 'alt' && altOn) }"
          @click="pressKey(k)"
        >{{ k.label }}</span>
      </div>

      <!-- 命令输入栏 -->
      <ws-cmdbar v-if="wide" @send="runSnippet" />

      <!-- 底部面板：文件 / 命令 -->
      <div v-if="layoutPrefs.bottomOpen" class="ws-ss__split" title="拖动调整高度" @mousedown="startDrag" @touchstart="startDrag" />
      <div class="ws-ss__tabs">
        <span class="ws-ss__tab" :class="{ 'is-on': layoutPrefs.bottomOpen && s.bottom === 'files' }" @click="showBottom('files')">
          <span class="i-carbon-folder" />文件
        </span>
        <span class="ws-ss__tab" :class="{ 'is-on': layoutPrefs.bottomOpen && s.bottom === 'snippets' }" @click="showBottom('snippets')">
          <span class="i-carbon-flash" />命令
        </span>
        <span class="flex-1" />
        <span v-if="wide" class="ws-ss__tool" :class="{ 'is-on': layoutPrefs.sidebar }" title="显示 / 隐藏监控栏" @click="layoutPrefs.sidebar = !layoutPrefs.sidebar">
          <span class="i-carbon-side-panel-open" />
        </span>
        <span class="ws-ss__tool" :title="layoutPrefs.bottomOpen ? '收起' : '展开'" @click="layoutPrefs.bottomOpen = !layoutPrefs.bottomOpen">
          <span :class="layoutPrefs.bottomOpen ? 'i-carbon-chevron-down' : 'i-carbon-chevron-up'" />
        </span>
      </div>
      <div v-show="layoutPrefs.bottomOpen" class="ws-ss__bottom" :style="{ height: `${bottomH}px` }">
        <ws-sftp v-show="s.bottom === 'files'" :session="s" :wide="wide" @cd="cdTo" />
        <ws-snippets-panel v-if="s.bottom === 'snippets'" layout="bar" @send="runSnippet" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ws-ss {
  display: flex;
  height: 100%;
  min-height: 0;
  background: var(--ot-card);

  &.is-full {
    position: fixed;
    inset: 0;
    z-index: 900;
  }
}

.ws-ss__side {
  flex-shrink: 0;
  width: 212px;
  border-right: 1px solid var(--ot-border);
}

.ws-ss__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.ws-ss__term {
  position: relative;
  flex: 1;
  min-height: 80px;
}

.ws-ss__split {
  flex-shrink: 0;
  height: 5px;
  margin-bottom: -5px;
  position: relative;
  z-index: 2;
  cursor: row-resize;

  &:hover {
    background: color-mix(in srgb, var(--wot-color-theme) 40%, transparent);
  }
}

.ws-ss__tabs {
  display: flex;
  flex-shrink: 0;
  align-items: stretch;
  height: 28px;
  padding: 0 4px;
  border-top: 1px solid var(--ot-border);
  border-bottom: 1px solid var(--ot-border);
  background: var(--ot-fill);
  font-size: 12px;
  user-select: none;
}

.ws-ss__tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px;
  color: var(--ot-text-2);
  cursor: pointer;

  &.is-on {
    color: var(--ot-text);
    background: var(--ot-card);
    box-shadow: inset 0 2px 0 var(--wot-color-theme);
  }
}

.ws-ss__tool {
  display: flex;
  align-items: center;
  padding: 0 8px;
  font-size: 14px;
  color: var(--ot-text-3);
  cursor: pointer;

  &:hover,
  &.is-on {
    color: var(--wot-color-theme);
  }
}

.ws-ss__bottom {
  flex-shrink: 0;
  min-height: 0;
}

.ws-ss__search {
  position: absolute;
  top: 6px;
  right: 18px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 2px;
  width: min(320px, 80%);
  height: 30px;
  padding: 0 4px 0 8px;
  border: 1px solid var(--ot-border);
  border-radius: 4px;
  background: var(--ot-card);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

.ws-ss__search-input {
  flex: 1;
  min-width: 0;
  border: none;
  font-size: 13px;
  color: var(--ot-text);
  background: transparent;
  outline: none;
}

.ws-ss__icon {
  flex-shrink: 0;
  padding: 3px;
  font-size: 15px;
  color: var(--ot-text-2);
  cursor: pointer;
}

.ws-ss__overlay {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.35);
}

.ws-ss__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 420px;
  padding: 24px 20px;
  border-radius: 10px;
  text-align: center;
  background: var(--ot-card);
}

.ws-ss__toast {
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

.ws-ss__keys {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
  padding: 6px;
  overflow-x: auto;
  border-top: 1px solid var(--ot-border);
  background: var(--ot-fill);
  scrollbar-width: none;
}

.ws-ss__key {
  flex-shrink: 0;
  min-width: 34px;
  height: 32px;
  padding: 0 8px;
  box-sizing: border-box;
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
