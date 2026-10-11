<script lang="ts" setup>
import { copyText } from '@/utils/common'
import { addDays, addMonths, addWorkdays, countWorkdays, dayOfYear, daysInMonth, diffDays, isLeapYear, isoWeek, today as todayOf, weekday, WEEKDAYS, ymdDiff } from './date'
import { chinaWorkdayRule, dayInfo, hasHolidayData, holidayOf, LUNAR_DAYS, lunarMonths, lunarToSolar, MAX_YEAR, MIN_YEAR, nextJieQi, shortLabel, upcomingHolidays } from './lunar'

definePage({
  style: { navigationBarTitleText: '日期计算' },
})

const MIN_DATE = `${MIN_YEAR}-01-01`
const MAX_DATE = `${MAX_YEAR}-12-31`

const today = ref(todayOf())
onShow(() => (today.value = todayOf()))

type Tab = 'calendar' | 'diff' | 'add' | 'lunar'
const tab = ref<Tab>('calendar')
const TABS = [
  { value: 'calendar', label: '万年历' },
  { value: 'diff', label: '日期间隔' },
  { value: 'add', label: '日期推算' },
  { value: 'lunar', label: '农历转公历' },
]

/** 「今天」概览 */
const overview = computed(() => {
  const t = today.value
  const y = Number(t.slice(0, 4))
  const info = dayInfo(t)
  const jq = nextJieQi(t)
  return {
    info,
    week: isoWeek(t).week,
    dayOfYear: dayOfYear(t),
    left: (isLeapYear(y) ? 366 : 365) - dayOfYear(t),
    jieqi: { ...jq, inDays: diffDays(t, jq.date) },
    holidays: upcomingHolidays(t, 3),
    nextYearMissing: !hasHolidayData(y + 1),
  }
})

function inDaysText(n: number) {
  return n === 0 ? '今天' : n > 0 ? `${n} 天后` : `${-n} 天前`
}

/* ---------------- 万年历 ---------------- */

const selected = ref(today.value)
const viewYear = ref(Number(today.value.slice(0, 4)))
const viewMonth = ref(Number(today.value.slice(5, 7)))

const pad = (n: number) => String(n).padStart(2, '0')

/** 周一开头的月历，前后补齐到整周 */
const cells = computed(() => {
  const y = viewYear.value
  const m = viewMonth.value
  const first = `${y}-${pad(m)}-01`
  const lead = (weekday(first) + 6) % 7
  const total = Math.ceil((lead + daysInMonth(y, m)) / 7) * 7
  return Array.from({ length: total }, (_, i) => {
    const date = addDays(first, i - lead)
    const w = weekday(date)
    const h = holidayOf(date)
    return {
      date,
      day: Number(date.slice(8)),
      label: shortLabel(date),
      inMonth: Number(date.slice(5, 7)) === m,
      // 法定假日标「休」，调休上班标「班」
      badge: h ? (h.work ? '班' : '休') : '',
      isWeekend: w === 0 || w === 6,
    }
  })
})

function shiftMonth(n: number) {
  const next = addMonths(`${viewYear.value}-${pad(viewMonth.value)}-01`, n)
  const y = Number(next.slice(0, 4))
  if (y < MIN_YEAR || y > MAX_YEAR)
    return
  viewYear.value = y
  viewMonth.value = Number(next.slice(5, 7))
}

function goDate(date: string) {
  selected.value = date
  viewYear.value = Number(date.slice(0, 4))
  viewMonth.value = Number(date.slice(5, 7))
}

const selectedInfo = computed(() => dayInfo(selected.value))

/* ---------------- 日期间隔 ---------------- */

const diffStart = ref(today.value)
const diffEnd = ref(addDays(today.value, 100))
const includeEnd = ref(false)

const diffResult = computed(() => {
  const days = diffDays(diffStart.value, diffEnd.value)
  const span = Math.abs(days) + (includeEnd.value ? 1 : 0)
  const ymd = ymdDiff(diffStart.value, includeEnd.value ? addDays(diffEnd.value, days >= 0 ? 1 : -1) : diffEnd.value)
  const [from, to] = days >= 0 ? [diffStart.value, diffEnd.value] : [diffEnd.value, diffStart.value]
  // 不含结束日时，工作日统计到结束日前一天
  const lastDay = includeEnd.value ? to : addDays(to, -1)
  const work = span ? countWorkdays(from, lastDay, chinaWorkdayRule) : 0
  const workWeekend = span ? countWorkdays(from, lastDay) : 0
  const years = Array.from({ length: Number(to.slice(0, 4)) - Number(from.slice(0, 4)) + 1 }, (_, i) => Number(from.slice(0, 4)) + i)
  return {
    days,
    span,
    weeks: Math.floor(span / 7),
    weekRest: span % 7,
    ymd,
    work,
    workWeekend,
    missing: years.filter(y => !hasHolidayData(y)),
  }
})

function ymdText(r: { years: number, months: number, days: number }) {
  return [r.years ? `${r.years} 年` : '', r.months ? `${r.months} 个月` : '', r.days || (!r.years && !r.months) ? `${r.days} 天` : ''].filter(Boolean).join(' ')
}

/* ---------------- 日期推算 ---------------- */

const addBase = ref(today.value)
const addSign = ref<1 | -1>(1)
const addAmount = ref('30')
const addUnit = ref<'day' | 'week' | 'month' | 'year' | 'workday'>('day')
const ADD_UNITS = [
  { value: 'day', label: '天' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
  { value: 'workday', label: '工作日' },
]

const addResult = computed<{ date?: string, error?: string }>(() => {
  const n = Number(addAmount.value)
  if (!Number.isInteger(n) || n < 0)
    return { error: '请输入非负整数' }
  const k = n * addSign.value
  let date: string
  switch (addUnit.value) {
    case 'week':
      date = addDays(addBase.value, k * 7)
      break
    case 'month':
      date = addMonths(addBase.value, k)
      break
    case 'year':
      date = addMonths(addBase.value, k * 12)
      break
    case 'workday':
      if (n > 5000)
        return { error: '工作日最多推算 5000 天' }
      date = addWorkdays(addBase.value, k, chinaWorkdayRule)
      break
    default:
      date = addDays(addBase.value, k)
  }
  const y = Number(date.slice(0, 4))
  if (y < MIN_YEAR || y > MAX_YEAR)
    return { error: `结果超出 ${MIN_YEAR}~${MAX_YEAR} 年范围` }
  return { date }
})

const QUICK_ADD = [7, 30, 90, 100, 180, 365]

/* ---------------- 农历转公历 ---------------- */

const YEARS = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MIN_YEAR + i)
const lunarYear = ref(Number(today.value.slice(0, 4)))
const lunarMonth = ref(1)
const lunarDay = ref(1)
const monthList = computed(() => lunarMonths(lunarYear.value))
const monthIndex = computed(() => Math.max(0, monthList.value.findIndex(m => m.value === lunarMonth.value)))
const dayCount = computed(() => monthList.value[monthIndex.value]?.days ?? 30)

watch(lunarYear, () => {
  // 换年后闰月可能不存在
  if (!monthList.value.some(m => m.value === lunarMonth.value))
    lunarMonth.value = Math.abs(lunarMonth.value)
})
watch(dayCount, (n) => {
  if (lunarDay.value > n)
    lunarDay.value = n
})

const lunarResult = computed(() => {
  try {
    const date = lunarToSolar(lunarYear.value, lunarMonth.value, lunarDay.value)
    return { date }
  }
  catch {
    return { error: '日期超出支持范围' }
  }
})

function fullDate(date: string) {
  return `${date} ${WEEKDAYS[weekday(date)]}`
}
</script>

<template>
  <ot-tool-layout>
    <ot-panel>
      <view class="flex flex-wrap items-end justify-between gap-2">
        <view>
          <text class="ot-mono text-22px text-main font-700">{{ today }}</text>
          <text class="ml-2 text-15px text-sub">{{ WEEKDAYS[weekday(today)] }}</text>
        </view>
        <text class="text-14px text-sub">
          农历{{ overview.info.lunarDate }} · {{ overview.info.ganzhiYear }}{{ overview.info.zodiac }}年
        </text>
      </view>
      <view class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-12px text-muted">
        <text>今年第 {{ overview.dayOfYear }} 天</text>
        <text>第 {{ overview.week }} 周</text>
        <text>今年还剩 {{ overview.left }} 天</text>
        <text>{{ overview.jieqi.name }}：{{ inDaysText(overview.jieqi.inDays) }}（{{ overview.jieqi.date.slice(5) }}）</text>
      </view>
      <view v-if="overview.holidays.length" class="ot-dc__holidays">
        <view v-for="h in overview.holidays" :key="h.name + h.date" class="ot-dc__holiday">
          <text class="text-13px text-main font-600">{{ h.name }}</text>
          <text class="text-12px" :class="h.inDays <= 0 ? 'text-emerald-600' : 'text-muted'">
            {{ h.inDays <= 0 ? '放假中' : `${h.inDays} 天后` }}
          </text>
          <text class="text-11px text-muted">{{ h.start.slice(5) }} 起休 {{ h.days }} 天</text>
        </view>
      </view>
      <view v-else-if="overview.nextYearMissing" class="mt-2 text-12px text-muted">
        明年的放假安排尚未公布。
      </view>
    </ot-panel>

    <view class="overflow-x-auto">
      <ot-segmented v-model="tab" :options="TABS" />
    </view>

    <!-- 万年历 -->
    <ot-panel v-if="tab === 'calendar'">
      <view class="mb-3 flex items-center justify-between">
        <view class="ot-dc__nav i-carbon-chevron-left" @click="shiftMonth(-1)" />
        <picker mode="date" fields="month" :value="`${viewYear}-${pad(viewMonth)}`" :start="MIN_DATE" :end="MAX_DATE" @change="goDate(`${$event.detail.value}-01`)">
          <view class="flex items-center gap-1 text-16px text-main font-600">
            {{ viewYear }} 年 {{ viewMonth }} 月
            <view class="i-carbon-chevron-down text-13px text-muted" />
          </view>
        </picker>
        <view class="flex items-center gap-2">
          <text class="cursor-pointer text-13px text-[var(--wot-color-theme)]" @click="goDate(today)">今天</text>
          <view class="ot-dc__nav i-carbon-chevron-right" @click="shiftMonth(1)" />
        </view>
      </view>
      <view class="ot-dc__grid">
        <text v-for="w in ['一', '二', '三', '四', '五', '六', '日']" :key="w" class="ot-dc__head" :class="{ 'is-weekend': w === '六' || w === '日' }">{{ w }}</text>
        <view
          v-for="c in cells" :key="c.date" class="ot-dc__cell"
          :class="{ 'is-out': !c.inMonth, 'is-today': c.date === today, 'is-selected': c.date === selected, 'is-weekend': c.isWeekend }"
          @click="selected = c.date"
        >
          <text v-if="c.badge" class="ot-dc__badge" :class="c.badge === '班' ? 'is-work' : ''">{{ c.badge }}</text>
          <text class="ot-dc__day">{{ c.day }}</text>
          <text class="ot-dc__lunar">{{ c.label }}</text>
        </view>
      </view>

      <view class="ot-dc__detail">
        <view class="flex flex-wrap items-baseline gap-2">
          <text class="ot-mono text-16px text-main font-600">{{ fullDate(selected) }}</text>
          <text v-if="selected !== today" class="text-12px text-muted">{{ inDaysText(diffDays(today, selected)) }}</text>
        </view>
        <text class="mt-1 block text-14px text-sub">
          {{ selectedInfo.lunarFull }} · {{ selectedInfo.ganzhiYear }}年 {{ selectedInfo.ganzhiMonth }}月 {{ selectedInfo.ganzhiDay }}日 · 属{{ selectedInfo.zodiac }}
        </text>
        <view class="mt-2 flex flex-wrap gap-1.5">
          <text v-if="selectedInfo.holiday" class="ot-dc__tag" :class="selectedInfo.holiday.work ? 'is-work' : 'is-off'">
            {{ selectedInfo.holiday.name }}{{ selectedInfo.holiday.work ? '调休上班' : '假期' }}
          </text>
          <text v-if="selectedInfo.jieqi" class="ot-dc__tag is-jq">{{ selectedInfo.jieqi }}</text>
          <text v-for="f in selectedInfo.festivals" :key="f" class="ot-dc__tag">{{ f }}</text>
          <text class="ot-dc__tag">{{ selectedInfo.xingzuo }}</text>
        </view>
        <view v-if="selectedInfo.yi.length" class="mt-2 text-12px leading-20px">
          <text class="mr-1 text-emerald-600 font-600">宜</text>
          <text class="text-sub">{{ selectedInfo.yi.slice(0, 10).join(' ') }}</text>
        </view>
        <view v-if="selectedInfo.ji.length" class="text-12px leading-20px">
          <text class="mr-1 text-red-500 font-600">忌</text>
          <text class="text-sub">{{ selectedInfo.ji.slice(0, 10).join(' ') }}</text>
        </view>
      </view>
    </ot-panel>

    <!-- 日期间隔 -->
    <ot-panel v-else-if="tab === 'diff'">
      <view class="ot-dc__pair">
        <picker mode="date" :value="diffStart" :start="MIN_DATE" :end="MAX_DATE" @change="diffStart = $event.detail.value">
          <view class="ot-dc__date">
            <text class="text-11px text-muted">开始日期</text>
            <text class="ot-mono text-16px text-main">{{ diffStart }}</text>
            <text class="text-11px text-muted">{{ WEEKDAYS[weekday(diffStart)] }}</text>
          </view>
        </picker>
        <view class="i-carbon-arrow-right shrink-0 text-16px text-muted" />
        <picker mode="date" :value="diffEnd" :start="MIN_DATE" :end="MAX_DATE" @change="diffEnd = $event.detail.value">
          <view class="ot-dc__date">
            <text class="text-11px text-muted">结束日期</text>
            <text class="ot-mono text-16px text-main">{{ diffEnd }}</text>
            <text class="text-11px text-muted">{{ WEEKDAYS[weekday(diffEnd)] }}</text>
          </view>
        </picker>
      </view>
      <view class="mt-3 flex items-center justify-between">
        <view class="flex items-center gap-2 text-13px text-sub">
          <wd-switch v-model="includeEnd" size="18px" />
          包含结束日（算头又算尾）
        </view>
        <text class="cursor-pointer text-13px text-[var(--wot-color-theme)]" @click="[diffStart, diffEnd] = [diffEnd, diffStart]">交换</text>
      </view>

      <view class="ot-dc__big">
        <text class="text-12px text-muted">{{ diffResult.days < 0 ? '结束日期早于开始日期，相差' : '相差' }}</text>
        <view>
          <text class="ot-mono text-32px text-main font-700">{{ diffResult.span }}</text>
          <text class="ml-1 text-15px text-sub">天</text>
        </view>
      </view>
      <ot-result label="周" :value="`${diffResult.weeks} 周${diffResult.weekRest ? ` ${diffResult.weekRest} 天` : ''}`" />
      <ot-result label="年月日" :value="ymdText(diffResult.ymd)" />
      <ot-result label="工作日" :value="`${diffResult.work} 天（按法定节假日与调休）`" />
      <ot-result label="周一至周五" :value="`${diffResult.workWeekend} 天（只排除周末）`" />
      <ot-result label="小时" :value="String(diffResult.span * 24)" />
      <ot-result label="分钟" :value="String(diffResult.span * 1440)" />
      <view v-if="diffResult.missing.length" class="mt-2 text-12px text-amber-600">
        {{ diffResult.missing.length > 3 ? `${diffResult.missing[0]}~${diffResult.missing[diffResult.missing.length - 1]}` : diffResult.missing.join('、') }} 年没有放假安排数据，按周末双休计算工作日。
      </view>
    </ot-panel>

    <!-- 日期推算 -->
    <ot-panel v-else-if="tab === 'add'">
      <picker mode="date" :value="addBase" :start="MIN_DATE" :end="MAX_DATE" @change="addBase = $event.detail.value">
        <view class="ot-dc__date is-row">
          <text class="text-13px text-muted">起始日期</text>
          <text class="ot-mono text-16px text-main">{{ fullDate(addBase) }}</text>
          <view class="i-carbon-chevron-down text-13px text-muted" />
        </view>
      </picker>
      <view class="mt-3 flex flex-wrap items-center gap-2">
        <ot-segmented :model-value="addSign" :options="[{ value: 1, label: '之后' }, { value: -1, label: '之前' }]" size="small" @update:model-value="addSign = $event as 1 | -1" />
        <view class="ot-dc__num">
          <input v-model="addAmount" class="ot-mono w-full text-center text-16px" type="number">
        </view>
        <ot-segmented v-model="addUnit" :options="ADD_UNITS" size="small" />
      </view>
      <view class="mt-2 flex flex-wrap gap-1.5">
        <view v-for="q in QUICK_ADD" :key="q" class="ot-dc__chip" @click="addAmount = String(q); addUnit = 'day'">
          {{ q }} 天
        </view>
      </view>
      <view v-if="addResult.error" class="mt-3 text-13px text-red-500">
        {{ addResult.error }}
      </view>
      <view v-else-if="addResult.date" class="ot-dc__big">
        <text class="text-12px text-muted">结果</text>
        <text class="ot-mono text-26px text-main font-700" user-select selectable>{{ addResult.date }}</text>
        <text class="mt-1 text-13px text-sub">
          {{ WEEKDAYS[weekday(addResult.date)] }} · 农历{{ dayInfo(addResult.date).lunarDate }}{{ addResult.date !== today ? ` · ${inDaysText(diffDays(today, addResult.date))}` : '' }}
        </text>
        <view class="mt-2 flex gap-2">
          <wd-button size="small" icon="copy" @click="copyText(addResult.date!)">
            复制
          </wd-button>
          <wd-button size="small" type="info" plain @click="goDate(addResult.date!); tab = 'calendar'">
            在日历中查看
          </wd-button>
        </view>
      </view>
      <view class="mt-3 text-12px text-muted leading-20px">
        按月 / 年推算时，目标月没有对应日期则取月末（如 1 月 31 日加 1 个月为 2 月 28 日或 29 日）。工作日不含起始日当天，并按法定节假日与调休计算。
      </view>
    </ot-panel>

    <!-- 农历转公历 -->
    <ot-panel v-else>
      <view class="grid grid-cols-3 gap-2">
        <picker :range="YEARS" :value="lunarYear - MIN_YEAR" @change="lunarYear = YEARS[$event.detail.value]">
          <view class="ot-dc__select">
            {{ lunarYear }} 年
            <view class="i-carbon-chevron-down text-12px text-muted" />
          </view>
        </picker>
        <picker :range="monthList" range-key="label" :value="monthIndex" @change="lunarMonth = monthList[$event.detail.value].value">
          <view class="ot-dc__select">
            {{ monthList[monthIndex]?.label }}
            <view class="i-carbon-chevron-down text-12px text-muted" />
          </view>
        </picker>
        <picker :range="LUNAR_DAYS.slice(0, dayCount)" :value="lunarDay - 1" @change="lunarDay = Number($event.detail.value) + 1">
          <view class="ot-dc__select">
            {{ LUNAR_DAYS[lunarDay - 1] }}
            <view class="i-carbon-chevron-down text-12px text-muted" />
          </view>
        </picker>
      </view>
      <view class="mt-2 text-12px text-muted">
        农历年按正月初一划分。{{ monthList.some(m => m.value < 0) ? `该年有${monthList.find(m => m.value < 0)?.label}。` : '' }}
      </view>
      <view v-if="lunarResult.date" class="ot-dc__big">
        <text class="text-12px text-muted">对应公历</text>
        <text class="ot-mono text-26px text-main font-700" user-select selectable>{{ lunarResult.date }}</text>
        <text class="mt-1 text-13px text-sub">
          {{ WEEKDAYS[weekday(lunarResult.date)] }}{{ lunarResult.date !== today ? ` · ${inDaysText(diffDays(today, lunarResult.date))}` : '' }}
        </text>
        <view class="mt-2 flex gap-2">
          <wd-button size="small" icon="copy" @click="copyText(lunarResult.date!)">
            复制
          </wd-button>
          <wd-button size="small" type="info" plain @click="goDate(lunarResult.date!); tab = 'calendar'">
            在日历中查看
          </wd-button>
        </view>
      </view>
      <view v-else class="mt-3 text-13px text-red-500">
        {{ lunarResult.error }}
      </view>
      <view class="mt-3 text-12px text-muted leading-20px">
        常用于计算农历生日：选择出生年的农历日期即可，再换成今年的年份查看今年的公历日期。
      </view>
    </ot-panel>

    <view class="px-1 text-12px text-muted leading-20px">
      农历、节气数据支持 {{ MIN_YEAR }}~{{ MAX_YEAR }} 年，全部离线计算。法定节假日按国务院每年公布的放假安排，目前已包含到 {{ hasHolidayData(Number(today.slice(0, 4)) + 1) ? Number(today.slice(0, 4)) + 1 : Number(today.slice(0, 4)) }} 年。宜忌仅供娱乐参考。
    </view>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-dc__holidays {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.ot-dc__holiday {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(249, 115, 22, 0.07);
}

.ot-dc__nav {
  padding: 6px;
  font-size: 18px;
  color: var(--ot-text-2);
  cursor: pointer;
  border-radius: 8px;

  &:hover {
    background: var(--ot-fill);
  }
}

.ot-dc__grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.ot-dc__head {
  padding: 4px 0;
  text-align: center;
  font-size: 12px;
  color: var(--ot-text-3);

  &.is-weekend {
    color: #f97316;
  }
}

.ot-dc__cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 52px;
  border-radius: 10px;
  border: 1px solid transparent;
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
  }

  &.is-weekend .ot-dc__day {
    color: #f97316;
  }

  &.is-out {
    opacity: 0.35;
  }

  &.is-today {
    background: rgba(79, 110, 247, 0.08);

    .ot-dc__day {
      color: var(--wot-color-theme);
      font-weight: 700;
    }
  }

  &.is-selected {
    border-color: var(--wot-color-theme);
  }
}

.ot-dc__day {
  font-size: 16px;
  color: var(--ot-text);
  line-height: 1.2;
}

.ot-dc__lunar {
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 10px;
  color: var(--ot-text-3);
}

.ot-dc__badge {
  position: absolute;
  top: 2px;
  right: 3px;
  font-size: 9px;
  line-height: 1;
  color: #059669;

  &.is-work {
    color: #dc2626;
  }
}

.ot-dc__detail {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--ot-fill);
}

.ot-dc__tag {
  padding: 1px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--ot-text-2);
  background: var(--ot-card);
  border: 1px solid var(--ot-border);

  &.is-off {
    color: #059669;
    border-color: rgba(16, 185, 129, 0.4);
  }

  &.is-work {
    color: #dc2626;
    border-color: rgba(239, 68, 68, 0.4);
  }

  &.is-jq {
    color: #0d9488;
    border-color: rgba(20, 184, 166, 0.4);
  }
}

.ot-dc__pair {
  display: flex;
  align-items: center;
  gap: 8px;

  > picker {
    flex: 1;
    min-width: 0;
  }
}

.ot-dc__date {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--ot-fill);
  cursor: pointer;

  &.is-row {
    flex-direction: row;
    align-items: center;
    gap: 10px;
  }
}

.ot-dc__big {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 14px 0 12px;
  padding: 14px;
  border-radius: 12px;
  background: rgba(249, 115, 22, 0.06);
  border: 1px solid rgba(249, 115, 22, 0.2);
  text-align: center;
}

.ot-dc__num {
  width: 72px;
  height: 32px;
  display: flex;
  align-items: center;
  border-radius: 8px;
  background: var(--ot-fill);
  color: var(--ot-text);
}

.ot-dc__chip {
  padding: 2px 10px;
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

.ot-dc__select {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 42px;
  border-radius: 10px;
  font-size: 15px;
  color: var(--ot-text);
  background: var(--ot-fill);
  cursor: pointer;
}

@media (max-width: 420px) {
  .ot-dc__holidays {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
