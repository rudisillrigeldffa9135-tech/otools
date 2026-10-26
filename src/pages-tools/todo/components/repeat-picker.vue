<script lang="ts" setup>
// 重复规则设置弹窗：不重复 / 每天 / 每个工作日 / 每周（选星期）/ 每月（几号或最后一天）/ 每年，可设间隔与结束日期
import type { RepeatFreq, RepeatRule } from '../repeat'
import { describeRule, WEEKDAY_NAMES } from '../repeat'

const props = defineProps<{
  modelValue: RepeatRule | null
  /** 截止日期，用于默认的星期几、几号 */
  dueDate: string | null
}>()

const emit = defineEmits<{ 'update:modelValue': [rule: RepeatRule | null] }>()

const open = defineModel<boolean>('open', { required: true })

type Freq = 'none' | RepeatFreq
const FREQS: { value: Freq, label: string }[] = [
  { value: 'none', label: '不重复' },
  { value: 'day', label: '每天' },
  { value: 'workday', label: '工作日' },
  { value: 'week', label: '每周' },
  { value: 'month', label: '每月' },
  { value: 'year', label: '每年' },
]
const UNIT: Record<string, string> = { day: '天', week: '周', month: '个月', year: '年' }

const freq = ref<Freq>('none')
const interval = ref(1)
const weekdays = ref<number[]>([])
/** 'same' 与截止日期同一天，'last' 最后一天，或 1~31 */
const monthMode = ref<'same' | 'last' | 'day'>('same')
const monthDay = ref(1)
const until = ref('')

function dueWeekday() {
  return props.dueDate ? new Date(`${props.dueDate}T00:00:00Z`).getUTCDay() : new Date().getDay()
}

watch(open, (v) => {
  if (!v)
    return
  const r = props.modelValue
  freq.value = r?.freq ?? 'none'
  interval.value = r?.interval ?? 1
  weekdays.value = r?.weekdays?.length ? [...r.weekdays] : [dueWeekday()]
  monthMode.value = r?.monthDay === -1 ? 'last' : r?.monthDay ? 'day' : 'same'
  monthDay.value = r?.monthDay && r.monthDay > 0 ? r.monthDay : Number(props.dueDate?.slice(8) || 1)
  until.value = r?.until ?? ''
})

const rule = computed<RepeatRule | null>(() => {
  if (freq.value === 'none')
    return null
  const r: RepeatRule = { freq: freq.value }
  if (freq.value !== 'workday')
    r.interval = Math.min(Math.max(Math.floor(interval.value) || 1, 1), 365)
  if (freq.value === 'week')
    r.weekdays = [...weekdays.value].sort()
  if (freq.value === 'month' && monthMode.value !== 'same')
    r.monthDay = monthMode.value === 'last' ? -1 : monthDay.value
  if (until.value)
    r.until = until.value
  return r
})

function toggleWeekday(d: number) {
  const set = new Set(weekdays.value)
  if (set.has(d)) {
    if (set.size > 1)
      set.delete(d)
  }
  else {
    set.add(d)
  }
  weekdays.value = [...set]
}

function confirm() {
  emit('update:modelValue', rule.value)
  open.value = false
}

const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => `${i + 1} 日`)
</script>

<template>
  <wd-popup v-model="open" position="center" :z-index="1100" custom-style="border-radius: 16px; width: min(92vw, 400px);">
    <view class="ot-rp">
      <view class="flex items-center gap-2">
        <view class="i-carbon-repeat text-18px text-[var(--wot-color-theme)]" />
        <text class="flex-1 text-16px text-main font-600">重复</text>
        <view class="i-carbon-close cursor-pointer text-18px text-muted" @click="open = false" />
      </view>

      <view class="ot-rp__freqs">
        <view v-for="f in FREQS" :key="f.value" class="ot-rp__chip" :class="{ 'is-active': freq === f.value }" @click="freq = f.value">
          {{ f.label }}
        </view>
      </view>

      <template v-if="freq !== 'none'">
        <view v-if="freq === 'workday'" class="ot-rp__hint">
          按国务院公布的放假与调休安排，节假日跳过、调休上班的周末会提醒
        </view>
        <view v-else class="ot-rp__row">
          <text class="ot-rp__label">间隔</text>
          <text>每</text>
          <view class="ot-rp__num">
            <input v-model.number="interval" type="number" class="w-full text-center" :maxlength="3">
          </view>
          <text>{{ UNIT[freq] }}</text>
        </view>

        <view v-if="freq === 'week'" class="ot-rp__row">
          <text class="ot-rp__label">星期</text>
          <view class="flex flex-wrap gap-1.5">
            <view
              v-for="d in [1, 2, 3, 4, 5, 6, 0]" :key="d" class="ot-rp__day" :class="{ 'is-active': weekdays.includes(d) }"
              @click="toggleWeekday(d)"
            >
              {{ WEEKDAY_NAMES[d] }}
            </view>
          </view>
        </view>

        <view v-if="freq === 'month'" class="ot-rp__row">
          <text class="ot-rp__label">日期</text>
          <view class="flex flex-wrap items-center gap-1.5">
            <view class="ot-rp__chip is-small" :class="{ 'is-active': monthMode === 'same' }" @click="monthMode = 'same'">
              与截止日期相同
            </view>
            <view class="ot-rp__chip is-small" :class="{ 'is-active': monthMode === 'last' }" @click="monthMode = 'last'">
              最后一天
            </view>
            <picker :range="MONTH_DAYS" :value="monthDay - 1" @change="monthDay = Number($event.detail.value) + 1; monthMode = 'day'">
              <view class="ot-rp__chip is-small" :class="{ 'is-active': monthMode === 'day' }">
                {{ monthMode === 'day' ? `${monthDay} 日` : '指定几号' }}
              </view>
            </picker>
          </view>
        </view>

        <view class="ot-rp__row">
          <text class="ot-rp__label">结束</text>
          <picker mode="date" :value="until || dueDate || ''" @change="until = $event.detail.value">
            <view class="ot-rp__chip is-small">
              {{ until || '一直重复' }}
            </view>
          </picker>
          <text v-if="until" class="cursor-pointer text-12px text-muted" @click="until = ''">清除</text>
        </view>
      </template>

      <view class="ot-rp__preview">
        {{ describeRule(rule) }}
      </view>

      <view class="mt-4 flex gap-2">
        <wd-button plain block type="info" custom-class="flex-1" @click="open = false">
          取消
        </wd-button>
        <wd-button block custom-class="flex-1" @click="confirm">
          确定
        </wd-button>
      </view>
    </view>
  </wd-popup>
</template>

<style lang="scss" scoped>
.ot-rp {
  padding: 18px;
  font-size: 13px;
  color: var(--ot-text-2);
}

.ot-rp__freqs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 14px;
}

.ot-rp__chip {
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 13px;
  color: var(--ot-text-2);
  background: var(--ot-fill);
  cursor: pointer;

  &.is-small {
    padding: 3px 10px;
    font-size: 12px;
  }

  &.is-active {
    color: #fff;
    background: var(--wot-color-theme);
  }
}

.ot-rp__row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}

.ot-rp__label {
  flex-shrink: 0;
  width: 36px;
  color: var(--ot-text-3);
}

.ot-rp__num {
  width: 56px;
  height: 28px;
  display: flex;
  align-items: center;
  border-radius: 8px;
  background: var(--ot-fill);
  color: var(--ot-text);
}

.ot-rp__day {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--ot-fill);
  cursor: pointer;

  &.is-active {
    color: #fff;
    background: var(--wot-color-theme);
  }
}

.ot-rp__hint {
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ot-text-3);
}

.ot-rp__preview {
  margin-top: 16px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--wot-color-theme);
  background: rgba(79, 110, 247, 0.08);
}
</style>
