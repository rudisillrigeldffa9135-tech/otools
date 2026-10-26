<script lang="ts" setup>
// 番茄钟：专注 → 休息循环。状态按时间戳保存在本地，离开页面再回来也能接着计时；专注结束自动记录时长（用于统计）
import { addFocus } from '@/api/todo'
import { toast } from '@/utils/common'
import { userKey } from '@/utils/user-storage'

interface FocusState {
  mode: 'work' | 'break'
  todoId: number | null
  todoTitle: string
  /** 本轮开始时间（毫秒）；暂停时为 0 */
  startedAt: number
  /** 本轮总时长（秒） */
  duration: number
  /** 暂停时剩余的秒数 */
  pausedLeft: number | null
  workMinutes: number
  breakMinutes: number
  /** 今天完成的番茄数（本地） */
  rounds: number
}

const KEY = 'ot-todo-focus'
const PRESETS = [
  { work: 25, rest: 5, label: '25 / 5' },
  { work: 50, rest: 10, label: '50 / 10' },
  { work: 15, rest: 3, label: '15 / 3' },
]

const state = ref<FocusState | null>(null)
const now = ref(Date.now())
const expanded = ref(false)
let timer: ReturnType<typeof setInterval> | undefined

function save() {
  try {
    if (state.value)
      uni.setStorageSync(userKey(KEY), state.value)
    else
      uni.removeStorageSync(userKey(KEY))
  }
  catch {}
}

const left = computed(() => {
  const s = state.value
  if (!s)
    return 0
  if (s.pausedLeft !== null)
    return s.pausedLeft
  return Math.max(0, Math.round(s.duration - (now.value - s.startedAt) / 1000))
})
const progress = computed(() => state.value ? 1 - left.value / state.value.duration : 0)
const timeText = computed(() => `${String(Math.floor(left.value / 60)).padStart(2, '0')}:${String(left.value % 60).padStart(2, '0')}`)

function tick() {
  now.value = Date.now()
  if (state.value && state.value.pausedLeft === null && left.value <= 0)
    finishRound()
}

function startTimer() {
  clearInterval(timer)
  timer = setInterval(tick, 1000)
}

/** 开始专注（可关联一个待办） */
function start(todo?: { id: number, title: string } | null, preset = PRESETS[0]) {
  state.value = {
    mode: 'work',
    todoId: todo?.id ?? null,
    todoTitle: todo?.title ?? '',
    startedAt: Date.now(),
    duration: preset.work * 60,
    pausedLeft: null,
    workMinutes: preset.work,
    breakMinutes: preset.rest,
    rounds: state.value?.rounds ?? 0,
  }
  expanded.value = true
  now.value = Date.now()
  save()
  startTimer()
  // #ifdef H5
  if ('Notification' in window && Notification.permission === 'default')
    Notification.requestPermission().catch(() => {})
  // #endif
}

function remind(title: string, body: string) {
  toast(title)
  try {
    uni.vibrateLong({})
  }
  catch {}
  // #ifdef H5
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    try {
      // eslint-disable-next-line no-new
      new Notification(title, { body, icon: '/static/pwa/icon-192.png' })
    }
    catch {}
  }
  // #endif
}

async function finishRound() {
  const s = state.value
  if (!s)
    return
  if (s.mode === 'work') {
    addFocus(s.workMinutes, s.todoId ?? undefined).catch(() => {})
    remind('专注完成 🍅', `休息 ${s.breakMinutes} 分钟吧`)
    state.value = { ...s, mode: 'break', startedAt: Date.now(), duration: s.breakMinutes * 60, pausedLeft: null, rounds: s.rounds + 1 }
  }
  else {
    remind('休息结束', s.todoTitle ? `继续「${s.todoTitle}」` : '开始下一个番茄吧')
    state.value = { ...s, mode: 'work', startedAt: 0, duration: s.workMinutes * 60, pausedLeft: s.workMinutes * 60 }
  }
  save()
}

function pause() {
  const s = state.value
  if (!s)
    return
  if (s.pausedLeft === null) {
    state.value = { ...s, pausedLeft: left.value, startedAt: 0 }
  }
  else {
    // 继续：按剩余时间重新计算开始时间
    state.value = { ...s, startedAt: Date.now() - (s.duration - s.pausedLeft) * 1000, pausedLeft: null }
    startTimer()
  }
  save()
}

function stop() {
  const s = state.value
  if (!s)
    return
  const elapsedMin = Math.floor((s.duration - left.value) / 60)
  const close = () => {
    state.value = null
    expanded.value = false
    clearInterval(timer)
    save()
  }
  if (s.mode === 'work' && elapsedMin >= 1 && s.pausedLeft !== s.duration) {
    uni.showModal({
      title: '提前结束',
      content: `已经专注 ${elapsedMin} 分钟，记录到统计里吗？`,
      confirmText: '记录',
      cancelText: '不记录',
      success: ({ confirm }) => {
        if (confirm)
          addFocus(elapsedMin, s.todoId ?? undefined).catch(() => {})
        close()
      },
    })
  }
  else {
    close()
  }
}

function skipBreak() {
  const s = state.value
  if (s?.mode === 'break')
    start(s.todoId ? { id: s.todoId, title: s.todoTitle } : null, PRESETS.find(p => p.work === s.workMinutes) ?? PRESETS[0])
}

onMounted(() => {
  try {
    const saved = uni.getStorageSync(userKey(KEY)) as FocusState | ''
    if (saved && saved.mode) {
      state.value = saved
      // 离开期间已经到点：补记
      tick()
      startTimer()
    }
  }
  catch {}
})
onBeforeUnmount(() => clearInterval(timer))

defineExpose({ start, active: computed(() => !!state.value) })
</script>

<template>
  <view v-if="state" class="ot-tf" :class="{ 'is-expanded': expanded, 'is-break': state.mode === 'break' }">
    <view v-if="!expanded" class="ot-tf__mini" @click="expanded = true">
      <text>{{ state.mode === 'work' ? '🍅' : '☕' }}</text>
      <text class="ot-mono font-600">{{ timeText }}</text>
      <text v-if="state.pausedLeft !== null" class="text-11px opacity-80">已暂停</text>
    </view>
    <view v-else class="ot-tf__panel">
      <view class="flex items-center">
        <text class="flex-1 text-13px opacity-85">{{ state.mode === 'work' ? '专注中' : '休息中' }} · 今天第 {{ state.rounds + (state.mode === 'work' ? 1 : 0) }} 个</text>
        <view class="i-carbon-subtract cursor-pointer text-16px" title="收起" @click="expanded = false" />
      </view>
      <text v-if="state.todoTitle" class="mt-1 block truncate text-14px font-600">{{ state.todoTitle }}</text>
      <view class="ot-tf__ring" :style="{ background: `conic-gradient(#fff ${progress * 360}deg, rgba(255,255,255,0.25) 0)` }">
        <view class="ot-tf__ring-inner">
          <text class="ot-mono text-30px font-700">{{ timeText }}</text>
        </view>
      </view>
      <view class="flex justify-center gap-2">
        <view class="ot-tf__btn" @click="pause">
          {{ state.pausedLeft === null ? '暂停' : state.mode === 'work' && state.pausedLeft === state.duration ? '开始' : '继续' }}
        </view>
        <view v-if="state.mode === 'break'" class="ot-tf__btn" @click="skipBreak">
          跳过休息
        </view>
        <view class="ot-tf__btn is-ghost" @click="stop">
          结束
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.ot-tf {
  position: fixed;
  right: 20px;
  bottom: calc(80px + env(safe-area-inset-bottom));
  z-index: 950;
  color: #fff;
  border-radius: 16px;
  background: linear-gradient(135deg, #ef4444, #f97316);
  box-shadow: 0 10px 28px rgba(239, 68, 68, 0.35);

  &.is-break {
    background: linear-gradient(135deg, #14b8a6, #22c55e);
    box-shadow: 0 10px 28px rgba(20, 184, 166, 0.35);
  }
}

.ot-tf__mini {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  font-size: 15px;
  cursor: pointer;
}

.ot-tf__panel {
  width: 240px;
  padding: 14px 16px 16px;
}

.ot-tf__ring {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 150px;
  height: 150px;
  margin: 14px auto;
  border-radius: 50%;
}

.ot-tf__ring-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 136px;
  height: 136px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.12);
}

.ot-tf__btn {
  padding: 6px 16px;
  border-radius: 999px;
  font-size: 13px;
  color: #ef4444;
  background: #fff;
  cursor: pointer;

  .is-break & {
    color: #0d9488;
  }

  &.is-ghost {
    color: #fff;
    background: rgba(255, 255, 255, 0.2);
  }
}
</style>
