<script lang="ts" setup>
import dayjs from 'dayjs'

definePage({
  style: { navigationBarTitleText: '时间戳转换' },
})

const FORMAT = 'YYYY-MM-DD HH:mm:ss'

// 当前时间
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onShow(() => {
  timer = setInterval(() => (now.value = Date.now()), 1000)
})
onHide(() => clearInterval(timer))
onUnload(() => clearInterval(timer))
const nowSec = computed(() => String(Math.floor(now.value / 1000)))
const nowDate = computed(() => dayjs(now.value).format(FORMAT))

// 时间戳 → 日期：10 位按秒，13 位按毫秒自动识别
const tsInput = ref(String(Math.floor(Date.now() / 1000)))
const tsResult = computed(() => {
  const v = tsInput.value.trim()
  if (!/^-?\d+$/.test(v))
    return null
  const ms = v.replace('-', '').length > 11 ? Number(v) : Number(v) * 1000
  const d = dayjs(ms)
  if (!d.isValid())
    return null
  return {
    unit: v.replace('-', '').length > 11 ? '毫秒' : '秒',
    local: d.format(FORMAT),
    iso: d.toISOString(),
    utc: new Date(ms).toUTCString(),
  }
})

// 日期 → 时间戳
const dateInput = ref(dayjs().format(FORMAT))
const dateResult = computed(() => {
  const d = dayjs(dateInput.value.trim().replace(/\//g, '-'))
  if (!d.isValid())
    return null
  return { s: String(d.unix()), ms: String(d.valueOf()) }
})

function fillNow() {
  tsInput.value = String(Math.floor(Date.now() / 1000))
  dateInput.value = dayjs().format(FORMAT)
}
</script>

<template>
  <ot-tool-layout>
    <ot-panel title="当前时间">
      <ot-result label="秒" :value="nowSec" />
      <ot-result label="毫秒" :value="String(now)" />
      <ot-result label="日期" :value="nowDate" />
    </ot-panel>

    <ot-panel title="时间戳 → 日期">
      <template #extra>
        <wd-button size="small" type="info" plain @click="fillNow">
          当前
        </wd-button>
      </template>
      <input v-model="tsInput" class="ot-input ot-mono" type="text" placeholder="输入秒或毫秒时间戳">
      <view v-if="tsResult" class="mt-3">
        <ot-result label="识别为" :value="tsResult.unit" />
        <ot-result label="本地时间" :value="tsResult.local" />
        <ot-result label="ISO 8601" :value="tsResult.iso" />
        <ot-result label="UTC" :value="tsResult.utc" />
      </view>
      <view v-else-if="tsInput" class="mt-3 text-13px text-red-500">
        请输入有效的整数时间戳
      </view>
    </ot-panel>

    <ot-panel title="日期 → 时间戳">
      <input v-model="dateInput" class="ot-input ot-mono" type="text" :placeholder="FORMAT">
      <view v-if="dateResult" class="mt-3">
        <ot-result label="秒" :value="dateResult.s" />
        <ot-result label="毫秒" :value="dateResult.ms" />
      </view>
      <view v-else-if="dateInput" class="mt-3 text-13px text-red-500">
        日期格式不正确，示例：2026-01-01 08:00:00
      </view>
    </ot-panel>
  </ot-tool-layout>
</template>
