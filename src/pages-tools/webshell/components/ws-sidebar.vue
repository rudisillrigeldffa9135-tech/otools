<script lang="ts" setup>
// 左侧监控栏（仿 FinalShell）：IP、运行时间与负载、CPU / 内存 / 交换、进程、网络、延迟、磁盘
import type { Proc } from '../lib/monitor'
import type { Session } from '../lib/sessions'
import { copyText, toast } from '@/utils/common'
import { openMenu } from '../lib/menu'
import { formatBytes, formatUptime } from '../lib/monitor'
import { monState, sampleNow } from '../lib/monitor-state'
import { getConn } from '../lib/sessions'
import WsSpark from './ws-spark.vue'

const props = defineProps<{ session: Session }>()

const st = computed(() => monState(props.session.key))
const s = computed(() => props.session)
const info = computed(() => st.value.info)
const sortBy = ref<'mem' | 'cpu'>('mem')
const iface = ref('')

const SYS_KEY = 'ot-webshell-sysinfo-open'
const sysOpen = ref(localStorage.getItem(SYS_KEY) !== '0')
watch(sysOpen, v => localStorage.setItem(SYS_KEY, v ? '1' : '0'))

/** 系统信息行：值为空的不显示 */
const sysRows = computed(() => {
  const i = info.value
  if (!i)
    return []
  const mem = st.value.sample?.mem.total
  return [
    ['系统', i.os],
    ['内核', i.kernel],
    ['CPU', i.cpu ? `${i.cpu}${i.cores ? ` × ${i.cores}` : ''}` : (i.cores ? `${i.cores} 核` : '')],
    ['内存', mem ? formatBytes(mem) : ''],
    ['主机名', i.hostname],
    ['当前用户', i.user],
    ['内网 IP', i.ips.join('  ')],
  ].filter(([, v]) => v) as [string, string][]
})

const procs = computed(() => [...(st.value.sample?.ps ?? [])]
  .sort((a, b) => sortBy.value === 'mem' ? b.rss - a.rss : b.cpu - a.cpu)
  .slice(0, 5))

const ifaces = computed(() => Object.keys(st.value.sample?.net ?? {}).filter(n => n !== 'lo'))
watch(ifaces, (list) => {
  if (!list.includes(iface.value))
    iface.value = list.find(n => /^(?:eth|ens|enp|eno)/.test(n)) ?? list[0] ?? ''
}, { immediate: true })

/** 选中网卡的速率；历史曲线用全部网卡合计 */
const net = computed(() => st.value.stats?.netByIface[iface.value] ?? { rx: 0, tx: 0 })
const rxHist = computed(() => st.value.history.map(p => p.rx))
const txHist = computed(() => st.value.history.map(p => p.tx))
const latHist = computed(() => st.value.latency.map(p => p.ms ?? 0))
const latNow = computed(() => st.value.latency[st.value.latency.length - 1]?.ms)
const latStats = computed(() => {
  const v = st.value.latency.map(p => p.ms).filter((x): x is number => x !== null)
  return v.length ? { min: Math.min(...v), max: Math.max(...v), avg: v.reduce((a, b) => a + b, 0) / v.length } : null
})

function short(n: number) {
  return formatBytes(n, 1).replace(' ', '').replace(/B$/, '').replace(/^(\d+(?:\.\d+)?)$/, '$1B')
}

function barColor(p: number) {
  return p >= 90 ? '#ef4444' : p >= 70 ? '#f59e0b' : '#3b82f6'
}

function killProc(p: Proc, signal: 'TERM' | 'KILL') {
  uni.showModal({
    title: signal === 'KILL' ? '强制结束进程' : '结束进程',
    content: `确定${signal === 'KILL' ? '强制' : ''}结束 ${p.command}（PID ${p.pid}）吗？`,
    success: async ({ confirm }) => {
      const conn = getConn(s.value.key)
      if (!confirm || !conn)
        return
      try {
        const r = await conn.ssh.exec(conn.id, `kill -${signal} ${p.pid}`, { timeout: 10000 })
        toast(r.code === 0 ? '已发送结束信号' : (r.stderr.trim() || '操作失败（可能没有权限）'))
        setTimeout(() => sampleNow(s.value.key, s.value.generation), 800)
      }
      catch (e: any) {
        toast(e?.message || '操作失败')
      }
    },
  })
}

function procMenu(e: MouseEvent, p: Proc) {
  openMenu(e, [
    { label: `结束进程 ${p.pid}`, icon: 'i-carbon-stop', action: () => killProc(p, 'TERM') },
    { label: '强制结束（kill -9）', icon: 'i-carbon-close-outline', danger: true, action: () => killProc(p, 'KILL') },
    { label: '复制 PID', icon: 'i-carbon-copy', divider: true, action: () => copyText(String(p.pid)) },
    { label: '复制命令', icon: 'i-carbon-copy', action: () => copyText(p.command) },
  ])
}
</script>

<template>
  <div class="ws-sb">
    <!-- 地址 -->
    <div class="ws-sb__row ws-sb__ip">
      <span class="ws-sb__dot" :class="`is-${s.status}`" :title="s.status === 'connected' ? '已连接' : '未连接'" />
      <span class="ot-mono min-w-0 flex-1 truncate" :title="s.host.host">{{ s.host.host }}</span>
      <span class="ws-sb__link" @click="copyText(s.host.host)">复制</span>
    </div>

    <!-- 系统信息 -->
    <div v-if="s.status === 'connected' && sysRows.length" class="ws-sb__sys">
      <div class="ws-sb__sys-h" @click="sysOpen = !sysOpen">
        <span :class="sysOpen ? 'i-carbon-caret-down' : 'i-carbon-caret-right'" />
        <span class="flex-1">系统信息</span>
      </div>
      <div v-show="sysOpen" class="ws-sb__sys-b">
        <div v-for="[k, v] in sysRows" :key="k" class="ws-sb__sys-r" :title="v">
          <span class="ws-sb__sys-k">{{ k }}</span>
          <span class="ws-sb__sys-v" :class="{ 'ot-mono': k === '内网 IP' }">{{ v }}</span>
        </div>
      </div>
    </div>

    <template v-if="s.status !== 'connected'">
      <div class="ws-sb__empty">
        未连接
      </div>
    </template>
    <template v-else-if="st.unsupported">
      <div class="ws-sb__empty">
        {{ st.error }}
      </div>
    </template>
    <template v-else>
      <div class="ws-sb__row">
        运行 {{ st.sample ? formatUptime(st.sample.uptime) : '-' }}
      </div>
      <div class="ws-sb__row">
        负载 {{ st.sample ? st.sample.load.map(v => v.toFixed(2)).join(', ') : '-' }}
      </div>

      <!-- CPU / 内存 / 交换 -->
      <div class="ws-sb__meter">
        <span class="ws-sb__k">CPU</span>
        <div class="ws-sb__bar">
          <div class="ws-sb__fill" :style="{ width: `${st.stats?.cpu ?? 0}%`, background: barColor(st.stats?.cpu ?? 0) }" />
          <span class="ws-sb__val">{{ (st.stats?.cpu ?? 0).toFixed(0) }}%</span>
        </div>
      </div>
      <div class="ws-sb__meter">
        <span class="ws-sb__k">内存</span>
        <div class="ws-sb__bar">
          <div class="ws-sb__fill" :style="{ width: `${st.stats?.memPct ?? 0}%`, background: barColor(st.stats?.memPct ?? 0) }" />
          <span class="ws-sb__val">{{ (st.stats?.memPct ?? 0).toFixed(0) }}%  {{ short(st.stats?.memUsed ?? 0) }}/{{ short(st.sample?.mem.total ?? 0) }}</span>
        </div>
      </div>
      <div class="ws-sb__meter">
        <span class="ws-sb__k">交换</span>
        <div class="ws-sb__bar">
          <div class="ws-sb__fill" :style="{ width: `${st.stats?.swapPct ?? 0}%`, background: barColor(st.stats?.swapPct ?? 0) }" />
          <span class="ws-sb__val">{{ (st.stats?.swapPct ?? 0).toFixed(0) }}%  {{ short(st.stats?.swapUsed ?? 0) }}/{{ short(st.sample?.mem.swapTotal ?? 0) }}</span>
        </div>
      </div>

      <!-- 进程 -->
      <div class="ws-sb__table">
        <div class="ws-sb__tr is-head">
          <span class="ws-sb__c1" :class="{ 'is-on': sortBy === 'mem' }" @click="sortBy = 'mem'">内存</span>
          <span class="ws-sb__c2" :class="{ 'is-on': sortBy === 'cpu' }" @click="sortBy = 'cpu'">CPU</span>
          <span class="ws-sb__c3">命令</span>
        </div>
        <div v-for="p in procs" :key="p.pid" class="ws-sb__tr" :title="`PID ${p.pid} · ${p.user} · ${p.command}（右键可结束进程）`" @contextmenu="procMenu($event, p)">
          <span class="ws-sb__c1">{{ short(p.rss) }}</span>
          <span class="ws-sb__c2">{{ p.cpu.toFixed(1) }}</span>
          <span class="ws-sb__c3 truncate">{{ p.command }}</span>
        </div>
      </div>

      <!-- 网络 -->
      <div class="ws-sb__sec">
        <div class="ws-sb__row">
          <span class="text-[#f59e0b]">↑{{ short(net.tx) }}</span>
          <span class="ml-2 text-[#22c55e]">↓{{ short(net.rx) }}</span>
          <span class="flex-1" />
          <select v-if="ifaces.length" v-model="iface" class="ws-sb__select">
            <option v-for="n in ifaces" :key="n" :value="n">
              {{ n }}
            </option>
          </select>
        </div>
        <div class="ws-sb__chart">
          <ws-spark :values="rxHist" :values2="txHist" color="#22c55e" color2="#f59e0b" :height="56" />
        </div>
      </div>

      <!-- 延迟 -->
      <div class="ws-sb__sec">
        <div class="ws-sb__row">
          <span>延迟 {{ latNow === undefined ? '-' : latNow === null ? '超时' : `${latNow.toFixed(0)}ms` }}</span>
          <span class="flex-1" />
          <span v-if="latStats" class="text-10px opacity-70">{{ latStats.min.toFixed(0) }}/{{ latStats.avg.toFixed(0) }}/{{ latStats.max.toFixed(0) }}</span>
        </div>
        <div class="ws-sb__chart">
          <ws-spark :values="latHist" color="#8b5cf6" :height="40" />
        </div>
        <div class="ws-sb__note">
          本机 → 中转 → 服务器
        </div>
      </div>

      <!-- 磁盘 -->
      <div class="ws-sb__table">
        <div class="ws-sb__tr is-head">
          <span class="flex-1">路径</span>
          <span>可用/大小</span>
        </div>
        <div v-for="d in st.sample?.disks ?? []" :key="d.mount" class="ws-sb__tr" :title="`${d.fs} 已用 ${formatBytes(d.used)}`">
          <span class="min-w-0 flex-1 truncate">{{ d.mount }}</span>
          <span>{{ short(d.avail) }}/{{ short(d.total) }}</span>
        </div>
      </div>
      <div v-if="st.error" class="ws-sb__note text-red-500">
        {{ st.error }}
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.ws-sb {
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: 100%;
  padding: 6px 8px 10px;
  overflow-y: auto;
  box-sizing: border-box;
  font-size: 12px;
  color: var(--ot-text-2);
  background: var(--ot-fill);
  scrollbar-width: thin;
}

.ws-sb__row {
  display: flex;
  align-items: center;
  min-height: 20px;
  white-space: nowrap;
}

.ws-sb__ip {
  gap: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--ot-border);
  color: var(--ot-text);
}

.ws-sb__dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #a1a1aa;

  &.is-connected {
    background: #22c55e;
  }

  &.is-connecting {
    background: #f59e0b;
  }

  &.is-closed,
  &.is-error {
    background: #ef4444;
  }
}

.ws-sb__link {
  flex-shrink: 0;
  color: var(--wot-color-theme);
  cursor: pointer;
}

.ws-sb__empty {
  padding: 20px 0;
  text-align: center;
  color: var(--ot-text-3);
}

.ws-sb__sys {
  border: 1px solid var(--ot-border);
  border-radius: 2px;
  background: var(--ot-card);
}

.ws-sb__sys-h {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 6px;
  font-weight: 600;
  color: var(--ot-text);
  cursor: pointer;
  user-select: none;
}

.ws-sb__sys-b {
  padding: 2px 6px 4px;
}

.ws-sb__sys-r {
  display: flex;
  gap: 6px;
  font-size: 11px;
  line-height: 18px;
}

.ws-sb__sys-k {
  flex-shrink: 0;
  width: 48px;
  color: var(--ot-text-3);
}

.ws-sb__sys-v {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ot-text-2);
}

.ws-sb__meter {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ws-sb__k {
  flex-shrink: 0;
  width: 28px;
}

.ws-sb__bar {
  position: relative;
  flex: 1;
  height: 16px;
  overflow: hidden;
  border: 1px solid var(--ot-border);
  border-radius: 2px;
  background: var(--ot-card);
}

.ws-sb__fill {
  height: 100%;
  opacity: 0.55;
  transition: width 0.4s;
}

.ws-sb__val {
  position: absolute;
  inset: 0;
  padding-left: 4px;
  font-size: 11px;
  line-height: 14px;
  color: var(--ot-text);
  white-space: nowrap;
}

.ws-sb__table {
  margin-top: 4px;
  border: 1px solid var(--ot-border);
  border-radius: 2px;
  background: var(--ot-card);
}

.ws-sb__tr {
  display: flex;
  gap: 4px;
  padding: 1px 4px;
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;

  &.is-head {
    border-bottom: 1px solid var(--ot-border);
    color: var(--ot-text-3);
    background: var(--ot-fill);

    span {
      cursor: pointer;
    }

    .is-on {
      color: var(--wot-color-theme);
    }
  }

  &:not(.is-head):hover {
    background: var(--ot-fill);
  }
}

.ws-sb__c1 {
  flex-shrink: 0;
  width: 44px;
}

.ws-sb__c2 {
  flex-shrink: 0;
  width: 32px;
}

.ws-sb__c3 {
  flex: 1;
  min-width: 0;
}

.ws-sb__sec {
  margin-top: 4px;
}

.ws-sb__chart {
  border: 1px solid var(--ot-border);
  border-radius: 2px;
  background: var(--ot-card);
}

.ws-sb__select {
  max-width: 90px;
  padding: 0 2px;
  border: 1px solid var(--ot-border);
  border-radius: 2px;
  font-size: 11px;
  color: var(--ot-text);
  background: var(--ot-card);
}

.ws-sb__note {
  font-size: 10px;
  color: var(--ot-text-3);
}
</style>
