<script lang="ts" setup>
// WebShell 设置：终端外观、连接、安全（自动锁定、记住设备、修改主密码、已信任的主机密钥、连接记录、重置）
import type { IWebshellSession } from '@/api/webshell'
import type { Settings } from '../lib/types'
import dayjs from 'dayjs'
import { listWebshellSessions } from '@/api/webshell'
import { toast } from '@/utils/common'
import { formatBytes } from '../lib/monitor'
import { closeAll } from '../lib/sessions'
import { changePassword, data, remove, resetAll, saveSettings, toggleRemember } from '../lib/store'
import { THEMES } from '../lib/themes'

const open = defineModel<boolean>({ required: true })

type Tab = 'terminal' | 'connection' | 'security' | 'log'
const tab = ref<Tab>('terminal')
const TABS = [
  { value: 'terminal', label: '终端' },
  { value: 'connection', label: '连接' },
  { value: 'security', label: '安全' },
  { value: 'log', label: '连接记录' },
]
const THEME_OPTIONS = Object.entries(THEMES).map(([value, t]) => ({ value, label: t.label }))
const CURSORS = [
  { value: 'block', label: '方块' },
  { value: 'bar', label: '竖线' },
  { value: 'underline', label: '下划线' },
]
const LOCKS = [0, 5, 15, 30, 60, 240]

const log = ref<IWebshellSession[]>([])
const logLoading = ref(false)
const pwd = ref({ old: '', next: '', confirm: '', busy: false })

watch([open, tab], async ([o, t]) => {
  if (o && t === 'log') {
    logLoading.value = true
    try {
      log.value = await listWebshellSessions()
    }
    catch {}
    finally {
      logLoading.value = false
    }
  }
})

function set<K extends keyof Settings>(k: K, v: Settings[K]) {
  saveSettings({ [k]: v } as Partial<Settings>).catch(e => toast(e?.message || '保存失败'))
}

async function submitPassword() {
  const p = pwd.value
  if (!p.old || !p.next)
    return toast('请填写当前主密码与新主密码')
  if (p.next.length < 8)
    return toast('新主密码至少 8 位')
  if (p.next !== p.confirm)
    return toast('两次输入的新主密码不一致')
  p.busy = true
  try {
    await changePassword(p.old, p.next)
    pwd.value = { old: '', next: '', confirm: '', busy: false }
    toast('主密码已修改，其他设备需要用新密码重新解锁', 'success')
  }
  catch (e: any) {
    toast(e?.message || '修改失败')
  }
  finally {
    p.busy = false
  }
}

function forgetHostKey(id: string) {
  uni.showModal({
    title: '移除主机密钥',
    content: '移除后，下次连接这台服务器时会重新确认主机密钥。',
    success: ({ confirm }) => confirm && remove(id).catch(() => {}),
  })
}

function reset() {
  uni.showModal({
    title: '重置 WebShell',
    content: '将删除所有服务器、密钥、快捷命令与设置（所有设备），且无法恢复。忘记主密码时才需要这样做。',
    confirmText: '全部删除',
    confirmColor: '#ef4444',
    success: async ({ confirm }) => {
      if (!confirm)
        return
      closeAll()
      await resetAll()
      open.value = false
      toast('已重置，请重新设置主密码')
    },
  })
}

function duration(s: IWebshellSession) {
  const end = s.endedAt || Math.floor(Date.now() / 1000)
  const sec = Math.max(0, end - s.startedAt)
  return sec >= 3600 ? `${Math.floor(sec / 3600)} 小时 ${Math.floor((sec % 3600) / 60)} 分` : sec >= 60 ? `${Math.floor(sec / 60)} 分钟` : `${sec} 秒`
}
</script>

<template>
  <wd-popup v-model="open" position="center" :z-index="1100" custom-style="border-radius: 16px; width: min(94vw, 560px);">
    <view class="ws-form">
      <view class="mb-3 flex items-center">
        <text class="flex-1 text-16px text-main font-600">WebShell 设置</text>
        <view class="i-carbon-close cursor-pointer text-18px text-muted" @click="open = false" />
      </view>
      <ot-segmented v-model="tab" :options="TABS" size="small" />

      <template v-if="tab === 'terminal'">
        <view class="ws-row">
          <text class="ws-row__k">字号</text>
          <view class="flex items-center gap-3">
            <view class="ws-step" @click="set('fontSize', Math.max(10, data.settings.fontSize - 1))">
              -
            </view>
            <text class="w-28px text-center">{{ data.settings.fontSize }}</text>
            <view class="ws-step" @click="set('fontSize', Math.min(28, data.settings.fontSize + 1))">
              +
            </view>
          </view>
        </view>
        <view class="ws-form__label">
          配色
        </view>
        <view class="flex flex-wrap gap-2">
          <view
            v-for="t in THEME_OPTIONS" :key="t.value" class="ws-theme" :class="{ 'is-on': data.settings.theme === t.value }"
            :style="{ background: THEMES[t.value as Settings['theme']].theme.background, color: THEMES[t.value as Settings['theme']].theme.foreground }"
            @click="set('theme', t.value as Settings['theme'])"
          >
            <text>{{ t.label }}</text>
            <text :style="{ color: THEMES[t.value as Settings['theme']].theme.green }">$ ls</text>
          </view>
        </view>
        <view class="ws-form__label">
          光标
        </view>
        <ot-segmented :model-value="data.settings.cursorStyle" :options="CURSORS" size="small" @update:model-value="set('cursorStyle', $event as Settings['cursorStyle'])" />
        <view class="ws-row">
          <text class="ws-row__k">光标闪烁</text>
          <wd-switch :model-value="data.settings.cursorBlink" size="20px" @change="set('cursorBlink', $event.value)" />
        </view>
        <view class="ws-row">
          <text class="ws-row__k">选中即复制</text>
          <wd-switch :model-value="data.settings.copyOnSelect" size="20px" @change="set('copyOnSelect', $event.value)" />
        </view>
        <view class="ws-row">
          <view class="ws-row__k">
            右键复制 / 粘贴
            <view class="text-11px text-muted">
              开启后右键直接复制（有选中内容时）或粘贴；关闭时右键弹出菜单（与 FinalShell 一致）
            </view>
          </view>
          <wd-switch :model-value="data.settings.rightClickPaste" size="20px" @change="set('rightClickPaste', $event.value)" />
        </view>
        <view class="ws-row">
          <text class="ws-row__k">回滚行数</text>
          <picker :range="[1000, 5000, 10000, 50000]" :value="[1000, 5000, 10000, 50000].indexOf(data.settings.scrollback)" @change="set('scrollback', [1000, 5000, 10000, 50000][Number($event.detail.value)])">
            <view class="ws-pick">
              {{ data.settings.scrollback }} 行 <view class="i-carbon-chevron-down" />
            </view>
          </picker>
        </view>
        <view class="mt-3 text-12px text-muted leading-18px">
          快捷键：Ctrl+Shift+C 复制、Ctrl+Shift+V 粘贴、Ctrl+Shift+F 搜索；按住 Ctrl 点击链接可打开。
        </view>
      </template>

      <template v-else-if="tab === 'connection'">
        <view class="ws-row">
          <view class="ws-row__k">
            保活间隔
            <view class="text-11px text-muted">
              定时发送心跳，防止长时间无操作被断开
            </view>
          </view>
          <picker :range="['关闭', '15 秒', '30 秒', '60 秒']" :value="[0, 15, 30, 60].indexOf(data.settings.keepalive)" @change="set('keepalive', [0, 15, 30, 60][Number($event.detail.value)])">
            <view class="ws-pick">
              {{ data.settings.keepalive ? `${data.settings.keepalive} 秒` : '关闭' }} <view class="i-carbon-chevron-down" />
            </view>
          </picker>
        </view>
        <view class="ws-row">
          <text class="ws-row__k">断线后自动重连</text>
          <wd-switch :model-value="data.settings.autoReconnect" size="20px" @change="set('autoReconnect', $event.value)" />
        </view>
        <view class="ws-row">
          <text class="ws-row__k">监控刷新间隔</text>
          <picker :range="['2 秒', '3 秒', '5 秒', '10 秒']" :value="[2, 3, 5, 10].indexOf(data.settings.monitorInterval)" @change="set('monitorInterval', [2, 3, 5, 10][Number($event.detail.value)])">
            <view class="ws-pick">
              {{ data.settings.monitorInterval }} 秒 <view class="i-carbon-chevron-down" />
            </view>
          </picker>
        </view>
        <view class="ws-row">
          <text class="ws-row__k">关闭已连接的标签前确认</text>
          <wd-switch :model-value="data.settings.confirmClose" size="20px" @change="set('confirmClose', $event.value)" />
        </view>
        <view class="mt-3 text-12px text-muted leading-18px">
          连接经本站服务器中转（只转发加密数据，看不到内容），只能连接有公网地址的服务器；内网服务器请经公网跳板机连接。
        </view>
      </template>

      <template v-else-if="tab === 'security'">
        <view class="ws-row">
          <view class="ws-row__k">
            空闲自动锁定
            <view class="text-11px text-muted">
              没有打开的会话且一段时间无操作时锁定
            </view>
          </view>
          <picker :range="LOCKS.map(m => (m ? `${m} 分钟` : '不锁定'))" :value="LOCKS.indexOf(data.settings.lockMinutes)" @change="set('lockMinutes', LOCKS[Number($event.detail.value)])">
            <view class="ws-pick">
              {{ data.settings.lockMinutes ? `${data.settings.lockMinutes} 分钟` : '不锁定' }} <view class="i-carbon-chevron-down" />
            </view>
          </picker>
        </view>
        <view class="ws-row">
          <view class="ws-row__k">
            在此设备上记住
            <view class="text-11px text-muted">
              打开页面时自动解锁；公共电脑请勿开启
            </view>
          </view>
          <wd-switch :model-value="data.remembered" size="20px" @change="toggleRemember($event.value)" />
        </view>

        <view class="ws-form__label mt-4 font-600">
          修改主密码
        </view>
        <view class="ws-form__field">
          <input v-model="pwd.old" class="min-w-0 flex-1" password placeholder="当前主密码" :maxlength="128">
        </view>
        <view class="ws-form__field mt-2">
          <input v-model="pwd.next" class="min-w-0 flex-1" password placeholder="新主密码（至少 8 位）" :maxlength="128">
        </view>
        <view class="ws-form__field mt-2">
          <input v-model="pwd.confirm" class="min-w-0 flex-1" password placeholder="再次输入新主密码" :maxlength="128">
        </view>
        <wd-button size="small" custom-class="mt-2" :loading="pwd.busy" @click="submitPassword">
          修改主密码
        </wd-button>

        <view class="ws-form__label mt-4 font-600">
          已信任的主机密钥（{{ data.knownHosts.length }}）
        </view>
        <view v-if="!data.knownHosts.length" class="text-12px text-muted">
          首次连接服务器并选择「信任」后会记录在这里，用于发现中间人攻击。
        </view>
        <view v-for="k in data.knownHosts" :key="k.id" class="ws-known">
          <view class="min-w-0 flex-1">
            <view class="ot-mono truncate text-12px text-main">
              {{ k.host }}:{{ k.port }}
            </view>
            <view class="ot-mono truncate text-10px text-muted">
              {{ k.type }} {{ k.fingerprint }}
            </view>
          </view>
          <view class="i-carbon-trash-can shrink-0 cursor-pointer p-1 text-14px text-muted" @click="forgetHostKey(k.id)" />
        </view>

        <view class="ws-form__label mt-5 text-red-500 font-600">
          危险操作
        </view>
        <view class="text-12px text-muted leading-18px">
          主密码无法找回。忘记主密码时只能重置：删除全部 WebShell 数据后重新开始。
        </view>
        <wd-button size="small" type="error" plain custom-class="mt-2" @click="reset">
          重置 WebShell
        </wd-button>
      </template>

      <template v-else>
        <view class="mt-3 text-12px text-muted leading-18px">
          最近 50 次经中转的连接（保留 30 天），可用于发现异常登录。
        </view>
        <view v-if="logLoading" class="py-6 text-center text-12px text-muted">
          加载中…
        </view>
        <view v-else-if="!log.length" class="py-6 text-center text-12px text-muted">
          暂无记录
        </view>
        <view v-for="r in log" :key="r.id" class="ws-known">
          <view class="min-w-0 flex-1">
            <view class="flex items-center gap-2">
              <text class="ot-mono truncate text-12px text-main">{{ r.host }}:{{ r.port }}</text>
              <text v-if="!r.endedAt" class="shrink-0 text-11px text-green-600">进行中</text>
            </view>
            <view class="truncate text-11px text-muted">
              {{ dayjs(r.startedAt * 1000).format('MM-DD HH:mm') }} · {{ duration(r) }} · ↓{{ formatBytes(r.bytesIn) }} ↑{{ formatBytes(r.bytesOut) }} · {{ r.clientIp }}
            </view>
            <view v-if="r.error" class="truncate text-11px text-red-500">
              {{ r.error }}
            </view>
          </view>
        </view>
      </template>
    </view>
  </wd-popup>
</template>

<style lang="scss" scoped>
.ws-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  margin-top: 6px;
  font-size: 14px;
  color: var(--ot-text);
}

.ws-row__k {
  min-width: 0;
  flex: 1;
}

.ws-step {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  line-height: 28px;
  text-align: center;
  background: var(--ot-fill);
  cursor: pointer;
}

.ws-pick {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 13px;
  background: var(--ot-fill);
}

.ws-theme {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 84px;
  padding: 8px 10px;
  border: 2px solid transparent;
  border-radius: 10px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  cursor: pointer;

  &.is-on {
    border-color: var(--wot-color-theme);
  }
}

.ws-known {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--ot-fill);
}
</style>
