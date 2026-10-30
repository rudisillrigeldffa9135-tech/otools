<script lang="ts" setup>
// 服务器监控面板（仅 H5）：CPU / 内存 / 网络 / 磁盘 / 进程，可结束进程
import type { Session } from '../lib/sessions'
import type { Proc } from '../lib/monitor'
import { copyText, toast } from '@/utils/common'
import { formatBytes, formatUptime } from '../lib/monitor'
import { monState, sampleNow } from '../lib/monitor-state'
import { getConn } from '../lib/sessions'
import { data } from '../lib/store'
import WsSpark from './ws-spark.vue'

const props = defineProps<{ session: Session }>()
const emit = defineEmits<{ close: [] }>()

const s = props.session
const st = monState(s.key)
const sortBy = ref<'cpu' | 'mem'>('cpu')

const procs = computed(() => [...(st.sample?.ps ?? [])].sort((a, b) => sortBy.value === 'cpu' ? b.cpu - a.cpu : b.mem - a.mem))
const cpuHist = computed(() => st.history.map(p => p.cpu))
const memHist = computed(() => st.history.map(p => p.mem))
const rxHist = computed(() => st.history.map(p => p.rx))
const txHist = computed(() => st.history.map(p => p.tx))
const ifaces = computed(() => Object.entries(st.stats?.netByIface ?? {}).filter(([n]) => n !== 'lo'))

onMounted(() => {
  if (s.status === 'connected' && !st.unsupported)
    sampleNow(s.key, s.generation)
})

function level(p: number) {
  return p >= 90 ? '#ef4444' : p >= 70 ? '#f59e0b' : '#22c55e'
}

function killProc(p: Proc, signal: 'TERM' | 'KILL') {
  uni.showModal({
    title: signal === 'KILL' ? '强制结束进程' : '结束进程',
    content: `确定${signal === 'KILL' ? '强制' : ''}结束 ${p.command}（PID ${p.pid}）吗？`,
    success: async ({ confirm }) => {
      if (!confirm)
        return
      const conn = getConn(s.key)
      if (!conn)
        return toast('连接已断开')
      try {
        const r = await conn.ssh.exec(conn.id, `kill -${signal} ${p.pid}`, { timeout: 10000 })
        if (r.code === 0) {
          toast('已发送结束信号', 'success')
          setTimeout(() => sampleNow(s.key, s.generation), 800)
        }
        else {
          toast(r.stderr.trim() || '操作失败（可能没有权限）')
        }
      }
      catch (e: any) {
        toast(e?.message || '操作失败')
      }
    },
  })
}

function procMenu(p: Proc) {
  const items: [string, () => void][] = [
    ['结束进程（TERM）', () => killProc(p, 'TERM')],
    ['强制结束（KILL）', () => killProc(p, 'KILL')],
    ['复制 PID', () => copyText(String(p.pid))],
    ['复制命令', () => copyText(p.command)],
  ]
  uni.showActionSheet({ itemList: items.map(i => i[0]), success: ({ tapIndex }) => items[tapIndex]?.[1]() })
}
</script>

<template>
  <view class="ot-mon">
    <view class="ot-mon__head">
      <text class="flex-1 text-13px text-main font-600">监控</text>
      <text class="text-11px text-muted">每 {{ data.settings.monitorInterval }} 秒</text>
      <view class="ot-mon__btn" title="立即刷新" @click="sampleNow(s.key, s.generation)">
        <view class="i-carbon-renew" :class="{ 'animate-spin': st.busy }" />
      </view>
      <view class="ot-mon__btn" title="关闭" @click="emit('close')">
        <view class="i-carbon-close" />
      </view>
    </view>

    <scroll-view scroll-y class="ot-mon__body">
      <view v-if="s.status !== 'connected'" class="ot-mon__empty">
        连接断开，重连后继续监控
      </view>
      <view v-else-if="st.unsupported" class="ot-mon__empty">
        {{ st.error }}
      </view>
      <template v-else>
        <view v-if="st.info" class="ot-mon__info">
          <view class="truncate text-13px text-main font-600">
            {{ st.info.hostname }}
          </view>
          <view class="truncate text-11px text-muted">
            {{ st.info.os || st.info.kernel }}
          </view>
          <view class="truncate text-11px text-muted">
            {{ st.info.cores }} 核 {{ st.info.cpu }}
          </view>
          <view v-if="st.sample" class="mt-1 text-11px text-muted">
            运行 {{ formatUptime(st.sample.uptime) }} · 负载 {{ st.sample.load.join(' / ') }} · 进程 {{ st.sample.procs.total }}
          </view>
          <view v-if="st.info.ips.length" class="ot-mono truncate text-11px text-muted">
            {{ st.info.ips.join('  ') }}
          </view>
        </view>
        <view v-if="st.error" class="mx-3 mt-2 text-12px text-red-500">
          {{ st.error }}
        </view>

        <view v-if="st.stats" class="ot-mon__grid">
          <view class="ot-mon__card">
            <view class="ot-mon__k">
              CPU
            </view>
            <view class="ot-mon__v" :style="{ color: level(st.stats.cpu) }">
              {{ st.stats.cpu.toFixed(1) }}%
            </view>
            <ws-spark :values="cpuHist" :max="100" />
          </view>
          <view class="ot-mon__card">
            <view class="ot-mon__k">
              内存
            </view>
            <view class="ot-mon__v" :style="{ color: level(st.stats.memPct) }">
              {{ st.stats.memPct.toFixed(1) }}%
            </view>
            <view class="text-10px text-muted">
              {{ formatBytes(st.stats.memUsed) }} / {{ formatBytes(st.sample?.mem.total ?? 0) }}
            </view>
            <ws-spark :values="memHist" :max="100" color="#8b5cf6" :height="24" />
          </view>
          <view class="ot-mon__card">
            <view class="ot-mon__k">
              网络
            </view>
            <view class="text-12px">
              <text class="text-green-600">↓ {{ formatBytes(st.stats.rx) }}/s</text>
            </view>
            <view class="text-12px">
              <text class="text-amber-600">↑ {{ formatBytes(st.stats.tx) }}/s</text>
            </view>
            <ws-spark :values="rxHist" :values2="txHist" color="#22c55e" color2="#f59e0b" :height="22" />
          </view>
          <view class="ot-mon__card">
            <view class="ot-mon__k">
              磁盘读写
            </view>
            <view class="text-12px">
              读 {{ formatBytes(st.stats.read) }}/s
            </view>
            <view class="text-12px">
              写 {{ formatBytes(st.stats.write) }}/s
            </view>
            <view v-if="st.sample?.mem.swapTotal" class="mt-1 text-10px text-muted">
              交换 {{ st.stats.swapPct.toFixed(0) }}%（{{ formatBytes(st.stats.swapUsed) }}）
            </view>
          </view>
        </view>

        <view v-if="st.stats && st.stats.cores.length > 1 && st.stats.cores.length <= 64" class="ot-mon__sec">
          <view class="ot-mon__title">
            各核心
          </view>
          <view class="ot-mon__cores">
            <view v-for="(c, i) in st.stats.cores" :key="i" class="ot-mon__core" :title="`CPU${i}：${c.toFixed(0)}%`">
              <view class="ot-mon__core-in" :style="{ height: `${c}%`, background: level(c) }" />
            </view>
          </view>
        </view>

        <view v-if="st.sample?.disks.length" class="ot-mon__sec">
          <view class="ot-mon__title">
            磁盘
          </view>
          <view v-for="d in st.sample.disks" :key="d.mount" class="mb-2">
            <view class="flex items-center gap-2 text-12px">
              <text class="ot-mono min-w-0 flex-1 truncate" :title="d.fs">{{ d.mount }}</text>
              <text class="shrink-0 text-11px text-muted">{{ formatBytes(d.used) }} / {{ formatBytes(d.total) }}</text>
            </view>
            <view class="ot-mon__bar">
              <view class="ot-mon__bar-in" :style="{ width: `${(d.used / Math.max(1, d.used + d.avail)) * 100}%`, background: level((d.used / Math.max(1, d.used + d.avail)) * 100) }" />
            </view>
          </view>
        </view>

        <view v-if="ifaces.length > 1" class="ot-mon__sec">
          <view class="ot-mon__title">
            网卡
          </view>
          <view v-for="[name, v] in ifaces" :key="name" class="flex items-center gap-2 py-1 text-12px">
            <text class="ot-mono min-w-0 flex-1 truncate">{{ name }}</text>
            <text class="text-green-600">↓ {{ formatBytes(v.rx) }}/s</text>
            <text class="text-amber-600">↑ {{ formatBytes(v.tx) }}/s</text>
          </view>
        </view>

        <view v-if="procs.length" class="ot-mon__sec">
          <view class="ot-mon__title flex items-center">
            <text class="flex-1">进程</text>
            <text class="ot-mon__sort" :class="{ 'is-on': sortBy === 'cpu' }" @click="sortBy = 'cpu'">CPU</text>
            <text class="ot-mon__sort" :class="{ 'is-on': sortBy === 'mem' }" @click="sortBy = 'mem'">内存</text>
          </view>
          <view class="ot-mon__proc is-head">
            <text class="w-52px">PID</text>
            <text class="w-64px">用户</text>
            <text class="w-44px text-right">CPU</text>
            <text class="w-52px text-right">内存</text>
            <text class="min-w-0 flex-1 pl-2">命令</text>
          </view>
          <view v-for="p in procs" :key="p.pid" class="ot-mon__proc" @click="procMenu(p)">
            <text class="ot-mono w-52px">{{ p.pid }}</text>
            <text class="w-64px truncate">{{ p.user }}</text>
            <text class="w-44px text-right">{{ p.cpu.toFixed(1) }}</text>
            <text class="w-52px text-right">{{ formatBytes(p.rss, 0) }}</text>
            <text class="min-w-0 flex-1 truncate pl-2" :title="p.command">{{ p.command }}</text>
          </view>
        </view>
        <view v-if="!st.stats && !st.error" class="ot-mon__empty">
          正在读取…
        </view>
      </template>
    </scroll-view>
  </view>
</template>

<style lang="scss" scoped>
.ot-mon {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  font-size: 12px;
  color: var(--ot-text);
}

.ot-mon__head {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  padding: 6px 8px 6px 12px;
  border-bottom: 1px solid var(--ot-border);
}

.ot-mon__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  font-size: 15px;
  color: var(--ot-text-2);
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
  }
}

.ot-mon__body {
  flex: 1;
  min-height: 0;
}

.ot-mon__empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--ot-text-3);
}

.ot-mon__info {
  margin: 10px 12px 0;
}

.ot-mon__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 10px 12px 0;
}

.ot-mon__card {
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--ot-fill);
}

.ot-mon__k {
  font-size: 11px;
  color: var(--ot-text-3);
}

.ot-mon__v {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
}

.ot-mon__sec {
  margin: 14px 12px 0;
}

.ot-mon__title {
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ot-text-2);
}

.ot-mon__cores {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.ot-mon__core {
  position: relative;
  width: 14px;
  height: 28px;
  border-radius: 3px;
  overflow: hidden;
  background: var(--ot-fill);
}

.ot-mon__core-in {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  transition: height 0.3s;
}

.ot-mon__bar {
  height: 5px;
  margin-top: 4px;
  border-radius: 3px;
  overflow: hidden;
  background: var(--ot-fill);
}

.ot-mon__bar-in {
  height: 100%;
}

.ot-mon__sort {
  margin-left: 10px;
  font-weight: 400;
  color: var(--ot-text-3);
  cursor: pointer;

  &.is-on {
    color: var(--wot-color-theme);
  }
}

.ot-mon__proc {
  display: flex;
  align-items: center;
  padding: 4px 0;
  font-size: 11px;
  border-bottom: 1px solid var(--ot-border);
  cursor: pointer;

  &.is-head {
    color: var(--ot-text-3);
    cursor: default;
  }

  &:not(.is-head):hover {
    background: var(--ot-fill);
  }
}
</style>
