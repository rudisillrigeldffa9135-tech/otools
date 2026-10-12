<script lang="ts" setup>
import type { IContact, IDomainWhois, IIpWhois } from '@/api/lookup'
import dayjs from 'dayjs'
import { whois } from '@/api/lookup'
import { copyText, toast } from '@/utils/common'

definePage({
  style: { navigationBarTitleText: '域名查询' },
})

/** RDAP 状态（EPP 状态码）的中文说明 */
const STATUS_ZH: Record<string, [string, 'ok' | 'lock' | 'warn']> = {
  'active': ['正常', 'ok'],
  'ok': ['正常', 'ok'],
  'client delete prohibited': ['禁止删除（注册商锁）', 'lock'],
  'client transfer prohibited': ['禁止转移（注册商锁）', 'lock'],
  'client update prohibited': ['禁止修改（注册商锁）', 'lock'],
  'client renew prohibited': ['禁止续费（注册商）', 'warn'],
  'client hold': ['暂停解析（注册商）', 'warn'],
  'server delete prohibited': ['禁止删除（注册局锁）', 'lock'],
  'server transfer prohibited': ['禁止转移（注册局锁）', 'lock'],
  'server update prohibited': ['禁止修改（注册局锁）', 'lock'],
  'server renew prohibited': ['禁止续费（注册局）', 'warn'],
  'server hold': ['暂停解析（注册局）', 'warn'],
  'pending delete': ['待删除', 'warn'],
  'pending transfer': ['转移中', 'warn'],
  'pending renew': ['续费处理中', 'warn'],
  'pending create': ['注册处理中', 'warn'],
  'pending update': ['修改处理中', 'warn'],
  'redemption period': ['赎回期（已过期）', 'warn'],
  'auto renew period': ['自动续费宽限期', 'ok'],
  'renew period': ['续费宽限期', 'ok'],
  'add period': ['新注册宽限期', 'ok'],
  'transfer period': ['转移宽限期', 'ok'],
  'inactive': ['未激活（未设置 DNS）', 'warn'],
  'locked': ['锁定', 'lock'],
  'associated': ['已关联', 'ok'],
}

const query = ref('')
const loading = ref(false)
const error = ref('')
const result = ref<IDomainWhois | IIpWhois>()

const EXAMPLES = ['github.com', 'bbc.co.uk', 'example.org', '1.1.1.1', '8.8.8.8']

async function search(q = query.value) {
  const v = q.trim()
  if (!v)
    return toast('请输入域名或 IP')
  query.value = v
  loading.value = true
  error.value = ''
  result.value = undefined
  try {
    result.value = await whois(v)
  }
  catch (e: any) {
    error.value = e?.message || '查询失败'
  }
  finally {
    loading.value = false
  }
}

onLoad((q) => {
  if (q?.q)
    search(decodeURIComponent(String(q.q)))
})

const domain = computed(() => (result.value?.kind === 'domain' ? result.value : undefined))
const ip = computed(() => (result.value?.kind === 'ip' ? result.value : undefined))

function fmt(iso: string) {
  return iso ? dayjs(iso).format('YYYY-MM-DD HH:mm') : ''
}

const expiry = computed(() => {
  const d = domain.value
  if (!d?.expiresAt)
    return null
  const days = dayjs(d.expiresAt).diff(dayjs(), 'day')
  return { days, text: days < 0 ? `已过期 ${-days} 天` : days === 0 ? '今天到期' : `还有 ${days} 天`, level: days < 0 ? 'bad' : days <= 30 ? 'warn' : 'ok' }
})

const age = computed(() => {
  const iso = domain.value?.registeredAt || ip.value?.registeredAt
  if (!iso)
    return ''
  const years = dayjs().diff(dayjs(iso), 'year')
  return years >= 1 ? `已注册 ${years} 年` : `已注册 ${dayjs().diff(dayjs(iso), 'day')} 天`
})

function statusOf(s: string) {
  const [text, kind] = STATUS_ZH[s.toLowerCase()] ?? [s, 'ok']
  return { text, kind }
}

function contactLines(c: IContact | null) {
  if (!c)
    return []
  return [c.name, c.org, c.email, c.phone.replace(/^tel:/, ''), c.country].filter(Boolean)
}

function toDns(name: string) {
  uni.navigateTo({ url: `/pages-tools/dns/index?name=${encodeURIComponent(name)}` })
}

function countryName(code: string) {
  try {
    return new (Intl as any).DisplayNames(['zh-CN'], { type: 'region' }).of(code) || code
  }
  catch {
    return code
  }
}
</script>

<template>
  <ot-tool-layout>
    <ot-panel>
      <view class="flex gap-2">
        <view class="ot-who__input">
          <view class="i-carbon-search shrink-0 text-16px text-muted" />
          <input v-model="query" class="ot-mono min-w-0 flex-1 text-15px" placeholder="域名（如 example.com）或 IP 地址" confirm-type="search" @confirm="search()">
          <view v-if="query" class="i-carbon-close-filled cursor-pointer text-16px text-muted" @click="query = ''" />
        </view>
        <wd-button :loading="loading" @click="search()">
          查询
        </wd-button>
      </view>
      <view class="mt-2 flex flex-wrap items-center gap-1.5">
        <text class="text-12px text-muted">试试：</text>
        <view v-for="e in EXAMPLES" :key="e" class="ot-who__chip ot-mono" @click="search(e)">
          {{ e }}
        </view>
      </view>
    </ot-panel>

    <view v-if="error" class="ot-who__error">
      <view class="i-carbon-warning-filled shrink-0" />
      <text>{{ error }}</text>
    </view>

    <!-- 域名 -->
    <template v-if="domain">
      <ot-panel>
        <view class="flex flex-wrap items-center gap-2">
          <text class="ot-mono break-all text-20px text-main font-700">{{ domain.unicodeName && domain.unicodeName !== domain.name ? domain.unicodeName : domain.name }}</text>
          <text v-if="domain.unicodeName && domain.unicodeName !== domain.name" class="ot-mono text-12px text-muted">{{ domain.name }}</text>
          <view class="flex-1" />
          <wd-button size="small" type="info" plain @click="toDns(domain.name)">
            查 DNS 解析
          </wd-button>
        </view>
        <view class="ot-who__dates">
          <view class="ot-who__date" :class="expiry ? `is-${expiry.level}` : ''">
            <text class="text-12px text-muted">到期时间</text>
            <text class="ot-mono text-15px text-main font-600">{{ fmt(domain.expiresAt) || '未公开' }}</text>
            <text v-if="expiry" class="ot-who__days">{{ expiry.text }}</text>
          </view>
          <view class="ot-who__date">
            <text class="text-12px text-muted">注册时间</text>
            <text class="ot-mono text-15px text-main font-600">{{ fmt(domain.registeredAt) || '未公开' }}</text>
            <text v-if="age" class="text-12px text-muted">{{ age }}</text>
          </view>
          <view class="ot-who__date">
            <text class="text-12px text-muted">最后更新</text>
            <text class="ot-mono text-15px text-main font-600">{{ fmt(domain.updatedAt) || '—' }}</text>
          </view>
        </view>
      </ot-panel>

      <ot-panel title="注册信息">
        <view class="ot-who__kv">
          <text class="ot-who__k">注册商</text>
          <view class="min-w-0 flex-1">
            <text class="block break-all text-14px text-main">{{ domain.registrar || '—' }}</text>
            <text v-if="domain.registrarIanaId || domain.registrarUrl" class="block break-all text-12px text-muted">
              {{ [domain.registrarIanaId && `IANA ID ${domain.registrarIanaId}`, domain.registrarUrl].filter(Boolean).join(' · ') }}
            </text>
          </view>
        </view>
        <view class="ot-who__kv">
          <text class="ot-who__k">状态</text>
          <view class="flex flex-1 flex-wrap gap-1.5">
            <text v-for="s in domain.status" :key="s" class="ot-who__tag" :class="`is-${statusOf(s).kind}`" :title="s">{{ statusOf(s).text }}</text>
            <text v-if="!domain.status.length" class="text-13px text-muted">—</text>
          </view>
        </view>
        <view class="ot-who__kv">
          <text class="ot-who__k">DNS 服务器</text>
          <view class="min-w-0 flex-1">
            <text v-for="ns in domain.nameservers" :key="ns" class="ot-mono block break-all text-13px text-main" @click="copyText(ns)">{{ ns }}</text>
            <text v-if="!domain.nameservers.length" class="text-13px text-muted">—</text>
          </view>
        </view>
        <view class="ot-who__kv">
          <text class="ot-who__k">DNSSEC</text>
          <text class="text-13px" :class="domain.dnssec ? 'text-emerald-600' : 'text-muted'">{{ domain.dnssec ? '已启用' : '未启用' }}</text>
        </view>
        <view class="ot-who__kv">
          <text class="ot-who__k">注册人</text>
          <view class="min-w-0 flex-1 text-13px">
            <text v-for="l in contactLines(domain.registrant)" :key="l" class="block break-all text-main">{{ l }}</text>
            <text v-if="!contactLines(domain.registrant).length" class="text-muted">已隐藏（隐私保护）</text>
          </view>
        </view>
        <view v-if="contactLines(domain.abuse).length" class="ot-who__kv">
          <text class="ot-who__k">滥用投诉</text>
          <view class="min-w-0 flex-1 text-13px">
            <text v-for="l in contactLines(domain.abuse)" :key="l" class="block break-all text-main">{{ l }}</text>
          </view>
        </view>
      </ot-panel>
    </template>

    <!-- IP -->
    <ot-panel v-if="ip" title="IP 段归属">
      <view class="ot-who__kv">
        <text class="ot-who__k">网段</text>
        <view class="min-w-0 flex-1">
          <text class="ot-mono block break-all text-14px text-main">{{ ip.range || ip.handle }}</text>
          <text v-if="ip.cidrs.length" class="ot-mono block text-12px text-muted">{{ ip.cidrs.join('，') }}</text>
        </view>
      </view>
      <view class="ot-who__kv">
        <text class="ot-who__k">网络名称</text>
        <text class="ot-mono min-w-0 flex-1 break-all text-14px text-main">{{ ip.name || '—' }}</text>
      </view>
      <view class="ot-who__kv">
        <text class="ot-who__k">国家 / 地区</text>
        <text class="text-14px text-main">{{ ip.country ? `${countryName(ip.country)}（${ip.country}）` : '—' }}</text>
      </view>
      <view class="ot-who__kv">
        <text class="ot-who__k">类型</text>
        <text class="text-14px text-main">{{ ip.type || '—' }}</text>
      </view>
      <view class="ot-who__kv">
        <text class="ot-who__k">归属单位</text>
        <view class="min-w-0 flex-1 text-13px">
          <text v-for="l in contactLines(ip.owner)" :key="l" class="block break-all text-main">{{ l }}</text>
          <text v-if="!contactLines(ip.owner).length" class="text-muted">—</text>
        </view>
      </view>
      <view v-if="contactLines(ip.abuse).length" class="ot-who__kv">
        <text class="ot-who__k">滥用投诉</text>
        <view class="min-w-0 flex-1 text-13px">
          <text v-for="l in contactLines(ip.abuse)" :key="l" class="block break-all text-main">{{ l }}</text>
        </view>
      </view>
      <view class="ot-who__kv">
        <text class="ot-who__k">分配时间</text>
        <text class="ot-mono text-13px text-main">{{ fmt(ip.registeredAt) || '—' }}{{ ip.updatedAt ? `（更新于 ${fmt(ip.updatedAt)}）` : '' }}</text>
      </view>
    </ot-panel>

    <view class="px-1 text-12px text-muted leading-20px">
      通过 RDAP（WHOIS 的标准化接口）向各注册局查询。按隐私法规，大多数域名的注册人信息会被隐藏；.cn 等部分后缀的注册局没有开放 RDAP，暂时查不到。输入子域名时会自动查询其主域名。
    </view>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-who__input {
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

.ot-who__chip {
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

.ot-who__error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  color: #dc2626;
  background: rgba(239, 68, 68, 0.08);
}

.ot-who__dates {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

@media (max-width: 520px) {
  .ot-who__dates {
    grid-template-columns: minmax(0, 1fr);
  }
}

.ot-who__date {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--ot-fill);
  border: 1px solid transparent;

  &.is-warn {
    border-color: rgba(245, 158, 11, 0.5);
    .ot-who__days {
      color: #d97706;
    }
  }

  &.is-bad {
    border-color: rgba(239, 68, 68, 0.5);
    .ot-who__days {
      color: #dc2626;
    }
  }
}

.ot-who__days {
  font-size: 12px;
  color: #059669;
}

.ot-who__kv {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px dashed var(--ot-border);

  &:last-child {
    border-bottom: none;
  }
}

.ot-who__k {
  flex-shrink: 0;
  width: 84px;
  font-size: 13px;
  color: var(--ot-text-3);
}

.ot-who__tag {
  padding: 1px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: #059669;
  background: rgba(16, 185, 129, 0.1);

  &.is-lock {
    color: #2563eb;
    background: rgba(37, 99, 235, 0.08);
  }

  &.is-warn {
    color: #d97706;
    background: rgba(245, 158, 11, 0.12);
  }
}
</style>
