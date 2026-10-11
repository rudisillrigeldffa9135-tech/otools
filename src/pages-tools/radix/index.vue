<script lang="ts" setup>
definePage({
  style: { navigationBarTitleText: '进制转换' },
})

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'
// 部分旧版小程序基础库不支持 BigInt，此时退化为 Number（超过 2^53 会丢精度）
const hasBigInt = typeof BigInt === 'function'
// 带前缀时以前缀为准，忽略所选源进制
const PREFIX_BASE: Record<string, number> = { '0b': 2, '0o': 8, '0x': 16 }

const input = ref('255')
const fromBase = ref(10)
const baseOptions = [
  { value: 2, label: '二' },
  { value: 8, label: '八' },
  { value: 10, label: '十' },
  { value: 16, label: '十六' },
]
const targets = [
  { base: 2, label: '二进制' },
  { base: 8, label: '八进制' },
  { base: 10, label: '十进制' },
  { base: 16, label: '十六进制' },
  { base: 32, label: '三十二进制' },
  { base: 36, label: '三十六进制' },
]

function parse(raw: string, base: number): { value: bigint | number } | { error: string } {
  let s = raw.trim().toLowerCase().replace(/[_\s]/g, '')
  const negative = s.startsWith('-')
  if (negative)
    s = s.slice(1)
  const prefixBase = PREFIX_BASE[s.slice(0, 2)]
  if (prefixBase) {
    base = prefixBase
    s = s.slice(2)
  }
  if (!s)
    return { error: '' }

  let acc: bigint | number = hasBigInt ? BigInt(0) : 0
  for (const ch of s) {
    const d = DIGITS.indexOf(ch)
    if (d < 0 || d >= base)
      return { error: `“${ch}” 不是有效的 ${base} 进制数字` }
    acc = hasBigInt
      ? (acc as bigint) * BigInt(base) + BigInt(d)
      : (acc as number) * base + d
  }
  if (negative)
    acc = -acc
  return { value: acc }
}

const parsed = computed(() => parse(input.value, fromBase.value))
const results = computed(() => {
  const p = parsed.value
  if (!('value' in p))
    return []
  return targets.map(t => ({ label: t.label, value: p.value.toString(t.base) }))
})
const errorMsg = computed(() => ('error' in parsed.value ? parsed.value.error : ''))
const precisionLost = computed(() => {
  const p = parsed.value
  return !hasBigInt && 'value' in p && !Number.isSafeInteger(p.value)
})
</script>

<template>
  <ot-tool-layout>
    <ot-panel title="输入">
      <view class="mb-3 flex items-center gap-3 text-13px text-sub">
        源进制
        <ot-segmented v-model="fromBase" :options="baseOptions" size="small" />
      </view>
      <input v-model="input" class="ot-input ot-mono" type="text" placeholder="输入数字，支持 0x / 0b 前缀">
      <view v-if="errorMsg" class="mt-2 text-13px text-red-500">
        {{ errorMsg }}
      </view>
      <view v-if="precisionLost" class="mt-2 text-13px text-amber-500">
        当前环境不支持 BigInt，超过 2^53 的数字可能丢失精度
      </view>
    </ot-panel>

    <ot-panel title="结果">
      <template v-if="results.length">
        <ot-result v-for="r in results" :key="r.label" :label="r.label" :value="r.value" />
      </template>
      <view v-else class="py-4 text-center text-13px text-muted">
        输入数字后实时转换
      </view>
    </ot-panel>
  </ot-tool-layout>
</template>
