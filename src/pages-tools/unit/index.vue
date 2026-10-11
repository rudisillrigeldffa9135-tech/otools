<script lang="ts" setup>
import { copyText } from '@/utils/common'
import { CATEGORIES, convert, formatNumber, getCategory, groupDigits } from './units'

definePage({
  style: { navigationBarTitleText: '单位换算' },
})

const categoryId = ref('length')
const category = computed(() => getCategory(categoryId.value)!)
const fromUnit = ref('m')
const value = ref('1')

function selectCategory(id: string) {
  if (id === categoryId.value)
    return
  categoryId.value = id
  fromUnit.value = getCategory(id)!.defaultUnit
  value.value = '1'
}

const unitIndex = computed(() => Math.max(0, category.value.units.findIndex(u => u.id === fromUnit.value)))
const from = computed(() => category.value.units[unitIndex.value])

const parsed = computed(() => {
  const s = value.value.trim().replace(/,/g, '')
  if (!s)
    return { empty: true }
  const n = Number(s)
  if (!Number.isFinite(n))
    return { error: '请输入数字' }
  // 绝对零度以下的温度没有意义
  if (categoryId.value === 'temperature' && convert(n, fromUnit.value, 'K', 'temperature') < -1e-9)
    return { error: '低于绝对零度（-273.15 °C）' }
  return { n }
})

const rows = computed(() => {
  const n = parsed.value.n
  if (n === undefined)
    return []
  return category.value.units.map((u) => {
    const raw = formatNumber(convert(n, fromUnit.value, u.id, categoryId.value))
    return { ...u, raw, display: groupDigits(raw), active: u.id === fromUnit.value }
  })
})

/** 点某一行：把它作为新的输入单位 */
function useAsInput(row: { id: string, raw: string }) {
  if (row.id === fromUnit.value)
    return
  value.value = row.raw
  fromUnit.value = row.id
}
</script>

<template>
  <ot-tool-layout>
    <ot-panel>
      <view class="ot-un__cats">
        <view v-for="c in CATEGORIES" :key="c.id" class="ot-un__cat" :class="{ 'is-active': c.id === categoryId }" @click="selectCategory(c.id)">
          <view :class="c.icon" class="text-18px" />
          <text class="mt-1 text-12px">{{ c.name }}</text>
        </view>
      </view>
    </ot-panel>

    <ot-panel :title="`${category.name}换算`">
      <view class="ot-un__input">
        <input v-model="value" class="ot-mono min-w-0 flex-1 text-20px" type="text" inputmode="decimal" placeholder="输入数值">
        <picker :range="category.units" range-key="name" :value="unitIndex" @change="fromUnit = category.units[$event.detail.value].id">
          <view class="ot-un__unit">
            <text>{{ from.name }}</text>
            <text v-if="from.symbol !== from.name" class="ot-mono text-12px text-muted">{{ from.symbol }}</text>
            <view class="i-carbon-chevron-down text-13px text-muted" />
          </view>
        </picker>
      </view>
      <view v-if="parsed.error" class="mt-2 text-13px text-red-500">
        {{ parsed.error }}
      </view>

      <view v-if="rows.length" class="mt-3">
        <view v-for="r in rows" :key="r.id" class="ot-un__row" :class="{ 'is-active': r.active }" @click="useAsInput(r)">
          <view class="w-28 shrink-0">
            <text class="block text-13px text-main">{{ r.name }}</text>
            <text v-if="r.symbol !== r.name" class="ot-mono text-11px text-muted">{{ r.symbol }}</text>
          </view>
          <text class="ot-mono min-w-0 flex-1 break-all text-right text-15px text-main" :class="{ 'font-600': r.active }">{{ r.display }}</text>
          <view class="i-carbon-copy shrink-0 cursor-pointer p-1 text-15px text-muted" @click.stop="copyText(r.raw)" />
        </view>
      </view>
      <view class="mt-3 text-12px text-muted leading-20px">
        点某一行可把它设为输入单位。{{ category.note || '' }}
      </view>
    </ot-panel>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-un__cats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

@media (min-width: 640px) {
  .ot-un__cats {
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }
}

.ot-un__cat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 0;
  border-radius: 10px;
  color: var(--ot-text-2);
  background: var(--ot-fill);
  border: 1px solid transparent;
  cursor: pointer;

  &.is-active {
    color: #f97316;
    border-color: #f97316;
    background: rgba(249, 115, 22, 0.08);
  }
}

.ot-un__input {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 0 8px 0 14px;
  border-radius: 12px;
  background: var(--ot-fill);
  color: var(--ot-text);
  border: 1px solid transparent;

  &:focus-within {
    border-color: var(--wot-color-theme);
  }
}

.ot-un__unit {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--ot-text);
  background: var(--ot-card);
  border: 1px solid var(--ot-border);
  white-space: nowrap;
  cursor: pointer;
}

.ot-un__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 10px;
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
  }

  &.is-active {
    background: rgba(249, 115, 22, 0.08);
  }
}
</style>
