<script lang="ts" setup>
import type { DnsResolver, IDnsLookup } from '@/api/dns'
import { dnsLookup } from '@/api/dns'
import { copyText, toast } from '@/utils/common'
import { userKey } from '@/utils/user-storage'

definePage({
  style: { navigationBarTitleText: 'DNS 查询' },
})

const HISTORY_KEY = 'ot-dns-history'
const COMMON = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS']
const MORE = ['SOA', 'CAA', 'SRV', 'HTTPS', 'DS', 'DNSKEY', 'PTR']
const RESOLVERS: { value: DnsResolver, label: string }[] = [
  { value: 'cloudflare', label: 'Cloudflare' },
  { value: 'google', label: 'Google' },
  { value: 'alidns', label: '阿里 DNS' },
]

const STATUS_TEXT: Record<string, string> = {
  NOERROR: '正常',
  NXDOMAIN: '域名不存在',
  SERVFAIL: '解析失败',
  REFUSED: '被拒绝',
  FORMERR: '请求格式错误',
  NOTIMP: '不支持',
  ERROR: '查询出错',
}

const TYPE_DESC: Record<string, string> = {
  A: 'IPv4 地址',
  AAAA: 'IPv6 地址',
  CNAME: '别名',
  MX: '邮件服务器（优先级 主机）',
  TXT: '文本（SPF、域名验证等）',
  NS: '权威域名服务器',
  SOA: '起始授权',
  CAA: '允许签发证书的 CA',
  SRV: '服务记录（优先级 权重 端口 主机）',
  HTTPS: 'HTTPS 服务绑定',
  DS: 'DNSSEC 委派签名',
  DNSKEY: 'DNSSEC 公钥',
  PTR: '反向解析（IP → 域名）',
}

const name = ref('')
const types = ref<string[]>(['A', 'AAAA', 'CNAME'])
const resolver = ref<DnsResolver>('cloudflare')
const loading = ref(false)
const data = ref<IDnsLookup>()
const history = ref<string[]>([])

onLoad((query) => {
  try {
    history.value = uni.getStorageSync(userKey(HISTORY_KEY)) || []
  }
  catch {}
  if (query?.name) {
    name.value = decodeURIComponent(query.name)
    runQuery()
  }
})

const isIp = computed(() => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(name.value.trim()) || (/^[\da-f:[\]]+$/i.test(name.value.trim()) && name.value.includes(':')))

function toggleType(t: string) {
  const i = types.value.indexOf(t)
  if (i >= 0) {
    if (types.value.length > 1)
      types.value.splice(i, 1)
  }
  else {
    if (types.value.length >= 10)
      return toast('一次最多查询 10 种记录')
    types.value.push(t)
  }
}

function saveHistory(n: string) {
  history.value = [n, ...history.value.filter(h => h !== n)].slice(0, 8)
  try {
    uni.setStorageSync(userKey(HISTORY_KEY), history.value)
  }
  catch {}
}

function clearHistory() {
  history.value = []
  try {
    uni.removeStorageSync(userKey(HISTORY_KEY))
  }
  catch {}
}

async function runQuery() {
  const n = name.value.trim()
  if (!n)
    return toast('请输入域名')
  loading.value = true
  try {
    // 输入 IP 时只查反向解析
    data.value = await dnsLookup(n, isIp.value ? ['PTR'] : types.value, resolver.value)
    saveHistory(n)
  }
  catch {
    data.value = undefined
  }
  finally {
    loading.value = false
  }
}

function pick(h: string) {
  name.value = h
  runQuery()
}

/** 有结果的排前面 */
const results = computed(() => {
  const list = data.value?.results ?? []
  return [...list].sort((a, b) => Number(!a.answers.length) - Number(!b.answers.length))
})
</script>

<template>
  <ot-tool-layout>
    <ot-panel>
      <view class="flex gap-2">
        <view class="ot-dns__input">
          <view class="i-carbon-search shrink-0 text-16px text-muted" />
          <input v-model="name" class="ot-mono min-w-0 flex-1 text-15px" placeholder="域名或网址，如 example.com" confirm-type="search" @confirm="runQuery">
          <view v-if="name" class="i-carbon-close-filled cursor-pointer text-16px text-muted" @click="name = ''" />
        </view>
        <wd-button :loading="loading" @click="runQuery">
          查询
        </wd-button>
      </view>

      <view v-if="history.length" class="mt-2 flex flex-wrap items-center gap-1.5">
        <text class="text-12px text-muted">最近：</text>
        <view v-for="h in history" :key="h" class="ot-dns__hist ot-mono" @click="pick(h)">
          {{ h }}
        </view>
        <view class="i-carbon-trash-can cursor-pointer text-13px text-muted" @click="clearHistory" />
      </view>

      <view class="mt-4 flex items-center gap-2">
        <text class="w-14 shrink-0 text-13px text-sub">解析服务</text>
        <ot-segmented v-model="resolver" :options="RESOLVERS" size="small" />
      </view>
      <view class="mt-3 flex items-start gap-2">
        <text class="w-14 shrink-0 pt-1 text-13px text-sub">记录类型</text>
        <view v-if="isIp" class="pt-1 text-13px text-muted">
          已输入 IP，将查询 PTR 反向解析
        </view>
        <view v-else class="flex flex-wrap gap-1.5">
          <view v-for="t in [...COMMON, ...MORE]" :key="t" class="ot-dns__type ot-mono" :class="{ 'is-active': types.includes(t) }" @click="toggleType(t)">
            {{ t }}
          </view>
          <view class="ot-dns__type" @click="types = [...COMMON]">
            常用全选
          </view>
        </view>
      </view>
    </ot-panel>

    <template v-if="data">
      <view class="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-12px text-muted">
        <text>查询 <text class="ot-mono text-sub">{{ data.name }}</text></text>
        <text>{{ data.resolver }}</text>
        <text>耗时 {{ data.elapsed }} ms</text>
      </view>

      <ot-panel v-for="r in results" :key="r.type">
        <view class="mb-2 flex flex-wrap items-center gap-2">
          <text class="ot-mono text-15px text-main font-700">{{ r.type }}</text>
          <text class="text-12px text-muted">{{ TYPE_DESC[r.type] }}</text>
          <view class="flex-1" />
          <text v-if="r.ad" class="ot-dns__tag is-ok">DNSSEC</text>
          <text class="ot-dns__tag" :class="r.status === 'NOERROR' ? (r.answers.length ? 'is-ok' : '') : 'is-bad'">
            {{ r.status === 'NOERROR' && !r.answers.length ? '无此记录' : STATUS_TEXT[r.status] || r.status }}
          </text>
        </view>
        <view v-if="r.error" class="text-13px text-red-500">
          {{ r.error }}
        </view>
        <view v-for="(a, i) in r.answers" :key="i" class="ot-dns__rec">
          <view class="min-w-0 flex-1">
            <view class="flex flex-wrap items-center gap-x-2 text-11px text-muted">
              <text class="ot-mono">{{ a.type }}</text>
              <text v-if="a.name !== data.name" class="ot-mono break-all">{{ a.name }}</text>
              <text>TTL {{ a.ttl }}s</text>
            </view>
            <text class="ot-mono mt-0.5 block break-all text-14px text-main" user-select selectable>{{ a.data }}</text>
          </view>
          <view class="i-carbon-copy shrink-0 cursor-pointer p-1 text-15px text-muted" @click="copyText(a.data)" />
        </view>
        <view v-if="!r.answers.length && r.authority.length" class="text-12px text-muted">
          <text>权威服务器：</text>
          <text class="ot-mono break-all">{{ r.authority[0].data }}</text>
        </view>
      </ot-panel>
    </template>

    <view class="px-1 text-12px text-muted leading-20px">
      通过 DNS over HTTPS 查询公共解析服务，结果可能因解析服务所在地区与缓存而不同；CDN 加速的域名在不同解析服务下返回的 IP 不同属于正常现象。中文域名会自动转换为 Punycode。
    </view>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-dns__input {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  background: var(--ot-fill);
  color: var(--ot-text);
  border: 1px solid transparent;

  &:focus-within {
    border-color: var(--wot-color-theme);
  }
}

.ot-dns__hist {
  padding: 1px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--ot-text-2);
  background: var(--ot-fill);
  cursor: pointer;

  &:hover {
    color: var(--wot-color-theme);
  }
}

.ot-dns__type {
  padding: 3px 10px;
  border-radius: 7px;
  font-size: 12px;
  color: var(--ot-text-2);
  background: var(--ot-fill);
  border: 1px solid transparent;
  cursor: pointer;

  &.is-active {
    color: #0d9488;
    border-color: #14b8a6;
    background: rgba(20, 184, 166, 0.08);
    font-weight: 600;
  }
}

.ot-dns__tag {
  padding: 1px 8px;
  border-radius: 6px;
  font-size: 11px;
  color: var(--ot-text-2);
  background: var(--ot-fill);

  &.is-ok {
    color: #059669;
    background: rgba(16, 185, 129, 0.1);
  }

  &.is-bad {
    color: #dc2626;
    background: rgba(239, 68, 68, 0.1);
  }
}

.ot-dns__rec {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--ot-fill);

  & + & {
    margin-top: 6px;
  }
}
</style>
