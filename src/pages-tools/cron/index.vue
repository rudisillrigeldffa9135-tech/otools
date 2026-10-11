<script lang="ts" setup>
import type { CronDialect } from './cron'
import { copyText } from '@/utils/common'
import { convertDialect, detectDialect, DIALECTS, nextRuns, parseCron, presetFor, PRESETS, WEEKDAY_ZH } from './cron'

definePage({
  style: { navigationBarTitleText: 'Cron 表达式' },
})

const expr = ref('0 9 * * 1-5')
const dialect = ref<CronDialect>('linux')
const count = ref(10)

// 输入变化时按位数自动识别方言，用户仍可手动切换
watch(expr, (v) => {
  dialect.value = detectDialect(v)
})

/** 每 30 秒刷新一次「多久之后」 */
const now = ref(new Date())

const result = computed(() => {
  try {
    const cron = parseCron(expr.value, dialect.value)
    return { cron, runs: nextRuns(cron, count.value, now.value) }
  }
  catch (e: any) {
    return { error: e.message as string }
  }
})

let timer: ReturnType<typeof setInterval> | undefined
onShow(() => {
  now.value = new Date()
  timer = setInterval(() => (now.value = new Date()), 30000)
})
onHide(() => clearInterval(timer))
onUnload(() => clearInterval(timer))

const pad = (n: number) => String(n).padStart(2, '0')
function fmt(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
function relative(d: Date) {
  const s = Math.round((d.getTime() - now.value.getTime()) / 1000)
  if (s < 60)
    return `${Math.max(s, 0)} 秒后`
  if (s < 3600)
    return `${Math.floor(s / 60)} 分钟后`
  if (s < 86400)
    return `${Math.floor(s / 3600)} 小时 ${Math.floor((s % 3600) / 60)} 分后`
  const days = Math.floor(s / 86400)
  return days < 365 ? `${days} 天后` : `${(days / 365).toFixed(1)} 年后`
}

function usePreset(p: string) {
  const d = dialect.value
  expr.value = presetFor(p, d)
  // watch 会按位数重新识别，这里保持用户选择的方言
  nextTick(() => (dialect.value = d))
}

/** 切换方言时顺带转换表达式（补秒、调整周的取值等） */
function switchDialect(d: CronDialect) {
  const from = dialect.value
  if (d === from)
    return
  expr.value = convertDialect(expr.value, from, d)
  // watch 会按位数重新识别，这里以用户的选择为准
  nextTick(() => (dialect.value = d))
}

const timezone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  }
  catch {
    return ''
  }
})()

const SYNTAX = [
  ['*', '任意值'],
  [',', '列举多个值，如 1,15'],
  ['-', '范围，如 9-17、MON-FRI'],
  ['/', '步长，如 */5（每 5 个单位）、10/15（从 10 起每 15）'],
  ['?', '不指定，仅用于日、周（Quartz 中两者必须有一个是 ?）'],
  ['L', '最后：日写 L 为月末，L-2 为倒数第 3 天；周写 5L 为最后一个周五（Quartz 中 6L）'],
  ['W', '最近的工作日：15W 为离 15 号最近的周一至周五，LW 为最后一个工作日'],
  ['#', '第几个：周写 MON#2 为每月第 2 个周一'],
]
</script>

<template>
  <ot-tool-layout>
    <ot-panel title="表达式">
      <template #extra>
        <ot-segmented :model-value="dialect" :options="DIALECTS" size="small" @update:model-value="switchDialect($event as CronDialect)" />
      </template>
      <view class="ot-cron__input">
        <input v-model="expr" class="ot-mono min-w-0 flex-1 text-18px" placeholder="如 */5 * * * *" :maxlength="200">
        <view v-if="expr" class="i-carbon-close-filled cursor-pointer text-17px text-muted" @click="expr = ''" />
      </view>
      <view class="mt-2 text-12px text-muted">
        {{ DIALECTS.find(d => d.value === dialect)?.desc }}
      </view>
      <view class="mt-3 flex flex-wrap gap-1.5">
        <view v-for="p in PRESETS" :key="p.expr" class="ot-cron__chip" @click="usePreset(p.expr)">
          {{ p.label }}
        </view>
      </view>
    </ot-panel>

    <view v-if="result.error" class="ot-cron__error">
      <view class="i-carbon-warning-filled shrink-0" />
      <text>{{ result.error }}</text>
    </view>

    <template v-else-if="result.cron">
      <ot-panel>
        <view class="ot-cron__desc">
          <text class="text-12px text-muted">含义</text>
          <text class="mt-1 block text-18px text-main font-600 leading-snug">{{ result.cron.description }}</text>
        </view>
        <view class="ot-cron__fields">
          <view v-for="f in result.cron.fields" :key="f.key" class="ot-cron__field">
            <text class="text-12px text-muted">{{ f.label }}</text>
            <text class="ot-mono mt-0.5 text-15px text-main font-600">{{ f.raw }}</text>
            <text class="mt-0.5 text-12px text-sub leading-16px">{{ f.text }}</text>
          </view>
        </view>
      </ot-panel>

      <ot-panel :title="`接下来 ${result.runs.length} 次执行`">
        <template #extra>
          <view class="flex items-center gap-3">
            <text class="cursor-pointer text-13px text-[var(--wot-color-theme)]" @click="count = count === 10 ? 30 : 10">
              {{ count === 10 ? '显示 30 次' : '显示 10 次' }}
            </text>
            <view class="i-carbon-copy cursor-pointer text-16px text-muted" @click="copyText(result.runs.map(fmt).join('\n'))" />
          </view>
        </template>
        <view v-if="!result.runs.length" class="py-4 text-center text-13px text-muted">
          100 年内不会执行（例如 2 月 30 日）
        </view>
        <view v-for="(d, i) in result.runs" :key="d.getTime()" class="ot-cron__run">
          <text class="w-6 shrink-0 text-12px text-muted">{{ i + 1 }}</text>
          <text class="ot-mono flex-1 text-14px text-main">{{ fmt(d) }}</text>
          <text class="w-10 shrink-0 text-13px text-sub">{{ WEEKDAY_ZH[d.getDay()] }}</text>
          <text class="w-24 shrink-0 text-right text-12px text-muted">{{ relative(d) }}</text>
        </view>
        <view v-if="timezone" class="mt-3 text-12px text-muted">
          按本机时区 {{ timezone }} 计算；服务器时区不同时，实际时间会有偏移。
        </view>
      </ot-panel>
    </template>

    <ot-panel title="语法速查">
      <view v-for="[k, v] in SYNTAX" :key="k" class="ot-cron__syntax">
        <text class="ot-mono w-6 shrink-0 text-center text-15px text-main font-600">{{ k }}</text>
        <text class="flex-1 text-13px text-sub leading-20px">{{ v }}</text>
      </view>
      <view class="mt-3 text-12px text-muted leading-20px">
        Linux crontab 中，「日」和「周」都指定时满足其一即执行；Spring / Quartz 需同时满足。也支持 @daily、@hourly、@weekly、@monthly、@yearly。
      </view>
    </ot-panel>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-cron__input {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 14px;
  border-radius: 12px;
  background: var(--ot-fill);
  color: var(--ot-text);
  border: 1px solid transparent;

  &:focus-within {
    border-color: var(--wot-color-theme);
  }
}

.ot-cron__chip {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--ot-text-2);
  border: 1px solid var(--ot-border);
  cursor: pointer;

  &:hover {
    color: var(--wot-color-theme);
    border-color: var(--wot-color-theme);
  }
}

.ot-cron__error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  color: #dc2626;
  background: rgba(239, 68, 68, 0.08);
}

.ot-cron__desc {
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(79, 110, 247, 0.06);
  border: 1px solid rgba(79, 110, 247, 0.2);
}

.ot-cron__fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.ot-cron__field {
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--ot-fill);
  min-width: 0;
  word-break: break-all;
}

.ot-cron__run {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--ot-border);

  &:last-of-type {
    border-bottom: none;
  }
}

.ot-cron__syntax {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px 0;
}
</style>
