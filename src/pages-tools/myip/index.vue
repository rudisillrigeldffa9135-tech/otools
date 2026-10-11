<script lang="ts" setup>
import type { IMyIp } from '@/api/network'
import { getMyIp } from '@/api/network'
import { copyText } from '@/utils/common'

definePage({
  style: { navigationBarTitleText: '我的 IP' },
})

const info = ref<IMyIp>()
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    info.value = await getMyIp()
  }
  catch (e: any) {
    error.value = e?.message || '获取失败'
  }
  finally {
    loading.value = false
  }
}

onLoad(load)

/** 常见国家 / 地区的中文名；H5 优先用浏览器的 Intl，小程序不支持时用这份兜底 */
const COUNTRY_ZH: Record<string, string> = {
  CN: '中国',
  HK: '中国香港',
  MO: '中国澳门',
  TW: '中国台湾',
  US: '美国',
  JP: '日本',
  KR: '韩国',
  SG: '新加坡',
  GB: '英国',
  DE: '德国',
  FR: '法国',
  CA: '加拿大',
  AU: '澳大利亚',
  RU: '俄罗斯',
  IN: '印度',
  NL: '荷兰',
  MY: '马来西亚',
  TH: '泰国',
  VN: '越南',
  PH: '菲律宾',
  ID: '印度尼西亚',
}
const CONTINENT_ZH: Record<string, string> = { AS: '亚洲', EU: '欧洲', NA: '北美洲', SA: '南美洲', AF: '非洲', OC: '大洋洲', AN: '南极洲' }

function countryName(code: string) {
  if (!code)
    return ''
  try {
    const name = new (Intl as any).DisplayNames(['zh-CN'], { type: 'region' }).of(code)
    if (name && name !== code)
      return name
  }
  catch {}
  return COUNTRY_ZH[code] || code
}

/** 浏览器 / 系统时区，和 IP 所在时区不一致时通常说明在使用代理或 VPN */
const localTimezone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  }
  catch {
    return ''
  }
})()

function timeIn(tz: string) {
  try {
    return new Intl.DateTimeFormat('zh-CN', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
  }
  catch {
    return ''
  }
}

const location = computed(() => {
  const i = info.value
  if (!i)
    return ''
  return [countryName(i.country), i.region, i.city].filter(Boolean).filter((v, idx, arr) => arr.indexOf(v) === idx).join(' · ')
})

const rows = computed(() => {
  const i = info.value
  if (!i)
    return []
  const tzTime = i.timezone ? timeIn(i.timezone) : ''
  return [
    { label: '国家 / 地区', value: [countryName(i.country), i.country && `(${i.country})`, i.isEUCountry ? '· 欧盟' : ''].filter(Boolean).join(' ') },
    { label: '大洲', value: CONTINENT_ZH[i.continent] || i.continent },
    { label: '省 / 州', value: i.region },
    { label: '城市', value: i.city },
    { label: '邮编', value: i.postalCode },
    { label: '时区', value: [i.timezone, tzTime && `当地时间 ${tzTime}`].filter(Boolean).join(' · ') },
    { label: '经纬度', value: i.latitude && i.longitude ? `${i.latitude}, ${i.longitude}` : '' },
    { label: '运营商', value: i.asn ? `AS${i.asn} ${i.asOrganization}` : i.asOrganization },
    { label: 'CF 节点', value: i.colo },
    { label: '连接协议', value: [i.httpProtocol, i.tlsVersion].filter(Boolean).join(' · ') },
    { label: '浏览器语言', value: i.acceptLanguage.split(',')[0] },
  ].filter(r => r.value)
})

const timezoneMismatch = computed(() => {
  const tz = info.value?.timezone
  return !!(tz && localTimezone && tz !== localTimezone)
})

function openMap() {
  const i = info.value
  if (!i?.latitude)
    return
  const url = `https://www.openstreetmap.org/?mlat=${i.latitude}&mlon=${i.longitude}#map=11/${i.latitude}/${i.longitude}`
  // #ifdef H5
  window.open(url, '_blank', 'noopener,noreferrer')
  // #endif
  // #ifndef H5
  copyText(url)
  // #endif
}
</script>

<template>
  <ot-tool-layout>
    <ot-panel>
      <view class="flex flex-col items-center py-4">
        <text class="text-13px text-muted">你的公网 IP</text>
        <view v-if="loading && !info" class="mt-3 text-14px text-muted">
          查询中…
        </view>
        <view v-else-if="error" class="mt-3 text-14px text-red-500">
          {{ error }}
        </view>
        <template v-else-if="info">
          <view class="mt-2 flex items-center gap-2">
            <text class="ot-mono break-all text-center text-28px text-main font-700 md:text-34px" user-select selectable>{{ info.ip }}</text>
            <text class="ot-ip__tag">IPv{{ info.version }}</text>
          </view>
          <view v-if="location" class="mt-2 text-14px text-sub">
            {{ location }}
          </view>
          <view class="mt-4 flex flex-wrap justify-center gap-2">
            <wd-button size="small" icon="copy" @click="copyText(info.ip)">
              复制 IP
            </wd-button>
            <wd-button size="small" type="info" plain :loading="loading" @click="load">
              刷新
            </wd-button>
            <wd-button v-if="info.latitude" size="small" type="info" plain @click="openMap">
              查看地图
            </wd-button>
          </view>
        </template>
      </view>
    </ot-panel>

    <view v-if="timezoneMismatch" class="ot-ip__hint">
      <view class="i-carbon-information shrink-0 text-16px" />
      <text>IP 所在时区（{{ info?.timezone }}）与本机时区（{{ localTimezone }}）不同，可能正在使用代理或 VPN。</text>
    </view>

    <ot-panel v-if="rows.length" title="详细信息">
      <ot-result v-for="r in rows" :key="r.label" :label="r.label" :value="r.value" />
    </ot-panel>

    <ot-panel v-if="info?.userAgent" title="浏览器标识（User-Agent）">
      <ot-result label="UA" :value="info.userAgent" />
    </ot-panel>

    <view class="px-1 text-12px text-muted leading-20px">
      位置信息由 Cloudflare 根据 IP 推算，通常精确到城市，可能与实际位置有偏差；运营商为该 IP 所属的自治系统（ASN）。IPv6 优先的网络会显示 IPv6 地址。
    </view>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-ip__tag {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: #0d9488;
  background: rgba(20, 184, 166, 0.12);
}

.ot-ip__hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  color: #b45309;
  background: rgba(245, 158, 11, 0.12);
}
</style>
