<script lang="ts" setup>
// 纪念日分享的只读页面：免登录查看实时的倒数 / 累计天数；设了密码时先输入访问密码
import type { ISharedAnniversary } from '@/api/anniversary'
import { getSharedAnniversary } from '@/api/anniversary'
import { absoluteApiUrl } from '@/api/files'
import { today as localToday, weekday } from '../datecalc/date'
import { describeDate } from './calc'
import { countdownParts, displayOf } from './display'
import { categoryOf, gradientOf } from './presets'

definePage({
  style: { navigationBarTitleText: '分享的纪念日' },
})

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const item = ref<ISharedAnniversary>()
const loading = ref(true)
const error = ref('')
const needPassword = ref(false)
const password = ref('')
const passwordError = ref('')
const checking = ref(false)
const nowMs = ref(Date.now())
const today = ref(localToday())
let code = ''
let ticker: ReturnType<typeof setInterval> | undefined

function rememberKey() {
  return `ot-anniv-share-pwd:${code}`
}
function readRemembered() {
  // #ifdef H5
  try {
    return sessionStorage.getItem(rememberKey()) || ''
  }
  catch {}
  // #endif
  return ''
}
function remember(value: string) {
  // #ifdef H5
  try {
    if (value)
      sessionStorage.setItem(rememberKey(), value)
    else
      sessionStorage.removeItem(rememberKey())
  }
  catch {}
  // #endif
}

const display = computed(() => {
  const a = item.value
  if (!a)
    return null
  return displayOf({ date: a.date, repeat: a.repeat, countFromOne: a.countFromOne, leapRule: a.leapRule, feb29Rule: a.feb29Rule }, a.category === 'birthday', today.value)
})

const precise = computed(() => {
  const s = display.value?.summary
  if (!s?.nextDate)
    return null
  const target = new Date(`${s.nextDate}T${item.value?.time || '00:00'}:00`).getTime()
  return target > nowMs.value ? countdownParts(target, nowMs.value) : null
})

const bg = computed(() => {
  const a = item.value
  if (!a)
    return ''
  return a.background
    ? `linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.45)), url(${absoluteApiUrl(a.background)}) center / cover no-repeat`
    : gradientOf(a.color).css
})

async function load(pwd = '') {
  try {
    item.value = await getSharedAnniversary(code, pwd)
    needPassword.value = false
    remember(pwd)
    const title = `${item.value.emoji || ''} ${item.value.title}`.trim()
    uni.setNavigationBarTitle({ title })
    // #ifdef H5
    document.title = `${title} - OTools`
    // #endif
    clearInterval(ticker)
    ticker = setInterval(() => {
      nowMs.value = Date.now()
      today.value = localToday()
    }, 1000)
  }
  catch (e: any) {
    if (e?.statusCode === 403) {
      needPassword.value = true
      remember('')
      passwordError.value = pwd ? (e?.message || '访问密码错误') : ''
    }
    else {
      needPassword.value = false
      error.value = e?.message || '加载失败'
    }
  }
}

async function submitPassword() {
  if (!password.value) {
    passwordError.value = '请输入访问密码'
    return
  }
  checking.value = true
  await load(password.value)
  checking.value = false
}

onLoad(async (query) => {
  code = String(query?.c || '')
  if (!code) {
    loading.value = false
    error.value = '链接不完整，缺少分享码'
    return
  }
  await load(readRemembered())
  loading.value = false
})
onUnload(() => clearInterval(ticker))
</script>

<template>
  <view class="ot-container pb-10 pt-4 md:pt-8" style="max-width: 560px">
    <view v-if="loading" class="py-16 text-center text-13px text-muted">
      加载中…
    </view>
    <view v-else-if="error" class="ot-ash__empty">
      <view class="i-carbon-favorite text-44px text-muted" />
      <text class="mt-3 text-15px text-main">{{ error }}</text>
      <text class="mt-1 text-12px text-muted">请向分享者确认链接是否正确，或请对方重新分享</text>
    </view>
    <view v-else-if="needPassword" class="ot-ash__empty">
      <view class="i-carbon-locked text-40px text-muted" />
      <text class="mt-3 text-15px text-main">这条分享需要访问密码</text>
      <view class="ot-ash__pwd">
        <input v-model="password" class="ot-mono min-w-0 flex-1 text-15px" password placeholder="输入访问密码" :maxlength="32" confirm-type="done" @confirm="submitPassword">
        <wd-button size="small" :loading="checking" @click="submitPassword">
          查看
        </wd-button>
      </view>
      <text v-if="passwordError" class="mt-2 text-13px text-red-500">{{ passwordError }}</text>
      <text v-else class="mt-2 text-12px text-muted">密码请向分享者索取</text>
    </view>
    <view v-else-if="item && display" class="ot-ash" :style="{ background: bg }">
      <text class="text-48px">{{ item.emoji || categoryOf(item.category).emoji }}</text>
      <text class="mt-2 text-22px font-700">{{ item.title }}</text>
      <text class="mt-1 text-13px opacity-85">{{ describeDate(item.date) }}{{ item.time ? ` ${item.time}` : '' }}</text>
      <text class="mt-6 text-15px opacity-90">{{ display.label }}</text>
      <text class="ot-ash__big">{{ display.number || display.unit }}</text>
      <text v-if="display.number" class="text-16px opacity-90">天</text>
      <view v-if="precise" class="ot-ash__precise">
        {{ precise.days }} 天 {{ String(precise.hours).padStart(2, '0') }}:{{ String(precise.minutes).padStart(2, '0') }}:{{ String(precise.seconds).padStart(2, '0') }}
      </view>
      <view class="ot-ash__info">
        <text v-if="display.summary.nextDate">下一次：{{ display.summary.nextDate }} {{ WEEK[weekday(display.summary.nextDate)] }}{{ display.nthText ? ` · ${display.nthText}` : '' }}</text>
        <text v-if="display.summary.totalDays && display.summary.kind !== 'countup'">已经 {{ display.summary.totalDays }} 天</text>
      </view>
    </view>
    <view class="mt-6 text-center text-12px text-muted">
      由 OTools · 纪念日分享，只读
    </view>
  </view>
</template>

<style lang="scss" scoped>
.ot-ash {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px 32px;
  border-radius: 22px;
  color: #fff;
  text-align: center;
  box-shadow: 0 16px 40px rgba(79, 110, 247, 0.25);
}

.ot-ash__big {
  font-size: 80px;
  font-weight: 800;
  line-height: 1.05;
}

.ot-ash__precise {
  margin-top: 12px;
  padding: 6px 16px;
  border-radius: 999px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 16px;
  background: rgba(255, 255, 255, 0.2);
}

.ot-ash__info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 20px;
  font-size: 13px;
  opacity: 0.9;
}

.ot-ash__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 16px;
  text-align: center;
}

.ot-ash__pwd {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  width: min(100%, 320px);
  margin-top: 16px;
  padding: 6px 6px 6px 14px;
  border-radius: 12px;
  background: var(--ot-card);
  border: 1px solid var(--ot-border);
  color: var(--ot-text);
}
</style>
