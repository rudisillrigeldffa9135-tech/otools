<script lang="ts" setup>
// WebShell：网页版 SSH 客户端（终端、SFTP、服务器监控、快捷命令、端到端加密的云同步）。仅 H5。
// #ifdef H5
import type { Host } from './lib/types'
import { useUserStore } from '@/store/user'
import HostEditor from './components/host-editor.vue'
import ImportConfig from './components/import-config.vue'
import ImportFinalshell from './components/import-finalshell.vue'
import KeyManager from './components/key-manager.vue'
import WsConnManager from './components/ws-conn-manager.vue'
import WsDialogs from './components/ws-dialogs.vue'
import WsLock from './components/ws-lock.vue'
import WsMenu from './components/ws-menu.vue'
import WsOverview from './components/ws-overview.vue'
import WsSession from './components/ws-session.vue'
import WsSettings from './components/ws-settings.vue'
import WsSnippetsPanel from './components/ws-snippets-panel.vue'
import { openMenu } from './lib/menu'
import { startMonitor, stopMonitor } from './lib/monitor-state'
import { activeKey, closeAll, closeSession, duplicateSession, openSession, reconnect, sessions } from './lib/sessions'
import { data, init, lock, startAutoSync, stopAutoSync } from './lib/store'
import './styles.scss'
// #endif
import { copyText } from '@/utils/common'
import { getPageUrl } from '@/utils/site'

definePage({
  style: { navigationBarTitleText: 'WebShell' },
})

const pageUrl = getPageUrl('/pages-tools/webshell/index')

// #ifdef H5
const userStore = useUserStore()
const wide = ref(window.innerWidth >= 900)
const workspace = ref<HTMLElement>()
const height = ref(600)

const editorOpen = ref(false)
const editingHost = ref<Host | null>(null)
const keysOpen = ref(false)
const snippetsOpen = ref(false)
const settingsOpen = ref(false)
const importOpen = ref(false)
const importFsOpen = ref(false)
const managerOpen = ref(false)

function layout() {
  wide.value = window.innerWidth >= 900
  const el = (workspace.value as any)?.$el ?? workspace.value
  const top = el?.getBoundingClientRect?.().top ?? 120
  height.value = Math.max(420, window.innerHeight - Math.max(0, top) - (wide.value ? 16 : 8))
}

function editHost(h: Host | null) {
  editingHost.value = h
  editorOpen.value = true
}

function editHostById(id: string) {
  const h = data.hosts.find(x => x.id === id)
  if (h)
    editHost(h)
}

function onSaved(h: Host, connect: boolean) {
  if (connect)
    openSession(h)
}

function closeTab(key: string) {
  const s = sessions.find(x => x.key === key)
  if (!s)
    return
  const done = () => closeSession(key)
  if (s.status === 'connected' && data.settings.confirmClose) {
    uni.showModal({
      title: '关闭会话',
      content: `确定断开「${s.title}」吗？`,
      success: ({ confirm }) => confirm && done(),
    })
  }
  else {
    done()
  }
}

/** 关闭多个标签：有已连接的会话时确认一次 */
function closeMany(keys: string[]) {
  const list = sessions.filter(x => keys.includes(x.key))
  if (!list.length)
    return
  const done = () => list.forEach(x => closeSession(x.key))
  const live = list.filter(x => x.status === 'connected').length
  if (live && data.settings.confirmClose) {
    uni.showModal({
      title: '关闭会话',
      content: `将断开 ${live} 个已连接的会话，确定吗？`,
      success: ({ confirm }) => confirm && done(),
    })
  }
  else {
    done()
  }
}

/** 标签右键菜单（仿 FinalShell） */
function tabMenu(e: MouseEvent, key: string) {
  const i = sessions.findIndex(x => x.key === key)
  const s = sessions[i]
  if (!s)
    return
  activeKey.value = key
  openMenu(e, [
    { label: '关闭', icon: 'i-carbon-close', action: () => closeTab(key) },
    { label: '关闭其他标签', icon: 'i-carbon-close-outline', disabled: sessions.length < 2, action: () => closeMany(sessions.filter(x => x.key !== key).map(x => x.key)) },
    { label: '关闭右侧标签', icon: 'i-carbon-arrow-right', disabled: i === sessions.length - 1, action: () => closeMany(sessions.slice(i + 1).map(x => x.key)) },
    { label: '关闭全部标签', icon: 'i-carbon-close-filled', action: () => closeMany(sessions.map(x => x.key)) },
    { label: '复制标签', icon: 'i-carbon-copy-file', divider: true, action: () => duplicateSession(s) },
    { label: '重新连接', icon: 'i-carbon-renew', action: () => reconnect(s) },
    { label: '编辑服务器', icon: 'i-carbon-edit', disabled: !s.hostId, action: () => editHostById(s.hostId) },
  ])
}

function doLock() {
  if (sessions.some(s => s.status === 'connected')) {
    uni.showModal({
      title: '锁定',
      content: '锁定会断开所有会话，确定吗？',
      success: ({ confirm }) => {
        if (confirm) {
          closeAll()
          lock()
        }
      },
    })
  }
  else {
    closeAll()
    lock()
  }
}

/* ---------- 空闲自动锁定：没有会话且长时间无操作 ---------- */
let lastActive = Date.now()
let idleTimer: ReturnType<typeof setInterval> | undefined
function touch() {
  lastActive = Date.now()
}
function checkIdle() {
  const m = data.settings.lockMinutes
  if (data.phase === 'ready' && m > 0 && !sessions.length && Date.now() - lastActive > m * 60_000)
    lock()
}

/** 有连接时关闭 / 刷新页面前提醒 */
function beforeUnload(e: BeforeUnloadEvent) {
  if (sessions.some(s => s.status === 'connected')) {
    e.preventDefault()
    e.returnValue = ''
  }
}

watch(() => data.phase, (p) => {
  if (p === 'ready') {
    startAutoSync()
    startMonitor()
    nextTick(layout)
  }
  else {
    stopAutoSync()
    stopMonitor()
  }
})

onLoad(() => {
  init(userStore.userInfo.userId || 0)
})

onMounted(() => {
  window.addEventListener('resize', layout)
  window.addEventListener('beforeunload', beforeUnload)
  for (const ev of ['keydown', 'mousedown', 'touchstart'])
    window.addEventListener(ev, touch, { passive: true })
  idleTimer = setInterval(checkIdle, 30_000)
  nextTick(layout)
})

onUnload(() => {
  closeAll()
  stopAutoSync()
  stopMonitor()
  clearInterval(idleTimer)
  window.removeEventListener('resize', layout)
  window.removeEventListener('beforeunload', beforeUnload)
  for (const ev of ['keydown', 'mousedown', 'touchstart'])
    window.removeEventListener(ev, touch)
})
// #endif
</script>

<template>
  <ot-tool-layout :max-width="1680">
    <!-- #ifdef H5 -->
    <view v-if="data.phase === 'loading'" class="ws-page__state">
      <view class="i-carbon-renew animate-spin text-24px text-muted" />
    </view>
    <view v-else-if="data.phase === 'error'" class="ws-page__state">
      <text class="text-14px text-main">{{ data.error }}</text>
      <wd-button size="small" custom-class="mt-3" @click="init(userStore.userInfo.userId || 0)">
        重试
      </wd-button>
    </view>
    <view v-else-if="data.phase !== 'ready'" class="ws-page__card">
      <ws-lock />
    </view>
    <view v-else ref="workspace" class="ws-page__card ws-page__ws" :style="{ height: `${height}px` }">
      <view class="ws-tabs">
        <view class="ws-tab is-icon" title="连接管理器" @click="managerOpen = true">
          <view class="i-carbon-folder-details" />
        </view>
        <view class="ws-tab is-home" :class="{ 'is-active': activeKey === 'overview' }" @click="activeKey = 'overview'">
          <view class="i-carbon-dashboard" /><text>概览</text>
        </view>
        <view
          v-for="s in sessions" :key="s.key" class="ws-tab" :class="{ 'is-active': activeKey === s.key }"
          :title="s.error || s.title" @click="activeKey = s.key" @mousedown.middle.prevent="closeTab(s.key)"
          @contextmenu="tabMenu($event, s.key)"
        >
          <view class="ws-tab__dot" :class="`is-${s.status}`" />
          <text class="ws-tab__name">{{ s.title }}</text>
          <view class="i-carbon-close ws-tab__close" @click.stop="closeTab(s.key)" />
        </view>
        <view class="ws-tab is-add" title="打开连接管理器" @click="managerOpen = true">
          <view class="i-carbon-add" />
        </view>
      </view>
      <view class="ws-body">
        <view v-show="activeKey === 'overview'" class="ws-pane">
          <ws-overview
            :wide="wide" :active="activeKey === 'overview'"
            @edit-host="editHost" @import-config="importOpen = true" @import-finalshell="importFsOpen = true"
            @keys="keysOpen = true" @snippets="snippetsOpen = true" @settings="settingsOpen = true" @lock="doLock"
          />
        </view>
        <view v-for="s in sessions" v-show="activeKey === s.key" :key="s.key" class="ws-pane">
          <ws-session :session="s" :active="activeKey === s.key" :wide="wide" @edit-host="editHostById" />
        </view>
      </view>
    </view>

    <host-editor v-model="editorOpen" :host="editingHost" @saved="onSaved" @manage-keys="keysOpen = true" />
    <key-manager v-model="keysOpen" />
    <ws-settings v-model="settingsOpen" />
    <import-config v-model="importOpen" />
    <import-finalshell v-model="importFsOpen" />
    <wd-popup v-model="snippetsOpen" position="center" :z-index="1000" custom-style="border-radius: 16px; width: min(94vw, 520px); height: 70vh; overflow: hidden;">
      <view class="h-70vh flex flex-col bg-[var(--ot-card)]">
        <ws-snippets-panel mode="manage" />
        <view class="border-t border-[var(--ot-border)] p-3 text-12px text-muted">
          在概览中点击命令会发送到所有已连接的会话；在会话里打开「命令」面板只发送到当前会话。
        </view>
      </view>
    </wd-popup>
    <ws-conn-manager v-model="managerOpen" @edit-host="editHost" @import-config="importOpen = true" @import-finalshell="importFsOpen = true" />
    <ws-dialogs />
    <ws-menu />
    <!-- #endif -->

    <!-- #ifndef H5 -->
    <view class="ws-page__card ws-page__state">
      <view class="i-carbon-terminal text-44px text-muted" />
      <text class="mt-3 text-15px text-main">WebShell 仅支持网页版</text>
      <text class="mt-2 px-4 text-center text-13px text-muted leading-20px">
        SSH 终端、SFTP 与服务器监控需要在电脑或手机浏览器中使用。复制下面的地址，用浏览器打开即可。
      </text>
      <view class="ot-mono mt-3 break-all px-4 text-center text-12px text-main" @click="copyText(pageUrl)">
        {{ pageUrl }}
      </view>
      <wd-button size="small" custom-class="mt-3" @click="copyText(pageUrl)">
        复制网址
      </wd-button>
    </view>
    <!-- #endif -->
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ws-page__card {
  border: 1px solid var(--ot-border);
  border-radius: 14px;
  background: var(--ot-card);
  overflow: hidden;
}

.ws-page__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 56px 16px;
}

.ws-page__ws {
  display: flex;
  flex-direction: column;
}

.ws-tabs {
  display: flex;
  flex-shrink: 0;
  align-items: flex-end;
  gap: 2px;
  height: 40px;
  padding: 0 6px;
  overflow-x: auto;
  border-bottom: 1px solid var(--ot-border);
  background: var(--ot-fill);
  scrollbar-width: none;
}

.ws-tab {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  max-width: 200px;
  height: 34px;
  padding: 0 10px;
  border-radius: 8px 8px 0 0;
  font-size: 13px;
  color: var(--ot-text-2);
  cursor: pointer;
  user-select: none;

  &:hover {
    color: var(--ot-text);
  }

  &.is-active {
    color: var(--ot-text);
    background: var(--ot-card);
    box-shadow:
      0 -1px 0 var(--ot-border),
      1px 0 0 var(--ot-border),
      -1px 0 0 var(--ot-border);
  }

  &.is-add,
  &.is-icon {
    padding: 0 8px;
    font-size: 16px;
  }

  &.is-icon {
    color: #f59e0b;
  }
}

.ws-tab__dot {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
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

.ws-tab__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-tab__close {
  flex-shrink: 0;
  font-size: 13px;
  opacity: 0.5;

  &:hover {
    opacity: 1;
  }
}

.ws-body {
  position: relative;
  flex: 1;
  min-height: 0;
}

.ws-pane {
  position: absolute;
  inset: 0;
}
</style>
