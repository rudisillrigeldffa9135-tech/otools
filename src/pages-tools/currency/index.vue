<script lang="ts" setup>
import type { IRates } from '@/api/lookup'
import dayjs from 'dayjs'
import { getRates } from '@/api/lookup'
import { copyText, toast } from '@/utils/common'
import { convert, currencyName, DEFAULT_FAVORITES, formatAmount } from './currencies'

definePage({
  style: { navigationBarTitleText: '汇率换算' },
})

const FAV_KEY = 'ot-currency-favorites'
const BASE_KEY = 'ot-currency-base'

const data = ref<IRates>()
const loading = ref(false)
const error = ref('')
const amountInput = ref('100')
const base = ref('CNY')
const favorites = ref<string[]>([...DEFAULT_FAVORITES])

try {
  const fav = uni.getStorageSync(FAV_KEY)
  if (Array.isArray(fav) && fav.length)
    favorites.value = fav
  const b = uni.getStorageSync(BASE_KEY)
  if (typeof b === 'string' && b)
    base.value = b
}
catch {}

function persist() {
  try {
    uni.setStorageSync(FAV_KEY, favorites.value)
    uni.setStorageSync(BASE_KEY, base.value)
  }
  catch {}
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await getRates()
  }
  catch (e: any) {
    error.value = e?.message || '汇率获取失败'
  }
  finally {
    loading.value = false
  }
}
onLoad(load)

const amount = computed(() => {
  const n = Number(amountInput.value.replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : Number.NaN
})

/** 全部币种，按「常用在前、其余按代码」排序，用于选择器 */
const allCodes = computed(() => {
  const codes = Object.keys(data.value?.rates ?? {})
  return codes.sort((a, b) => Number(!DEFAULT_FAVORITES.includes(a)) - Number(!DEFAULT_FAVORITES.includes(b)) || a.localeCompare(b))
})
const allLabels = computed(() => allCodes.value.map(c => `${c}  ${currencyName(c)}`))

const rows = computed(() => {
  const rates = data.value?.rates
  if (!rates)
    return []
  return favorites.value
    .filter(c => c !== base.value && rates[c])
    .map(code => ({
      code,
      name: currencyName(code),
      value: convert(amount.value, base.value, code, rates),
      unit: convert(1, base.value, code, rates),
      inverse: convert(1, code, base.value, rates),
    }))
})

function pickBase(e: any) {
  base.value = allCodes.value[e.detail.value]
  if (!favorites.value.includes(base.value))
    favorites.value.unshift(base.value)
  persist()
}

/** 点某一行：把它设为基准，金额同步换算 */
function useAsBase(code: string, value: number) {
  base.value = code
  amountInput.value = Number.isFinite(value) ? String(Number(value.toPrecision(10))) : '100'
  persist()
}

function addFavorite(e: any) {
  const code = allCodes.value[e.detail.value]
  if (favorites.value.includes(code))
    return toast('已在列表中')
  favorites.value.push(code)
  persist()
}

function removeFavorite(code: string) {
  favorites.value = favorites.value.filter(c => c !== code)
  persist()
}

function resetFavorites() {
  favorites.value = [...DEFAULT_FAVORITES]
  persist()
}

const baseIndex = computed(() => Math.max(0, allCodes.value.indexOf(base.value)))
</script>

<template>
  <ot-tool-layout>
    <ot-panel>
      <view class="ot-cur__input">
        <picker :range="allLabels" :value="baseIndex" :disabled="!allCodes.length" @change="pickBase">
          <view class="ot-cur__base">
            <text class="ot-mono text-16px font-700">{{ base }}</text>
            <text class="text-12px text-muted">{{ currencyName(base) }}</text>
            <view class="i-carbon-chevron-down text-13px text-muted" />
          </view>
        </picker>
        <input v-model="amountInput" class="ot-mono min-w-0 flex-1 text-right text-22px" type="digit" placeholder="0">
      </view>
      <view v-if="error" class="mt-3 flex items-center gap-2 text-13px text-red-500">
        <text class="flex-1">{{ error }}</text>
        <text class="cursor-pointer font-600" @click="load">重试</text>
      </view>
      <view v-else-if="data" class="mt-2 flex flex-wrap items-center gap-x-3 text-12px text-muted">
        <text>汇率更新于 {{ dayjs(data.updatedAt * 1000).format('YYYY-MM-DD HH:mm') }}</text>
        <text v-if="data.stale" class="text-amber-600">数据源暂不可用，显示的是上次的汇率</text>
      </view>
      <view v-else class="mt-2 text-12px text-muted">
        加载汇率中…
      </view>
    </ot-panel>

    <ot-panel v-if="data">
      <template #extra>
        <picker :range="allLabels" @change="addFavorite">
          <view class="flex cursor-pointer items-center gap-1 text-13px text-[var(--wot-color-theme)]">
            <view class="i-carbon-add" />添加币种
          </view>
        </picker>
        <text class="cursor-pointer text-13px text-muted" @click="resetFavorites">恢复默认</text>
      </template>
      <view v-if="!Number.isFinite(amount)" class="py-4 text-center text-13px text-red-500">
        请输入数字
      </view>
      <view v-for="r in rows" :key="r.code" class="ot-cur__row" @click="useAsBase(r.code, r.value)">
        <view class="w-26 shrink-0">
          <text class="ot-mono block text-15px text-main font-600">{{ r.code }}</text>
          <text class="block truncate text-12px text-muted">{{ r.name }}</text>
        </view>
        <view class="min-w-0 flex-1 text-right">
          <text class="ot-mono block break-all text-17px text-main">{{ formatAmount(r.value) }}</text>
          <text class="ot-mono block text-11px text-muted">1 {{ base }} = {{ formatAmount(r.unit) }} · 1 {{ r.code }} = {{ formatAmount(r.inverse) }} {{ base }}</text>
        </view>
        <view class="flex shrink-0 flex-col gap-2">
          <view class="i-carbon-copy cursor-pointer text-15px text-muted" @click.stop="copyText(formatAmount(r.value).replace(/,/g, ''))" />
          <view class="i-carbon-close cursor-pointer text-15px text-muted" @click.stop="removeFavorite(r.code)" />
        </view>
      </view>
      <view class="mt-2 text-12px text-muted">
        点某一行可以把它设为换算基准。
      </view>
    </ot-panel>

    <view class="px-1 text-12px text-muted leading-20px">
      汇率为国际市场参考中间价，每日更新一次，与银行买入 / 卖出价、刷卡汇率会有差异。数据来源：
      <text class="text-[var(--wot-color-theme)]">ExchangeRate-API（exchangerate-api.com）</text>。
    </view>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-cur__input {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 0 14px 0 6px;
  border-radius: 12px;
  background: var(--ot-fill);
  color: var(--ot-text);
  border: 1px solid transparent;

  &:focus-within {
    border-color: var(--wot-color-theme);
  }
}

.ot-cur__base {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--ot-card);
  border: 1px solid var(--ot-border);
  white-space: nowrap;
  cursor: pointer;
}

.ot-cur__row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 6px;
  border-bottom: 1px solid var(--ot-border);
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
  }
}
</style>
