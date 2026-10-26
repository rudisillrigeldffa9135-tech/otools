<script lang="ts" setup>
// 新建 / 编辑纪念日
import type { AnnivCategory, IAnniversary, IAnniversaryForm } from '@/api/anniversary'
import type { AnnivDate, CalendarType } from '../calc'
import { createAnniversary, updateAnniversary } from '@/api/anniversary'
import { toast } from '@/utils/common'
import { today as localToday } from '../../datecalc/date'
import { LUNAR_DAYS, lunarMonths } from '../../datecalc/lunar'
import { describeDate, LUNAR_MAX_YEAR, LUNAR_MIN_YEAR, summarize } from '../calc'
import { ANNIV_COLORS, CATEGORIES, categoryOf, EMOJIS, REMIND_DAY_OPTIONS } from '../presets'

const props = defineProps<{
  /** 为空表示新建 */
  item?: IAnniversary | null
  /** 新建时的初始值（如从节日库添加） */
  preset?: IAnniversaryForm | null
}>()

const emit = defineEmits<{ saved: [item: IAnniversary] }>()

const open = defineModel<boolean>({ required: true })

const today = localToday()
const thisYear = Number(today.slice(0, 4))

const title = ref('')
const emoji = ref('')
const category = ref<AnnivCategory>('other')
const color = ref('')
const calendar = ref<CalendarType>('solar')
const hasYear = ref(true)
const year = ref(thisYear)
const month = ref(1)
const day = ref(1)
const leap = ref(false)
const nth = ref(1)
const weekday = ref(0)
const repeat = ref(true)
const countFromOne = ref(true)
const leapRule = ref<'normal' | 'leapOnly'>('normal')
const feb29Rule = ref<'feb28' | 'mar1'>('feb28')
const time = ref('')
const pinned = ref(false)
const remindDays = ref<number[]>([])
const remindMilestone = ref(false)
const note = ref('')
const emojiOpen = ref(false)
const saving = ref(false)

watch(open, (v) => {
  if (!v)
    return
  const src: IAnniversaryForm = props.item ?? props.preset ?? {}
  const d: AnnivDate = src.date ?? { calendar: 'solar', year: thisYear, month: Number(today.slice(5, 7)), day: Number(today.slice(8)) }
  title.value = src.title ?? ''
  emoji.value = src.emoji ?? ''
  category.value = src.category ?? 'other'
  color.value = src.color ?? ''
  calendar.value = d.calendar
  hasYear.value = d.year !== null
  year.value = d.year ?? thisYear
  month.value = d.month
  day.value = d.day
  leap.value = !!d.leap
  nth.value = d.nth ?? 1
  weekday.value = d.weekday ?? 0
  repeat.value = src.repeat ?? true
  countFromOne.value = src.countFromOne ?? true
  leapRule.value = src.leapRule ?? 'normal'
  feb29Rule.value = src.feb29Rule ?? 'feb28'
  time.value = src.time ?? ''
  pinned.value = src.pinned ?? false
  remindDays.value = [...(src.remindDays ?? [])]
  remindMilestone.value = src.remindMilestone ?? false
  note.value = src.note ?? ''
  emojiOpen.value = false
})

/* ---------------- 日期选择 ---------------- */

const CAL_OPTIONS = [
  { value: 'solar', label: '公历' },
  { value: 'lunar', label: '农历' },
  { value: 'weekday', label: '按星期' },
]

const solarDate = computed({
  get: () => `${year.value}-${String(month.value).padStart(2, '0')}-${String(day.value).padStart(2, '0')}`,
  set: (v: string) => {
    const [y, m, d] = v.split('-').map(Number)
    year.value = y
    month.value = m
    day.value = d
  },
})

const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1} 月`)
const SOLAR_DAYS = computed(() => Array.from({ length: [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month.value - 1] }, (_, i) => `${i + 1} 日`))

const LUNAR_YEARS = Array.from({ length: LUNAR_MAX_YEAR - LUNAR_MIN_YEAR + 1 }, (_, i) => LUNAR_MIN_YEAR + i)
const lunarYearOptions = computed(() => ['不设年份', ...LUNAR_YEARS.map(y => `${y} 年`)])
const lunarYearIndex = computed(() => hasYear.value ? year.value - LUNAR_MIN_YEAR + 1 : 0)
/** 有年份时列出该年的月份（含闰月），没有年份时只列 12 个月 */
const lunarMonthOptions = computed(() => {
  if (hasYear.value && year.value >= LUNAR_MIN_YEAR && year.value <= LUNAR_MAX_YEAR)
    return lunarMonths(year.value).map(m => ({ month: Math.abs(m.value), leap: m.value < 0, label: m.label, days: m.days }))
  return ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'].map((n, i) => ({ month: i + 1, leap: false, label: `${n}月`, days: 30 }))
})
const lunarMonthIndex = computed(() => Math.max(0, lunarMonthOptions.value.findIndex(m => m.month === month.value && m.leap === leap.value)))
const lunarDayOptions = computed(() => LUNAR_DAYS.slice(0, lunarMonthOptions.value[lunarMonthIndex.value]?.days ?? 30))

function setLunarYear(i: number) {
  if (i === 0) {
    hasYear.value = false
    leap.value = false
    return
  }
  hasYear.value = true
  year.value = LUNAR_MIN_YEAR + i - 1
  // 新的一年没有这个闰月时改为正常月份
  if (leap.value && !lunarMonthOptions.value.some(m => m.month === month.value && m.leap))
    leap.value = false
}
function setLunarMonth(i: number) {
  const m = lunarMonthOptions.value[i]
  month.value = m.month
  leap.value = m.leap
  day.value = Math.min(day.value, m.days)
}

const NTH_OPTIONS = [{ v: 1, l: '第 1 个' }, { v: 2, l: '第 2 个' }, { v: 3, l: '第 3 个' }, { v: 4, l: '第 4 个' }, { v: -1, l: '最后一个' }]
const WEEK_OPTIONS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const WEEKDAY_YEARS = Array.from({ length: 201 }, (_, i) => `${1900 + i} 年`)

const date = computed<AnnivDate>(() => {
  const y = hasYear.value ? year.value : null
  if (calendar.value === 'weekday')
    return { calendar: 'weekday', year: y, month: month.value, day: 1, nth: nth.value, weekday: weekday.value }
  if (calendar.value === 'lunar')
    return { calendar: 'lunar', year: y, month: month.value, day: Math.min(day.value, 30), leap: leap.value }
  return { calendar: 'solar', year: y, month: month.value, day: day.value }
})

watch(calendar, (c) => {
  if (c === 'lunar' && (year.value < LUNAR_MIN_YEAR || year.value > LUNAR_MAX_YEAR))
    year.value = thisYear
  if (c !== 'lunar')
    leap.value = false
  day.value = Math.min(day.value, c === 'lunar' ? 30 : 31)
})

const isFeb29 = computed(() => calendar.value === 'solar' && month.value === 2 && day.value === 29)

/** 预览：保存后会怎么显示 */
const preview = computed(() => {
  try {
    const s = summarize({ date: date.value, repeat: repeat.value || !hasYear.value, countFromOne: countFromOne.value, leapRule: leapRule.value, feb29Rule: feb29Rule.value }, today)
    if (s.kind === 'today')
      return '就是今天'
    if (s.kind === 'countdown')
      return `还有 ${s.days} 天（${s.nextDate}）${s.nth ? ` · 第 ${s.nth} ${category.value === 'birthday' ? '岁' : '周年'}` : ''}`
    return `已经 ${s.days} 天`
  }
  catch {
    return ''
  }
})

function toggleRemind(v: number) {
  const set = new Set(remindDays.value)
  if (set.has(v))
    set.delete(v)
  else
    set.add(v)
  remindDays.value = [...set].sort((a, b) => a - b)
}

function pickCategory(v: AnnivCategory) {
  // 没选过表情时，跟着分类换默认表情
  if (!emoji.value || CATEGORIES.some(c => c.emoji === emoji.value))
    emoji.value = categoryOf(v).emoji
  category.value = v
}

async function save() {
  if (!title.value.trim())
    return toast('请填写名称')
  if (calendar.value === 'solar' && hasYear.value && solarDate.value > '2100-12-31')
    return toast('日期不正确')
  const form: IAnniversaryForm = {
    title: title.value.trim(),
    emoji: emoji.value || categoryOf(category.value).emoji,
    category: category.value,
    color: color.value,
    date: date.value,
    repeat: repeat.value || !hasYear.value,
    countFromOne: countFromOne.value,
    leapRule: leapRule.value,
    feb29Rule: feb29Rule.value,
    time: time.value || null,
    pinned: pinned.value,
    remindDays: remindDays.value,
    remindMilestone: remindMilestone.value && hasYear.value,
    note: note.value,
  }
  saving.value = true
  try {
    const saved = props.item ? await updateAnniversary(props.item.id, form) : await createAnniversary(form)
    emit('saved', saved)
    open.value = false
  }
  catch {}
  finally {
    saving.value = false
  }
}
</script>

<template>
  <wd-popup v-model="open" position="center" :z-index="1100" custom-style="border-radius: 16px; width: min(94vw, 460px); max-height: 90vh; overflow: hidden;">
    <scroll-view scroll-y class="ot-ae">
      <view class="flex items-center gap-2">
        <text class="flex-1 text-16px text-main font-600">{{ item ? '编辑纪念日' : '新建纪念日' }}</text>
        <view class="i-carbon-close cursor-pointer text-18px text-muted" @click="open = false" />
      </view>

      <!-- 表情与名称 -->
      <view class="mt-4 flex items-center gap-2">
        <view class="ot-ae__emoji" @click="emojiOpen = !emojiOpen">
          {{ emoji || categoryOf(category).emoji }}
        </view>
        <view class="ot-ae__input flex-1">
          <input v-model="title" class="min-w-0 flex-1 text-15px" placeholder="名称，如：妈妈生日、在一起、考研" :maxlength="50">
        </view>
      </view>
      <view v-if="emojiOpen" class="ot-ae__emojis">
        <text v-for="e in EMOJIS" :key="e" class="ot-ae__emoji-item" @click="emoji = e; emojiOpen = false">{{ e }}</text>
      </view>

      <!-- 分类 -->
      <view class="ot-ae__chips mt-3">
        <view v-for="c in CATEGORIES" :key="c.value" class="ot-ae__chip" :class="{ 'is-active': category === c.value }" @click="pickCategory(c.value)">
          {{ c.emoji }} {{ c.label }}
        </view>
      </view>

      <!-- 日期 -->
      <view class="ot-ae__section">
        <view class="ot-ae__row">
          <text class="ot-ae__label">日期</text>
          <ot-segmented v-model="calendar" :options="CAL_OPTIONS" size="small" />
        </view>

        <view v-if="calendar === 'solar'" class="ot-ae__row">
          <text class="ot-ae__label" />
          <picker v-if="hasYear" mode="date" :value="solarDate" start="1900-01-01" end="2100-12-31" @change="solarDate = $event.detail.value">
            <view class="ot-ae__pick">
              {{ solarDate }}
            </view>
          </picker>
          <template v-else>
            <picker :range="MONTHS" :value="month - 1" @change="month = Number($event.detail.value) + 1; day = Math.min(day, SOLAR_DAYS.length)">
              <view class="ot-ae__pick">
                {{ month }} 月
              </view>
            </picker>
            <picker :range="SOLAR_DAYS" :value="day - 1" @change="day = Number($event.detail.value) + 1">
              <view class="ot-ae__pick">
                {{ day }} 日
              </view>
            </picker>
          </template>
          <view class="flex-1" />
          <text class="ot-ae__toggle" @click="hasYear = !hasYear">{{ hasYear ? '不设年份' : '设置年份' }}</text>
        </view>

        <view v-else-if="calendar === 'lunar'" class="ot-ae__row is-wrap">
          <text class="ot-ae__label" />
          <picker :range="lunarYearOptions" :value="lunarYearIndex" @change="setLunarYear(Number($event.detail.value))">
            <view class="ot-ae__pick">
              {{ hasYear ? `${year} 年` : '不设年份' }}
            </view>
          </picker>
          <picker :range="lunarMonthOptions" range-key="label" :value="lunarMonthIndex" @change="setLunarMonth(Number($event.detail.value))">
            <view class="ot-ae__pick">
              {{ lunarMonthOptions[lunarMonthIndex]?.label }}
            </view>
          </picker>
          <picker :range="lunarDayOptions" :value="Math.min(day, lunarDayOptions.length) - 1" @change="day = Number($event.detail.value) + 1">
            <view class="ot-ae__pick">
              {{ lunarDayOptions[Math.min(day, lunarDayOptions.length) - 1] }}
            </view>
          </picker>
        </view>

        <view v-else class="ot-ae__row is-wrap">
          <text class="ot-ae__label" />
          <picker :range="MONTHS" :value="month - 1" @change="month = Number($event.detail.value) + 1">
            <view class="ot-ae__pick">
              {{ month }} 月
            </view>
          </picker>
          <picker :range="NTH_OPTIONS" range-key="l" :value="NTH_OPTIONS.findIndex(o => o.v === nth)" @change="nth = NTH_OPTIONS[Number($event.detail.value)].v">
            <view class="ot-ae__pick">
              {{ NTH_OPTIONS.find(o => o.v === nth)?.l }}
            </view>
          </picker>
          <picker :range="WEEK_OPTIONS" :value="weekday" @change="weekday = Number($event.detail.value)">
            <view class="ot-ae__pick">
              {{ WEEK_OPTIONS[weekday] }}
            </view>
          </picker>
          <text class="ot-ae__toggle" @click="hasYear = !hasYear">{{ hasYear ? '不设年份' : '设置年份' }}</text>
          <picker v-if="hasYear" :range="WEEKDAY_YEARS" :value="year - 1900" @change="year = 1900 + Number($event.detail.value)">
            <view class="ot-ae__pick">
              {{ year }} 年
            </view>
          </picker>
        </view>

        <text class="ot-ae__desc">{{ describeDate(date) }}<template v-if="preview"> · {{ preview }}</template></text>

        <view class="ot-ae__row">
          <text class="ot-ae__label">重复</text>
          <wd-switch v-model="repeat" size="20px" :disabled="!hasYear" />
          <text class="text-12px text-muted">{{ !hasYear ? '没有年份时每年重复' : repeat ? '每年重复（生日、纪念日）' : '只算一次（考试、出发、戒烟第 N 天）' }}</text>
        </view>
        <view v-if="hasYear" class="ot-ae__row">
          <text class="ot-ae__label">累计</text>
          <wd-switch v-model="countFromOne" size="20px" />
          <text class="text-12px text-muted">{{ countFromOne ? '起始那天算第 1 天' : '起始那天算第 0 天' }}</text>
        </view>
        <view v-if="calendar === 'lunar' && leap && hasYear" class="ot-ae__row">
          <text class="ot-ae__label">闰月</text>
          <ot-segmented v-model="leapRule" :options="[{ value: 'normal', label: '每年按正常月份过' }, { value: 'leapOnly', label: '只在有闰月的年份过' }]" size="small" />
        </view>
        <view v-if="isFeb29 && (repeat || !hasYear)" class="ot-ae__row">
          <text class="ot-ae__label">平年</text>
          <ot-segmented v-model="feb29Rule" :options="[{ value: 'feb28', label: '2 月 28 日过' }, { value: 'mar1', label: '3 月 1 日过' }]" size="small" />
        </view>
        <view class="ot-ae__row">
          <text class="ot-ae__label">时间</text>
          <picker mode="time" :value="time || '09:00'" @change="time = $event.detail.value">
            <view class="ot-ae__pick" :class="{ 'is-empty': !time }">
              {{ time || '不设' }}
            </view>
          </picker>
          <text v-if="time" class="ot-ae__toggle" @click="time = ''">清除</text>
          <text class="text-12px text-muted">用于精确倒计时和提醒时刻</text>
        </view>
      </view>

      <!-- 提醒 -->
      <view class="ot-ae__section">
        <view class="ot-ae__row is-wrap">
          <text class="ot-ae__label">提醒</text>
          <view v-for="o in REMIND_DAY_OPTIONS" :key="o.value" class="ot-ae__chip is-small" :class="{ 'is-active': remindDays.includes(o.value) }" @click="toggleRemind(o.value)">
            {{ o.label }}
          </view>
        </view>
        <view v-if="hasYear" class="ot-ae__row">
          <text class="ot-ae__label" />
          <wd-switch v-model="remindMilestone" size="20px" />
          <text class="text-12px text-muted">第 100 / 520 / 1000 天等里程碑当天提醒</text>
        </view>
        <text class="ot-ae__desc">提醒时刻为{{ time || ' 9:00' }}，通过网站通知、日历订阅、浏览器推送送达（在「我的」里设置）</text>
      </view>

      <!-- 外观 -->
      <view class="ot-ae__section">
        <view class="ot-ae__row is-wrap">
          <text class="ot-ae__label">颜色</text>
          <view
            v-for="c in ANNIV_COLORS" :key="c.value" class="ot-ae__color" :class="{ 'is-active': color === c.value }"
            :style="{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }" @click="color = c.value"
          />
        </view>
        <view class="ot-ae__row">
          <text class="ot-ae__label">置顶</text>
          <wd-switch v-model="pinned" size="20px" />
          <text class="text-12px text-muted">在顶部大卡片显示</text>
        </view>
      </view>

      <textarea v-model="note" class="ot-ae__note" placeholder="备注（可选）" :maxlength="1000" auto-height />

      <view class="mt-4 flex gap-2 pb-1">
        <wd-button plain block type="info" custom-class="flex-1" @click="open = false">
          取消
        </wd-button>
        <wd-button block custom-class="flex-1" :loading="saving" @click="save">
          保存
        </wd-button>
      </view>
    </scroll-view>
  </wd-popup>
</template>

<style lang="scss" scoped>
.ot-ae {
  box-sizing: border-box;
  max-height: 90vh;
  padding: 18px;
  font-size: 13px;
  color: var(--ot-text-2);
}

.ot-ae__emoji {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  font-size: 22px;
  background: var(--ot-fill);
  cursor: pointer;
}

.ot-ae__input {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  color: var(--ot-text);
  background: var(--ot-fill);
}

.ot-ae__emojis {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
  padding: 8px;
  border-radius: 10px;
  background: var(--ot-fill);
}

.ot-ae__emoji-item {
  width: 32px;
  font-size: 20px;
  line-height: 32px;
  text-align: center;
  cursor: pointer;
}

.ot-ae__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ot-ae__chip {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--ot-text-2);
  background: var(--ot-fill);
  cursor: pointer;

  &.is-small {
    padding: 3px 9px;
  }

  &.is-active {
    color: #fff;
    background: var(--wot-color-theme);
  }
}

.ot-ae__section {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--ot-border);
}

.ot-ae__row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;

  &.is-wrap {
    flex-wrap: wrap;
    row-gap: 6px;
  }
}

.ot-ae__label {
  flex-shrink: 0;
  width: 32px;
  color: var(--ot-text-3);
}

.ot-ae__pick {
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--ot-text);
  background: var(--ot-fill);

  &.is-empty {
    color: var(--ot-text-3);
  }
}

.ot-ae__toggle {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--wot-color-theme);
  cursor: pointer;
}

.ot-ae__desc {
  display: block;
  margin-top: 8px;
  padding-left: 40px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ot-text-3);
}

.ot-ae__color {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  cursor: pointer;

  &.is-active {
    box-shadow:
      0 0 0 2px var(--ot-card),
      0 0 0 4px var(--wot-color-theme);
  }
}

.ot-ae__note {
  box-sizing: border-box;
  width: 100%;
  min-height: 60px;
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: var(--ot-text);
  background: var(--ot-fill);
}
</style>
