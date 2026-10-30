<script lang="ts" setup>
// 概览：统计、当前会话（实时负载）、最近连接、按分组的服务器（在线状态），以及新建 / 导入 / 密钥 / 快捷命令 / 设置入口
import type { Host } from '../lib/types'
import dayjs from 'dayjs'
import { probeWebshellHosts } from '@/api/webshell'
import { copyText, toast } from '@/utils/common'
import { formatBytes, formatUptime } from '../lib/monitor'
import { monState } from '../lib/monitor-state'
import { activeKey, openSession, sessions } from '../lib/sessions'
import { data, remove, save } from '../lib/store'
import { hostLabel } from '../lib/types'

const props = defineProps<{ wide: boolean, active: boolean }>()
const emit = defineEmits<{
  editHost: [host: Host | null]
  importConfig: []
  keys: []
  snippets: []
  settings: []
  lock: []
}>()

const keyword = ref('')
const collapsed = ref(new Set<string>())
const probes = reactive(new Map<string, { ok: boolean, ms?: number, error?: string }>())
const probing = ref(false)
let probeTimer: ReturnType<typeof setInterval> | undefined

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  if (!k)
    return data.hosts
  return data.hosts.filter(h => [h.name, h.host, h.username, h.note].some(v => v?.toLowerCase().includes(k)))
})

const groups = computed(() => {
  const list = [...data.groups.map(g => ({ id: g.id, name: g.name })), { id: '', name: '未分组' }]
  return list
    .map(g => ({ ...g, hosts: filtered.value.filter(h => (data.groups.some(x => x.id === h.groupId) ? h.groupId : '') === g.id) }))
    .filter(g => g.hosts.length || (g.id && !keyword.value))
})

const recent = computed(() => data.hosts.filter(h => h.lastConnectedAt).sort((a, b) => b.lastConnectedAt - a.lastConnectedAt).slice(0, 6))
const onlineCount = computed(() => data.hosts.filter(h => probes.get(h.id)?.ok).length)
const probed = computed(() => data.hosts.filter(h => probes.has(h.id)).length)

/** 只检测直连的服务器（经跳板机的无法从外部检测） */
async function probe() {
  const targets = data.hosts.filter(h => !h.jumpHostId).slice(0, 30)
  if (!targets.length || probing.value)
    return
  probing.value = true
  try {
    const res = await probeWebshellHosts(targets.map(h => ({ host: h.host, port: h.port || 22 })))
    targets.forEach((h, i) => res[i] && probes.set(h.id, res[i]))
  }
  catch {}
  finally {
    probing.value = false
  }
}

watch(() => props.active, (v) => {
  clearInterval(probeTimer)
  if (!v)
    return
  probe()
  probeTimer = setInterval(() => document.visibilityState === 'visible' && probe(), 60_000)
}, { immediate: true })
watch(() => data.hosts.length, (n, o) => {
  if (props.active && n > (o ?? 0))
    probe()
})
onBeforeUnmount(() => clearInterval(probeTimer))

function status(h: Host) {
  if (h.jumpHostId)
    return { cls: 'is-jump', text: '经跳板机' }
  const p = probes.get(h.id)
  if (!p)
    return { cls: '', text: '未检测' }
  return p.ok ? { cls: 'is-ok', text: `${p.ms} ms` } : { cls: 'is-down', text: '无法连接', title: p.error }
}

function sessionsOf(h: Host) {
  return sessions.filter(s => s.hostId === h.id)
}

function connect(h: Host) {
  const existing = sessionsOf(h).find(s => s.status === 'connected' || s.status === 'connecting')
  if (existing) {
    activeKey.value = existing.key
    return
  }
  openSession(h)
}

function sshCommand(h: Host) {
  return `ssh ${h.port && h.port !== 22 ? `-p ${h.port} ` : ''}${h.username ? `${h.username}@` : ''}${h.host}`
}

function hostMenu(h: Host) {
  const items: [string, () => void][] = [
    ['连接', () => openSession(h)],
    ['编辑', () => emit('editHost', h)],
    ['复制为新服务器', () => emit('editHost', { ...h, id: '', name: `${h.name} 副本`, lastConnectedAt: 0, connectCount: 0, createdAt: 0 })],
    [h.pinned ? '取消置顶' : '置顶', () => save('host', { ...h, pinned: !h.pinned }).catch(e => toast(e?.message))],
    ['复制 ssh 命令', () => copyText(sshCommand(h))],
    ['删除', () => uni.showModal({
      title: '删除服务器',
      content: `确定删除「${h.name}」吗？`,
      success: ({ confirm }) => confirm && remove(h.id),
    })],
  ]
  uni.showActionSheet({ itemList: items.map(i => i[0]), success: ({ tapIndex }) => items[tapIndex]?.[1]() })
}

function groupMenu(g: { id: string, name: string, hosts: Host[] }) {
  if (!g.id)
    return
  const group = data.groups.find(x => x.id === g.id)
  if (!group)
    return
  uni.showActionSheet({
    itemList: ['重命名分组', '删除分组（服务器移到未分组）'],
    success: ({ tapIndex }) => {
      if (tapIndex === 0) {
        uni.showModal({
          title: '重命名分组',
          editable: true,
          content: group.name,
          success: ({ confirm, content }) => {
            const name = (content ?? '').trim()
            if (confirm && name)
              save('group', { ...group, name }).catch(e => toast(e?.message))
          },
        })
      }
      else {
        uni.showModal({
          title: '删除分组',
          content: `删除「${group.name}」后，其中 ${g.hosts.length} 台服务器会移到「未分组」。`,
          success: async ({ confirm }) => {
            if (!confirm)
              return
            for (const h of data.hosts.filter(x => x.groupId === group.id))
              await save('host', { ...h, groupId: '' }).catch(() => {})
            await remove(group.id)
          },
        })
      }
    },
  })
}

function newGroup() {
  uni.showModal({
    title: '新建分组',
    editable: true,
    placeholderText: '分组名称，如：生产环境',
    success: ({ confirm, content }) => {
      const name = (content ?? '').trim()
      if (confirm && name)
        save('group', { id: '', name, sort: Date.now() }).catch(e => toast(e?.message))
    },
  })
}

function toggleGroup(id: string) {
  const s = new Set(collapsed.value)
  if (s.has(id))
    s.delete(id)
  else
    s.add(id)
  collapsed.value = s
}

function since(t: number) {
  if (!t)
    return '从未连接'
  const d = Date.now() / 1000 - t
  if (d < 60)
    return '刚刚'
  if (d < 3600)
    return `${Math.floor(d / 60)} 分钟前`
  if (d < 86400)
    return `${Math.floor(d / 3600)} 小时前`
  if (d < 86400 * 30)
    return `${Math.floor(d / 86400)} 天前`
  return dayjs(t * 1000).format('YYYY-MM-DD')
}

function level(p: number) {
  return p >= 90 ? '#ef4444' : p >= 70 ? '#f59e0b' : '#22c55e'
}
</script>

<template>
  <scroll-view scroll-y class="ws-ov">
    <view class="ws-ov__inner">
      <!-- 统计 -->
      <view class="ws-ov__stats">
        <view class="ws-ov__stat">
          <view class="ws-ov__stat-v">
            {{ data.hosts.length }}
          </view>
          <view class="ws-ov__stat-k">
            服务器 · {{ data.groups.length }} 个分组
          </view>
        </view>
        <view class="ws-ov__stat">
          <view class="ws-ov__stat-v text-green-600">
            {{ probed ? onlineCount : '-' }}
          </view>
          <view class="ws-ov__stat-k">
            在线{{ probed ? ` / 已检测 ${probed}` : '' }}
          </view>
        </view>
        <view class="ws-ov__stat" @click="sessions.length && (activeKey = sessions[0].key)">
          <view class="ws-ov__stat-v text-[var(--wot-color-theme)]">
            {{ sessions.filter(s => s.status === 'connected').length }}
          </view>
          <view class="ws-ov__stat-k">
            当前会话
          </view>
        </view>
        <view class="ws-ov__stat" @click="emit('snippets')">
          <view class="ws-ov__stat-v">
            {{ data.snippets.length }}
          </view>
          <view class="ws-ov__stat-k">
            快捷命令 · {{ data.keys.length }} 个密钥
          </view>
        </view>
      </view>

      <!-- 工具栏 -->
      <view class="ws-ov__toolbar">
        <view class="ws-ov__search">
          <view class="i-carbon-search text-14px text-muted" />
          <input v-model="keyword" class="min-w-0 flex-1 text-13px" placeholder="搜索名称、地址、备注">
        </view>
        <wd-button size="small" icon="add" @click="emit('editHost', null)">
          新建服务器
        </wd-button>
        <view class="ws-ov__tool" title="新建分组" @click="newGroup">
          <view class="i-carbon-folder-add" /><text v-if="wide">分组</text>
        </view>
        <view class="ws-ov__tool" title="导入 SSH 配置" @click="emit('importConfig')">
          <view class="i-carbon-document-import" /><text v-if="wide">导入</text>
        </view>
        <view class="ws-ov__tool" title="密钥管理" @click="emit('keys')">
          <view class="i-carbon-password" /><text v-if="wide">密钥</text>
        </view>
        <view class="ws-ov__tool" title="快捷命令" @click="emit('snippets')">
          <view class="i-carbon-flash" /><text v-if="wide">命令</text>
        </view>
        <view class="ws-ov__tool" title="刷新在线状态" @click="probe">
          <view class="i-carbon-renew" :class="{ 'animate-spin': probing }" />
        </view>
        <view class="ws-ov__tool" title="设置" @click="emit('settings')">
          <view class="i-carbon-settings" />
        </view>
        <view class="ws-ov__tool" title="锁定" @click="emit('lock')">
          <view class="i-carbon-locked" />
        </view>
      </view>

      <view v-if="data.broken" class="ws-ov__warn">
        有 {{ data.broken }} 条数据无法解密（可能已损坏），已跳过。
      </view>

      <!-- 当前会话 -->
      <template v-if="sessions.length">
        <view class="ws-ov__title">
          当前会话
        </view>
        <view class="ws-ov__grid">
          <view v-for="s in sessions" :key="s.key" class="ws-ov__sess" @click="activeKey = s.key">
            <view class="flex items-center gap-2">
              <view class="ws-ov__dot" :class="s.status === 'connected' ? 'is-ok' : s.status === 'connecting' ? 'is-wait' : 'is-down'" />
              <text class="min-w-0 flex-1 truncate text-14px text-main font-600">{{ s.title }}</text>
              <text class="shrink-0 text-11px text-muted">{{ s.status === 'connected' ? '已连接' : s.status === 'connecting' ? '连接中' : '已断开' }}</text>
            </view>
            <template v-if="s.status === 'connected' && monState(s.key).stats">
              <view class="ws-ov__meters">
                <view class="ws-ov__meter">
                  <text>CPU</text>
                  <view class="ws-ov__meter-bar">
                    <view :style="{ width: `${monState(s.key).stats!.cpu}%`, background: level(monState(s.key).stats!.cpu) }" />
                  </view>
                  <text class="w-38px text-right">{{ monState(s.key).stats!.cpu.toFixed(0) }}%</text>
                </view>
                <view class="ws-ov__meter">
                  <text>内存</text>
                  <view class="ws-ov__meter-bar">
                    <view :style="{ width: `${monState(s.key).stats!.memPct}%`, background: level(monState(s.key).stats!.memPct) }" />
                  </view>
                  <text class="w-38px text-right">{{ monState(s.key).stats!.memPct.toFixed(0) }}%</text>
                </view>
              </view>
              <view class="mt-1 truncate text-11px text-muted">
                ↓ {{ formatBytes(monState(s.key).stats!.rx) }}/s · ↑ {{ formatBytes(monState(s.key).stats!.tx) }}/s · 运行 {{ formatUptime(monState(s.key).sample?.uptime ?? 0) }}
              </view>
            </template>
            <view v-else class="ot-mono mt-2 truncate text-11px text-muted">
              {{ s.status === 'connected' ? (monState(s.key).unsupported ? '非 Linux，无负载信息' : '正在读取负载…') : (s.error || s.statusText || hostLabel(s.host)) }}
            </view>
          </view>
        </view>
      </template>

      <!-- 最近连接 -->
      <template v-if="recent.length && !keyword">
        <view class="ws-ov__title">
          最近连接
        </view>
        <view class="flex flex-wrap gap-2">
          <view v-for="h in recent" :key="h.id" class="ws-ov__chip" @click="openSession(h)">
            <view class="ws-ov__dot" :class="status(h).cls" />
            <text class="max-w-160px truncate">{{ h.name }}</text>
            <text class="text-11px text-muted">{{ since(h.lastConnectedAt) }}</text>
          </view>
        </view>
      </template>

      <!-- 服务器 -->
      <view v-if="!data.hosts.length" class="ws-ov__empty">
        <view class="i-carbon-terminal text-44px text-muted" />
        <view class="mt-3 text-15px text-main">
          添加第一台服务器
        </view>
        <view class="mt-1 max-w-420px text-center text-12px text-muted leading-18px">
          在浏览器里直接使用 SSH 终端、SFTP 文件管理和服务器监控。数据端到端加密，多设备同步。
        </view>
        <view class="mt-4 flex gap-2">
          <wd-button @click="emit('editHost', null)">
            新建服务器
          </wd-button>
          <wd-button type="info" plain @click="emit('importConfig')">
            导入 SSH 配置
          </wd-button>
        </view>
      </view>
      <view v-else-if="!filtered.length" class="ws-ov__empty">
        没有匹配的服务器
      </view>
      <template v-for="g in groups" :key="g.id || 'none'">
        <view class="ws-ov__title flex items-center gap-1">
          <view class="cursor-pointer" :class="collapsed.has(g.id) ? 'i-carbon-chevron-right' : 'i-carbon-chevron-down'" @click="toggleGroup(g.id)" />
          <text class="cursor-pointer" @click="toggleGroup(g.id)">{{ g.name }}</text>
          <text class="text-muted font-400">（{{ g.hosts.length }}）</text>
          <view v-if="g.id" class="i-carbon-overflow-menu-horizontal ml-1 cursor-pointer text-muted" @click="groupMenu(g)" />
        </view>
        <view v-if="!collapsed.has(g.id)" class="ws-ov__grid">
          <view v-if="!g.hosts.length" class="text-12px text-muted">
            空分组，编辑服务器时可以选择这个分组
          </view>
          <view v-for="h in g.hosts" :key="h.id" class="ws-ov__host" @click="connect(h)">
            <view class="ws-ov__stripe" :style="{ background: h.color || 'transparent' }" />
            <view class="flex items-center gap-2">
              <view v-if="h.pinned" class="i-carbon-pin-filled shrink-0 text-12px text-amber-500" />
              <text class="min-w-0 flex-1 truncate text-14px text-main font-600">{{ h.name }}</text>
              <view v-if="sessionsOf(h).length" class="ws-ov__badge">
                {{ sessionsOf(h).length }} 个会话
              </view>
              <view class="i-carbon-edit ws-ov__icon" title="编辑" @click.stop="emit('editHost', h)" />
              <view class="i-carbon-overflow-menu-vertical ws-ov__icon" @click.stop="hostMenu(h)" />
            </view>
            <view class="ot-mono mt-1 truncate text-12px text-muted">
              {{ hostLabel(h) }}
            </view>
            <view class="mt-2 flex items-center gap-2 text-11px text-muted">
              <view class="ws-ov__dot" :class="status(h).cls" />
              <text :title="status(h).title">{{ status(h).text }}</text>
              <text>·</text>
              <text class="min-w-0 flex-1 truncate">{{ since(h.lastConnectedAt) }}</text>
              <view v-if="h.auth === 'key'" class="i-carbon-password" title="私钥认证" />
              <view v-if="h.jumpHostId" class="i-carbon-direction-fork" title="经跳板机" />
            </view>
            <view v-if="h.note" class="mt-1 truncate text-11px text-muted">
              {{ h.note }}
            </view>
          </view>
        </view>
      </template>

      <view class="mt-6 text-center text-11px text-muted leading-18px">
        所有数据在浏览器中用主密码加密后同步，服务端只转发加密的 SSH 流量。在线状态由本站服务器检测（只建立 TCP 连接）。
      </view>
    </view>
  </scroll-view>
</template>

<style lang="scss" scoped>
.ws-ov {
  height: 100%;
}

.ws-ov__inner {
  padding: 14px 14px 24px;
}

.ws-ov__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  @media (min-width: 768px) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.ws-ov__stat {
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--ot-fill);
}

.ws-ov__stat-v {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--ot-text);
}

.ws-ov__stat-k {
  margin-top: 2px;
  font-size: 12px;
  color: var(--ot-text-3);
}

.ws-ov__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
}

.ws-ov__search {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 6px;
  min-width: 180px;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  background: var(--ot-fill);
}

.ws-ov__tool {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--ot-text-2);
  background: var(--ot-fill);
  cursor: pointer;

  &:hover {
    color: var(--wot-color-theme);
  }
}

.ws-ov__warn {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  color: #b45309;
  background: rgba(245, 158, 11, 0.12);
}

.ws-ov__title {
  margin: 18px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ot-text-2);
}

.ws-ov__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;

  @media (min-width: 640px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (min-width: 1100px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.ws-ov__host,
.ws-ov__sess {
  position: relative;
  padding: 12px 14px;
  overflow: hidden;
  border: 1px solid var(--ot-border);
  border-radius: 12px;
  background: var(--ot-card);
  cursor: pointer;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;

  &:hover {
    border-color: color-mix(in srgb, var(--wot-color-theme) 50%, transparent);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
  }
}

.ws-ov__stripe {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 3px;
}

.ws-ov__icon {
  flex-shrink: 0;
  padding: 2px;
  font-size: 15px;
  color: var(--ot-text-3);

  &:hover {
    color: var(--wot-color-theme);
  }
}

.ws-ov__badge {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  color: var(--wot-color-theme);
  background: color-mix(in srgb, var(--wot-color-theme) 12%, transparent);
}

.ws-ov__dot {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #a1a1aa;

  &.is-ok {
    background: #22c55e;
  }

  &.is-wait {
    background: #f59e0b;
  }

  &.is-down {
    background: #ef4444;
  }

  &.is-jump {
    background: #60a5fa;
  }
}

.ws-ov__chip {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 13px;
  color: var(--ot-text);
  background: var(--ot-fill);
  cursor: pointer;
}

.ws-ov__meters {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.ws-ov__meter {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--ot-text-3);

  > text:first-child {
    width: 26px;
  }
}

.ws-ov__meter-bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  background: var(--ot-fill);

  > view {
    height: 100%;
    transition: width 0.4s;
  }
}

.ws-ov__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 16px;
  font-size: 13px;
  color: var(--ot-text-3);
}
</style>
