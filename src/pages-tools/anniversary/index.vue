<script lang="ts" setup>
import type { IAnniversary, IAnniversaryForm } from '@/api/anniversary'
import type { AnnivRule } from './calc'
import type { FestivalPreset } from './presets'
import dayjs from 'dayjs'
import { deleteAnniversary, deleteBackground, listAnniversaries, updateAnniversary, uploadBackground } from '@/api/anniversary'
import { absoluteApiUrl } from '@/api/files'
import { toast } from '@/utils/common'
import { userKey } from '@/utils/user-storage'
import { diffDays, today as localToday, weekday } from '../datecalc/date'
import { upcomingHolidays } from '../datecalc/lunar'
import { birthInfo, describeDate, lunarText, milestones, upcomingOccurrences } from './calc'
import AnnivEditor from './components/anniv-editor.vue'
import AnnivPoster from './components/anniv-poster.vue'
import AnnivShare from './components/anniv-share.vue'
import { pickBackground } from './image'
import { compareDisplay, countdownParts, displayOf, nthLabel } from './display'
import { CATEGORIES, categoryOf, FESTIVALS, gradientOf } from './presets'

definePage({
  style: { navigationBarTitleText: '纪念日' },
})

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const items = ref<IAnniversary[]>([])
const loading = ref(true)
const today = ref(localToday())
const detail = ref<IAnniversary | null>(null)
const posterOpen = ref(false)

async function load() {
  try {
    items.value = await listAnniversaries()
  }
  catch {}
  finally {
    loading.value = false
  }
}

function ruleOf(a: IAnniversary): AnnivRule {
  return { date: a.date, repeat: a.repeat, countFromOne: a.countFromOne, leapRule: a.leapRule, feb29Rule: a.feb29Rule }
}

const displays = computed(() => new Map(items.value.map(a => [a.id, displayOf(ruleOf(a), a.category === 'birthday', today.value)])))
function d(a: IAnniversary) {
  return displays.value.get(a.id)!
}

/* ---------------- 筛选与排序 ---------------- */

const category = ref<string>(readPref('ot-anniv-category', 'all'))
watch(category, v => writePref('ot-anniv-category', v))

function readPref<T>(key: string, fallback: T): T {
  try {
    const v = uni.getStorageSync(userKey(key))
    return v === '' || v === undefined || v === null ? fallback : v as T
  }
  catch {
    return fallback
  }
}
function writePref(key: string, value: unknown) {
  try {
    uni.setStorageSync(userKey(key), value)
  }
  catch {}
}

const usedCategories = computed(() => CATEGORIES.filter(c => items.value.some(a => a.category === c.value)))
const filtered = computed(() => items.value
  .filter(a => category.value === 'all' || a.category === category.value)
  .slice()
  .sort((a, b) => compareDisplay(d(a), d(b))))

/** 顶部大卡片：置顶的第一个 */
const hero = computed(() => items.value.find(a => a.pinned))

/** 卡片背景：有背景图时叠一层暗色，保证白字看得清 */
function bgOf(a: IAnniversary) {
  return a.background
    ? `linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.45)), url(${absoluteApiUrl(a.background)}) center / cover no-repeat`
    : gradientOf(a.color).css
}

/* ---------------- 时间线 ---------------- */

type Layout = 'cards' | 'timeline'
const layout = ref<Layout>(readPref<Layout>('ot-anniv-layout', 'cards'))
watch(layout, v => writePref('ot-anniv-layout', v))
const LAYOUTS = [
  { value: 'cards', label: '卡片' },
  { value: 'timeline', label: '时间线' },
]

/** 时间线：有起始日期的按起始日期从早到晚，按年份分组；没有年份的（节日）不在时间线里 */
const timeline = computed(() => {
  const list = filtered.value
    .map(a => ({ a, origin: d(a).summary.origin }))
    .filter((x): x is { a: IAnniversary, origin: string } => !!x.origin)
    .sort((x, y) => x.origin.localeCompare(y.origin))
  const groups: { year: string, items: typeof list }[] = []
  for (const x of list) {
    const year = x.origin.slice(0, 4)
    const g = groups[groups.length - 1]
    if (g?.year === year)
      g.items.push(x)
    else
      groups.push({ year, items: [x] })
  }
  return groups
})
const noOrigin = computed(() => filtered.value.filter(a => !d(a).summary.origin).length)

/** 下一个法定节假日 */
const holiday = computed(() => upcomingHolidays(today.value, 1)[0])

/* ---------------- 新建、编辑 ---------------- */

const editorOpen = ref(false)
const editing = ref<IAnniversary | null>(null)
const preset = ref<IAnniversaryForm | null>(null)

function openEditor(item: IAnniversary | null, p: IAnniversaryForm | null = null) {
  editing.value = item
  preset.value = p
  editorOpen.value = true
}

function onSaved(item: IAnniversary) {
  const i = items.value.findIndex(a => a.id === item.id)
  if (i >= 0)
    items.value[i] = item
  else
    items.value.push(item)
  if (detail.value?.id === item.id)
    detail.value = item
}

/* ---------------- 节日库 ---------------- */

const festivalOpen = ref(false)
function festivalAdded(f: FestivalPreset) {
  return items.value.some(a => a.title === f.title && a.date.calendar === f.date.calendar && a.date.month === f.date.month)
}
function addFestival(f: FestivalPreset) {
  festivalOpen.value = false
  openEditor(null, { title: f.title, emoji: f.emoji, category: 'festival', color: f.color, date: f.date, repeat: true, remindDays: [0] })
}

/* ---------------- 详情 ---------------- */

const detailOpen = computed({
  get: () => !!detail.value,
  set: (v) => {
    if (!v)
      detail.value = null
  },
})

const nowMs = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined
watch(detailOpen, (v) => {
  clearInterval(ticker)
  posterOpen.value = false
  if (v)
    ticker = setInterval(() => (nowMs.value = Date.now()), 1000)
})

const detailInfo = computed(() => {
  const a = detail.value
  if (!a)
    return null
  const dp = d(a)
  const rule = ruleOf(a)
  const s = dp.summary
  // 精确倒计时：到下一次的 00:00（或设置的时间）
  const target = s.nextDate ? new Date(`${s.nextDate}T${a.time || '00:00'}:00`).getTime() : 0
  const precise = s.nextDate && target > nowMs.value ? countdownParts(target, nowMs.value) : null
  const upcoming = a.repeat ? upcomingOccurrences(rule, today.value, 5) : []
  const ms = s.origin && s.origin <= today.value ? milestones(s.origin, today.value, a.countFromOne, 2, 4) : []
  const birth = a.category === 'birthday' && s.origin ? birthInfo(s.origin) : null
  // 现在的年龄：今天过生日就是 nth，否则是下一次的岁数减 1
  const age = a.category === 'birthday' && s.nth !== null ? (s.kind === 'today' ? s.nth : s.nth - 1) : null
  return { dp, s, precise, upcoming, ms, birth, age }
})

function occurrenceLabel(a: IAnniversary, cycle: number) {
  return a.date.year ? nthLabel(cycle - a.date.year, a.category === 'birthday') : ''
}

/** 公历日期附带农历，农历日期附带公历 */
function altDate(a: IAnniversary, date: string) {
  return a.date.calendar === 'lunar' ? date : `农历${lunarText(date)}`
}

async function togglePin(a: IAnniversary) {
  onSaved(await updateAnniversary(a.id, { pinned: !a.pinned }))
}

function remove(a: IAnniversary) {
  uni.showModal({
    title: '删除纪念日',
    content: `删除「${a.title}」？删除后无法恢复。`,
    confirmColor: '#ef4444',
    success: async ({ confirm }) => {
      if (!confirm)
        return
      await deleteAnniversary(a.id)
      items.value = items.value.filter(x => x.id !== a.id)
      detail.value = null
      toast('已删除', 'success')
    },
  })
}

/* ---------------- 分享链接、背景图 ---------------- */

const shareOpen = ref(false)
function onShareChanged(meta: { id: number, shareCode: string | null, shareLocked: boolean, shareExpiresAt: number }) {
  const a = items.value.find(x => x.id === meta.id)
  if (a)
    Object.assign(a, { shareCode: meta.shareCode, shareLocked: meta.shareLocked, shareExpiresAt: meta.shareExpiresAt })
}

const uploading = ref(false)
async function changeBackground(a: IAnniversary) {
  try {
    const img = await pickBackground()
    uploading.value = true
    const { background } = await uploadBackground(a.id, img.data, img.type)
    const item = items.value.find(x => x.id === a.id)
    if (item)
      Object.assign(item, { background, hasBackground: true })
    if (detail.value?.id === a.id)
      detail.value = item ?? detail.value
    toast('背景图已更新', 'success')
  }
  catch (e: any) {
    if (e?.message)
      toast(e.message)
  }
  finally {
    uploading.value = false
  }
}

function removeBackground(a: IAnniversary) {
  uni.showModal({
    title: '移除背景图',
    content: '移除后恢复为渐变色背景。',
    success: async ({ confirm }) => {
      if (!confirm)
        return
      await deleteBackground(a.id)
      const item = items.value.find(x => x.id === a.id)
      if (item)
        Object.assign(item, { background: null, hasBackground: false })
    },
  })
}

/* ---------------- 分享图 ---------------- */

const poster = ref<InstanceType<typeof AnnivPoster>>()
const posterLines = computed(() => {
  const info = detailInfo.value
  const a = detail.value
  if (!info || !a)
    return []
  const lines = [describeDate(a.date)]
  if (info.dp.nthText)
    lines.push(`下一次是 ${info.dp.nthText}`)
  if (info.s.totalDays && info.s.kind !== 'countup')
    lines.push(`已经 ${info.s.totalDays} 天`)
  return lines
})

onLoad(() => load())
onShow(() => {
  today.value = localToday()
})
onHide(() => clearInterval(ticker))
onUnload(() => clearInterval(ticker))
</script>

<template>
  <ot-tool-layout :max-width="1100">
    <!-- 置顶大卡片 -->
    <view v-if="hero" class="ot-av__hero" :style="{ background: bgOf(hero) }" @click="detail = hero">
      <view class="min-w-0 flex-1">
        <view class="flex items-center gap-2">
          <text class="text-28px">{{ hero.emoji || categoryOf(hero.category).emoji }}</text>
          <text class="truncate text-18px font-600">{{ hero.title }}</text>
        </view>
        <text class="mt-2 block text-13px opacity-85">{{ d(hero).dateText }}{{ d(hero).nthText ? ` · ${d(hero).nthText}` : '' }}</text>
        <text v-if="d(hero).summary.totalDays && d(hero).summary.kind !== 'countup'" class="mt-1 block text-12px opacity-75">已经 {{ d(hero).summary.totalDays }} 天</text>
      </view>
      <view class="text-right">
        <text class="block text-13px opacity-85">{{ d(hero).label }}</text>
        <text class="ot-av__hero-num">{{ d(hero).number || d(hero).unit }}</text>
        <text v-if="d(hero).number" class="text-14px opacity-85">{{ d(hero).unit }}</text>
      </view>
    </view>

    <!-- 下一个法定节假日 -->
    <view v-if="holiday" class="ot-av__holiday">
      <view class="i-carbon-calendar-heat-map text-18px text-[#f59e0b]" />
      <text class="min-w-0 flex-1">
        下一个假期 <text class="font-600">{{ holiday.name }}</text>
        <text class="text-muted"> · {{ holiday.start.slice(5) }} 起放假 {{ holiday.days }} 天</text>
      </text>
      <text class="text-14px text-[#f59e0b] font-600">{{ holiday.inDays > 0 ? `还有 ${holiday.inDays} 天` : '放假中' }}</text>
    </view>

    <ot-panel>
      <view class="flex flex-wrap items-center gap-2">
        <ot-hscroll class="min-w-0 flex-1 whitespace-nowrap">
          <view class="ot-av__chip" :class="{ 'is-active': category === 'all' }" @click="category = 'all'">
            全部 {{ items.length }}
          </view>
          <view v-for="c in usedCategories" :key="c.value" class="ot-av__chip" :class="{ 'is-active': category === c.value }" @click="category = c.value">
            {{ c.emoji }} {{ c.label }}
          </view>
        </ot-hscroll>
        <ot-segmented v-model="layout" :options="LAYOUTS" size="small" />
        <wd-button size="small" type="info" plain @click="festivalOpen = true">
          节日库
        </wd-button>
        <wd-button size="small" icon="add" @click="openEditor(null)">
          新建
        </wd-button>
      </view>

      <view v-if="loading" class="py-12 text-center text-13px text-muted">
        加载中…
      </view>
      <view v-else-if="!filtered.length" class="ot-av__empty">
        <text class="text-40px">🎈</text>
        <text class="mt-2 text-13px text-muted">还没有纪念日。记下生日、在一起的日子、重要考试，或者从「节日库」添加</text>
      </view>
      <view v-else-if="layout === 'timeline'" class="ot-av__timeline">
        <view v-for="g in timeline" :key="g.year" class="ot-av__tl-year">
          <text class="ot-av__tl-yearnum">{{ g.year }}</text>
          <view v-for="x in g.items" :key="x.a.id" class="ot-av__tl-item" @click="detail = x.a">
            <view class="ot-av__tl-dot" :style="{ background: gradientOf(x.a.color).from }" />
            <text class="ot-av__tl-date">{{ x.origin.slice(5) }}</text>
            <text class="shrink-0">{{ x.a.emoji || categoryOf(x.a.category).emoji }}</text>
            <text class="min-w-0 flex-1 truncate text-main">{{ x.a.title }}</text>
            <text class="shrink-0 text-12px text-muted">{{ x.origin > today ? `还有 ${diffDays(today, x.origin)} 天` : `已经 ${d(x.a).summary.totalDays ?? 0} 天` }}</text>
          </view>
        </view>
        <text v-if="noOrigin" class="mt-2 block text-12px text-muted">另有 {{ noOrigin }} 个没有年份的纪念日（如节日）不在时间线中</text>
        <text v-if="!timeline.length" class="block py-8 text-center text-13px text-muted">没有设置了年份的纪念日</text>
      </view>
      <view v-else class="ot-av__grid">
        <view v-for="a in filtered" :key="a.id" class="ot-av__card" @click="detail = a">
          <view class="ot-av__badge" :style="{ background: gradientOf(a.color).css }">
            {{ a.emoji || categoryOf(a.category).emoji }}
          </view>
          <view class="min-w-0 flex-1">
            <view class="flex items-center gap-1">
              <view v-if="a.pinned" class="i-carbon-pin-filled shrink-0 text-12px text-amber-500" />
              <text class="truncate text-15px text-main font-600">{{ a.title }}</text>
            </view>
            <text class="mt-0.5 block truncate text-12px text-muted">{{ d(a).dateText }}{{ d(a).nthText ? ` · ${d(a).nthText}` : '' }}</text>
          </view>
          <view class="ot-av__days" :class="`is-${d(a).summary.kind}`">
            <text class="text-11px opacity-80">{{ d(a).label }}</text>
            <text class="ot-av__num">{{ d(a).number || d(a).unit }}</text>
            <text v-if="d(a).number" class="text-11px opacity-80">天</text>
          </view>
        </view>
      </view>
    </ot-panel>

    <view class="px-1 text-12px text-muted leading-20px">
      名称与备注在服务端加密保存。农历日期按国家天文数据换算（1901–2099 年），法定节假日按国务院每年公布的安排。
    </view>

    <!-- 详情 -->
    <wd-popup v-model="detailOpen" position="center" :z-index="1000" custom-style="border-radius: 18px; width: min(94vw, 440px); max-height: 90vh; overflow: hidden;">
      <scroll-view v-if="detail && detailInfo" scroll-y class="ot-av__detail">
        <view class="ot-av__detail-top" :style="{ background: bgOf(detail) }">
          <view class="ot-av__close" @click="detail = null">
            <view class="i-carbon-close" />
          </view>
          <text class="text-36px">{{ detail.emoji || categoryOf(detail.category).emoji }}</text>
          <text class="mt-1 text-18px font-600">{{ detail.title }}</text>
          <text class="mt-3 text-13px opacity-85">{{ detailInfo.dp.label }}</text>
          <text class="ot-av__big">{{ detailInfo.dp.number || detailInfo.dp.unit }}</text>
          <text v-if="detailInfo.dp.number" class="text-14px opacity-85">天</text>
          <view v-if="detailInfo.precise" class="ot-av__precise">
            {{ detailInfo.precise.days }} 天 {{ String(detailInfo.precise.hours).padStart(2, '0') }}:{{ String(detailInfo.precise.minutes).padStart(2, '0') }}:{{ String(detailInfo.precise.seconds).padStart(2, '0') }}
          </view>
        </view>

        <view class="ot-av__info">
          <view class="ot-av__line">
            <text class="ot-av__k">日期</text>
            <text>{{ describeDate(detail.date) }}{{ detail.time ? ` ${detail.time}` : '' }}</text>
          </view>
          <view v-if="detailInfo.s.nextDate" class="ot-av__line">
            <text class="ot-av__k">下一次</text>
            <text>{{ detailInfo.s.nextDate }} {{ WEEK[weekday(detailInfo.s.nextDate)] }} · {{ altDate(detail, detailInfo.s.nextDate) }}{{ detailInfo.dp.nthText ? ` · ${detailInfo.dp.nthText}` : '' }}</text>
          </view>
          <view v-if="detailInfo.s.totalDays" class="ot-av__line">
            <text class="ot-av__k">累计</text>
            <text>已经 {{ detailInfo.s.totalDays }} 天（{{ detail.countFromOne ? '起始那天算第 1 天' : '起始那天算第 0 天' }}）</text>
          </view>
          <view v-if="detailInfo.birth" class="ot-av__line">
            <text class="ot-av__k">生日</text>
            <text>{{ detailInfo.age !== null ? `${detailInfo.age} 岁 · ` : '' }}属{{ detailInfo.birth.zodiac }} · {{ detailInfo.birth.xingzuo }}</text>
          </view>
          <view v-if="detail.remindDays.length || detail.remindMilestone" class="ot-av__line">
            <text class="ot-av__k">提醒</text>
            <text>
              {{ detail.remindDays.map(n => n ? `提前 ${n} 天` : '当天').join('、') }}{{ detail.remindMilestone ? `${detail.remindDays.length ? '、' : ''}里程碑` : '' }}
              <text v-if="detail.nextRemindAt" class="text-muted"> · 下次 {{ dayjs(detail.nextRemindAt * 1000).format('YYYY-MM-DD HH:mm') }}</text>
            </text>
          </view>
          <view v-if="detail.note" class="ot-av__line">
            <text class="ot-av__k">备注</text>
            <text class="whitespace-pre-wrap">{{ detail.note }}</text>
          </view>
        </view>

        <view v-if="detailInfo.ms.length" class="ot-av__block">
          <text class="ot-av__block-title">里程碑</text>
          <view v-for="m in detailInfo.ms" :key="m.day" class="ot-av__ms" :class="{ 'is-past': m.inDays < 0 }">
            <text class="ot-av__ms-day">第 {{ m.day }} 天</text>
            <text class="flex-1">{{ m.date }} {{ WEEK[weekday(m.date)] }}</text>
            <text>{{ m.inDays < 0 ? '已过' : m.inDays === 0 ? '就是今天' : `还有 ${m.inDays} 天` }}</text>
          </view>
        </view>

        <view v-if="detailInfo.upcoming.length > 1" class="ot-av__block">
          <text class="ot-av__block-title">接下来几次</text>
          <view v-for="o in detailInfo.upcoming" :key="o.date" class="ot-av__ms">
            <text class="flex-1">{{ o.date }} {{ WEEK[weekday(o.date)] }}</text>
            <text class="text-muted">{{ altDate(detail, o.date) }}</text>
            <text v-if="occurrenceLabel(detail, o.cycle)" class="ml-2">{{ occurrenceLabel(detail, o.cycle) }}</text>
          </view>
        </view>

        <view v-if="posterOpen" class="ot-av__block">
          <anniv-poster
            ref="poster" :emoji="detail.emoji || categoryOf(detail.category).emoji" :title="detail.title"
            :label="detailInfo.dp.label" :number="detailInfo.dp.number" :unit="detailInfo.dp.unit" :lines="posterLines"
            :from="gradientOf(detail.color).from" :to="gradientOf(detail.color).to"
          />
          <view class="mt-3 text-center">
            <wd-button size="small" icon="download" @click="poster?.save()">
              保存图片
            </wd-button>
          </view>
        </view>

        <view class="ot-av__actions">
          <view class="ot-av__action" :class="{ 'is-on': detail.shareCode }" @click="shareOpen = true">
            <view :class="detail.shareCode && detail.shareLocked ? 'i-carbon-locked' : 'i-carbon-share'" />{{ detail.shareCode ? '已分享' : '分享' }}
          </view>
          <view class="ot-av__action" @click="posterOpen = !posterOpen">
            <view class="i-carbon-image" />{{ posterOpen ? '收起分享图' : '分享图' }}
          </view>
          <view class="ot-av__action" @click="changeBackground(detail)">
            <view :class="uploading ? 'i-carbon-renew animate-spin' : 'i-carbon-image-copy'" />{{ detail.background ? '换背景' : '背景图' }}
          </view>
          <view v-if="detail.background" class="ot-av__action" @click="removeBackground(detail)">
            <view class="i-carbon-close-outline" />移除背景
          </view>
          <view class="ot-av__action" @click="togglePin(detail)">
            <view :class="detail.pinned ? 'i-carbon-pin-filled' : 'i-carbon-pin'" />{{ detail.pinned ? '取消置顶' : '置顶' }}
          </view>
          <view class="ot-av__action" @click="openEditor(detail)">
            <view class="i-carbon-edit" />编辑
          </view>
          <view class="ot-av__action is-danger" @click="remove(detail)">
            <view class="i-carbon-trash-can" />删除
          </view>
        </view>
      </scroll-view>
    </wd-popup>

    <!-- 节日库 -->
    <wd-popup v-model="festivalOpen" position="center" :z-index="1000" custom-style="border-radius: 16px; width: min(94vw, 460px); max-height: 85vh; overflow: hidden;">
      <scroll-view scroll-y class="ot-av__fest">
        <view class="flex items-center gap-2">
          <text class="flex-1 text-16px text-main font-600">节日库</text>
          <view class="i-carbon-close cursor-pointer text-18px text-muted" @click="festivalOpen = false" />
        </view>
        <view v-for="g in FESTIVALS" :key="g.group" class="mt-4">
          <text class="ot-av__block-title">{{ g.group }}</text>
          <view class="ot-av__fest-grid">
            <view v-for="f in g.items" :key="f.title" class="ot-av__fest-item" :class="{ 'is-added': festivalAdded(f) }" @click="!festivalAdded(f) && addFestival(f)">
              <text class="text-20px">{{ f.emoji }}</text>
              <text class="text-13px text-main">{{ f.title }}</text>
              <text class="text-11px text-muted">{{ festivalAdded(f) ? '已添加' : describeDate(f.date).replace('每年 ', '') }}</text>
            </view>
          </view>
        </view>
        <text class="mt-4 block text-12px text-muted">添加后可以修改提醒、颜色等设置；除夕按农历腊月最后一天计算。</text>
      </scroll-view>
    </wd-popup>

    <anniv-share v-if="detail" :id="detail.id" v-model="shareOpen" :title="detail.title" @changed="onShareChanged" />

    <anniv-editor v-model="editorOpen" :item="editing" :preset="preset" @saved="onSaved" />
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-av__hero {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 22px;
  border-radius: 18px;
  color: #fff;
  box-shadow: 0 10px 28px rgba(79, 110, 247, 0.25);
  cursor: pointer;
}

.ot-av__hero-num {
  font-size: 44px;
  font-weight: 700;
  line-height: 1.1;
  margin-right: 4px;
}

.ot-av__holiday {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 14px;
  font-size: 13px;
  color: var(--ot-text);
  background: var(--ot-card);
  border: 1px solid var(--ot-border);
}

.ot-av__chip {
  display: inline-flex;
  margin-right: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 13px;
  color: var(--ot-text-2);
  background: var(--ot-fill);
  cursor: pointer;

  &.is-active {
    color: #fff;
    background: var(--wot-color-theme);
  }
}

.ot-av__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 16px;
  text-align: center;
}

.ot-av__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.ot-av__card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--ot-border);
  cursor: pointer;
  transition: box-shadow 0.15s;

  &:hover {
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.06);
  }
}

.ot-av__badge {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  font-size: 22px;
}

.ot-av__days {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  align-items: center;
  min-width: 58px;
  color: var(--wot-color-theme);

  &.is-countup {
    color: #f97316;
  }

  &.is-today {
    color: #ef4444;
  }
}

.ot-av__num {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.15;
}

.ot-av__detail {
  max-height: 90vh;
  background: var(--ot-card);
}

.ot-av__detail-top {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 26px 16px 22px;
  color: #fff;
  text-align: center;
}

.ot-av__close {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 16px;
  background: rgba(255, 255, 255, 0.2);
  cursor: pointer;
}

.ot-av__big {
  font-size: 60px;
  font-weight: 700;
  line-height: 1.1;
}

.ot-av__precise {
  margin-top: 8px;
  padding: 4px 12px;
  border-radius: 999px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 14px;
  background: rgba(255, 255, 255, 0.18);
}

.ot-av__info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  font-size: 13px;
  color: var(--ot-text);
}

.ot-av__line {
  display: flex;
  gap: 10px;
  line-height: 1.6;
}

.ot-av__k {
  flex-shrink: 0;
  width: 42px;
  color: var(--ot-text-3);
}

.ot-av__block {
  margin: 0 16px 14px;
  padding-top: 12px;
  border-top: 1px solid var(--ot-border);
}

.ot-av__block-title {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ot-text-3);
}

.ot-av__ms {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  font-size: 13px;
  color: var(--ot-text);

  &.is-past {
    color: var(--ot-text-3);
  }
}

.ot-av__ms-day {
  flex-shrink: 0;
  min-width: 76px;
  font-weight: 600;
}

.ot-av__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-around;
  gap: 8px;
  padding: 12px 16px calc(14px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--ot-border);
}

.ot-av__action {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--ot-text-2);
  cursor: pointer;

  &:hover {
    color: var(--wot-color-theme);
  }

  &.is-danger:hover {
    color: #ef4444;
  }

  &.is-on {
    color: var(--wot-color-theme);
  }
}

.ot-av__timeline {
  margin-top: 14px;
  padding-left: 6px;
}

.ot-av__tl-year {
  position: relative;
  padding-left: 18px;
  border-left: 2px solid var(--ot-border);
  padding-bottom: 12px;
}

.ot-av__tl-yearnum {
  display: block;
  margin: 0 0 6px -18px;
  padding-left: 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--ot-text-2);
}

.ot-av__tl-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 8px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
  }
}

.ot-av__tl-dot {
  position: absolute;
  left: -24px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  box-shadow: 0 0 0 3px var(--ot-card);
}

.ot-av__tl-date {
  flex-shrink: 0;
  width: 42px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--ot-text-3);
}

.ot-av__fest {
  box-sizing: border-box;
  max-height: 85vh;
  padding: 18px;
  background: var(--ot-card);
}

.ot-av__fest-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
}

.ot-av__fest-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 4px;
  border-radius: 12px;
  background: var(--ot-fill);
  cursor: pointer;

  &.is-added {
    opacity: 0.5;
    cursor: default;
  }
}
</style>
