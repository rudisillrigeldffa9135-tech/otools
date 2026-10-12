<script lang="ts" setup>
import type { IVaultHealthItem } from '@/api/vault'
import { checkVaultBreach, getVaultHealth } from '@/api/vault'
import { LEVEL_LABEL } from './strength'

definePage({
  style: { navigationBarTitleText: '密码体检' },
})

/** 超过多少天没改密码算「长期未更换」 */
const OLD_DAYS = 365
const BREACH_BATCH = 40

const items = ref<IVaultHealthItem[]>([])
const loading = ref(false)
const loadError = ref('')
const checkedAt = ref(0)

/** 泄露检查：{ id: 出现次数 }；undefined 表示还没查 */
const breach = ref<Record<number, number>>({})
const breachProgress = ref(0)
const breachTotal = ref(0)
const breachError = ref('')
const breachRunning = ref(false)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await getVaultHealth()
    items.value = res.items
    checkedAt.value = res.checkedAt
  }
  catch (e: any) {
    loadError.value = e?.message || '加载失败'
  }
  finally {
    loading.value = false
  }
  runBreachCheck()
}

/** 分批检查，每批 40 条 */
async function runBreachCheck() {
  const ids = items.value.filter(i => !i.empty).map(i => i.id)
  breach.value = {}
  breachError.value = ''
  breachProgress.value = 0
  breachTotal.value = ids.length
  if (!ids.length)
    return
  breachRunning.value = true
  try {
    for (let i = 0; i < ids.length; i += BREACH_BATCH) {
      const res = await checkVaultBreach(ids.slice(i, i + BREACH_BATCH))
      breach.value = { ...breach.value, ...Object.fromEntries(Object.entries(res).map(([k, v]) => [Number(k), v])) }
      breachProgress.value = Math.min(ids.length, i + BREACH_BATCH)
    }
  }
  catch (e: any) {
    breachError.value = e?.message || '泄露检查失败'
  }
  finally {
    breachRunning.value = false
  }
}

// 从编辑页改完密码回来时重新体检
let shownOnce = false
onShow(() => {
  if (shownOnce)
    load()
  shownOnce = true
})
onLoad(load)

const breached = computed(() => items.value.filter(i => (breach.value[i.id] ?? 0) > 0).sort((a, b) => breach.value[b.id] - breach.value[a.id]))
const weak = computed(() => items.value.filter(i => !i.empty && i.level <= 1))
const reusedGroups = computed(() => {
  const map = new Map<number, IVaultHealthItem[]>()
  for (const i of items.value) {
    if (i.reuseGroup)
      map.set(i.reuseGroup, [...(map.get(i.reuseGroup) ?? []), i])
  }
  return [...map.values()].sort((a, b) => b.length - a.length)
})
const old = computed(() => items.value.filter(i => !i.empty && i.passwordAgeDays >= OLD_DAYS).sort((a, b) => b.passwordAgeDays - a.passwordAgeDays))
const empty = computed(() => items.value.filter(i => i.empty))
const noTotp = computed(() => items.value.filter(i => !i.hasTotp && !i.empty))

/** 有问题的条目（泄露、弱、重复、未设置密码；长期未换只算轻微问题） */
const score = computed(() => {
  const total = items.value.length
  if (!total)
    return 100
  let penalty = 0
  for (const i of items.value) {
    if ((breach.value[i.id] ?? 0) > 0 || i.empty)
      penalty += 1
    else if (i.level <= 1 || i.reuseGroup)
      penalty += 0.8
    else if (i.passwordAgeDays >= OLD_DAYS)
      penalty += 0.3
    else if (i.level === 2)
      penalty += 0.2
  }
  return Math.max(0, Math.round(100 * (1 - penalty / total)))
})

const scoreColor = computed(() => (score.value >= 85 ? '#10b981' : score.value >= 60 ? '#f59e0b' : '#ef4444'))
const scoreText = computed(() => (score.value >= 85 ? '状况良好' : score.value >= 60 ? '有待改进' : '风险较高'))

const levelCount = computed(() => {
  const counts = [0, 0, 0, 0, 0]
  for (const i of items.value) {
    if (!i.empty)
      counts[i.level]++
  }
  return counts
})

function title(i: IVaultHealthItem) {
  return [i.name, i.label].filter(Boolean).join(' · ')
}

function edit(i: IVaultHealthItem) {
  uni.navigateTo({ url: `/pages-tools/vault/index?edit=${i.id}` })
}

function formatCount(n: number) {
  return n >= 10000 ? `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)} 万` : String(n)
}

function ageText(days: number) {
  return days >= 365 ? `${(days / 365).toFixed(1)} 年` : `${days} 天`
}

const LEVEL_COLOR = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#059669']
</script>

<template>
  <ot-tool-layout>
    <view v-if="loading && !items.length" class="py-10 text-center text-13px text-muted">
      正在体检…
    </view>
    <view v-else-if="loadError" class="ot-vc__error">
      {{ loadError }}
    </view>
    <ot-panel v-else-if="!items.length">
      <view class="py-6 text-center text-13px text-muted">
        密码库还是空的，先在「密码管理」里添加账号
      </view>
    </ot-panel>

    <template v-else>
      <ot-panel>
        <view class="flex flex-wrap items-center gap-5">
          <view class="ot-vc__score" :style="{ borderColor: scoreColor, color: scoreColor }">
            <text class="text-34px font-700 leading-none">{{ score }}</text>
            <text class="mt-1 text-12px">{{ scoreText }}</text>
          </view>
          <view class="min-w-0 flex-1">
            <view class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-13px md:grid-cols-3">
              <text>共 {{ items.length }} 个账号</text>
              <text :class="breached.length ? 'text-red-500 font-600' : 'text-sub'">
                已泄露 {{ breachRunning ? `检查中 ${breachProgress}/${breachTotal}` : breached.length }}
              </text>
              <text :class="weak.length ? 'text-orange-500 font-600' : 'text-sub'">弱密码 {{ weak.length }}</text>
              <text :class="reusedGroups.length ? 'text-orange-500 font-600' : 'text-sub'">
                重复使用 {{ reusedGroups.reduce((s, g) => s + g.length, 0) }}
              </text>
              <text class="text-sub">超过 1 年未换 {{ old.length }}</text>
              <text class="text-sub">未开两步验证 {{ noTotp.length }}</text>
            </view>
            <view class="ot-vc__bar">
              <view
                v-for="(n, lv) in levelCount" :key="lv" class="ot-vc__bar-seg"
                :style="{ flexGrow: n, background: LEVEL_COLOR[lv] }" :title="`${LEVEL_LABEL[lv]} ${n}`"
              />
            </view>
            <view class="mt-1 flex flex-wrap gap-x-3 text-11px text-muted">
              <text v-for="(n, lv) in levelCount" :key="lv">
                <text :style="{ color: LEVEL_COLOR[lv] }">●</text> {{ LEVEL_LABEL[lv] }} {{ n }}
              </text>
            </view>
          </view>
        </view>
        <view v-if="breachError" class="ot-vc__warn">
          <text class="flex-1">泄露检查失败：{{ breachError }}</text>
          <text class="cursor-pointer font-600" @click="runBreachCheck">重试</text>
        </view>
      </ot-panel>

      <ot-panel v-if="breached.length" title="已泄露的密码">
        <view class="mb-2 text-12px text-muted leading-18px">
          这些密码出现在公开的泄露数据中，攻击者常用它们批量尝试登录，请尽快修改，且不要再在任何网站使用。
        </view>
        <view v-for="i in breached" :key="i.id" class="ot-vc__item" @click="edit(i)">
          <view class="ot-vc__dot bg-red-500" />
          <view class="min-w-0 flex-1">
            <text class="block truncate text-14px text-main">{{ title(i) }}</text>
            <text class="block truncate text-12px text-muted">{{ i.username || '（未填账号）' }}</text>
          </view>
          <text class="shrink-0 text-12px text-red-500">泄露 {{ formatCount(breach[i.id]) }} 次</text>
          <view class="i-carbon-chevron-right shrink-0 text-14px text-muted" />
        </view>
      </ot-panel>

      <ot-panel v-if="reusedGroups.length" title="重复使用的密码">
        <view class="mb-2 text-12px text-muted leading-18px">
          一个网站泄露，其他用同一密码的账号都会受影响。建议每个账号使用不同的随机密码。
        </view>
        <view v-for="(g, gi) in reusedGroups" :key="gi" class="ot-vc__group">
          <text class="text-12px text-muted">第 {{ gi + 1 }} 组 · {{ g.length }} 个账号使用同一密码</text>
          <view v-for="i in g" :key="i.id" class="ot-vc__item" @click="edit(i)">
            <view class="ot-vc__dot bg-orange-500" />
            <view class="min-w-0 flex-1">
              <text class="block truncate text-14px text-main">{{ title(i) }}</text>
              <text class="block truncate text-12px text-muted">{{ i.username || '（未填账号）' }}</text>
            </view>
            <view class="i-carbon-chevron-right shrink-0 text-14px text-muted" />
          </view>
        </view>
      </ot-panel>

      <ot-panel v-if="weak.length" title="弱密码">
        <view v-for="i in weak" :key="i.id" class="ot-vc__item" @click="edit(i)">
          <view class="ot-vc__dot" :style="{ background: LEVEL_COLOR[i.level] }" />
          <view class="min-w-0 flex-1">
            <text class="block truncate text-14px text-main">{{ title(i) }}</text>
            <text class="block truncate text-12px text-muted">{{ i.reasons.join('；') || LEVEL_LABEL[i.level] }}</text>
          </view>
          <text class="shrink-0 text-12px" :style="{ color: LEVEL_COLOR[i.level] }">{{ LEVEL_LABEL[i.level] }}</text>
          <view class="i-carbon-chevron-right shrink-0 text-14px text-muted" />
        </view>
      </ot-panel>

      <ot-panel v-if="old.length" title="长期未更换">
        <view v-for="i in old" :key="i.id" class="ot-vc__item" @click="edit(i)">
          <view class="ot-vc__dot bg-amber-400" />
          <view class="min-w-0 flex-1">
            <text class="block truncate text-14px text-main">{{ title(i) }}</text>
            <text class="block truncate text-12px text-muted">{{ i.username || '（未填账号）' }}</text>
          </view>
          <text class="shrink-0 text-12px text-muted">{{ ageText(i.passwordAgeDays) }}未改</text>
          <view class="i-carbon-chevron-right shrink-0 text-14px text-muted" />
        </view>
      </ot-panel>

      <ot-panel v-if="empty.length" title="未设置密码">
        <view v-for="i in empty" :key="i.id" class="ot-vc__item" @click="edit(i)">
          <view class="ot-vc__dot bg-gray-400" />
          <text class="min-w-0 flex-1 truncate text-14px text-main">{{ title(i) }}</text>
          <view class="i-carbon-chevron-right shrink-0 text-14px text-muted" />
        </view>
      </ot-panel>

      <ot-panel v-if="!breached.length && !weak.length && !reusedGroups.length && !breachRunning">
        <view class="flex items-center gap-2 text-14px text-emerald-600">
          <view class="i-carbon-checkmark-filled text-18px" />
          <text>没有发现泄露、弱密码或重复使用的密码</text>
        </view>
      </ot-panel>

      <view class="px-1 text-12px text-muted leading-20px">
        强度与重复检查在服务器内完成，结果不含密码。泄露检查使用 Have I Been Pwned 的匿名接口：只发送密码 SHA-1 哈希的前 5 位，对方无法得知你的密码。「长期未更换」从本功能上线时开始按实际修改时间计算，之前的条目以最后编辑时间为准。点击条目可直接修改。
      </view>
    </template>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-vc__score {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  border: 6px solid;
  flex-shrink: 0;
}

.ot-vc__bar {
  display: flex;
  gap: 2px;
  height: 8px;
  margin-top: 12px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--ot-fill);
}

.ot-vc__bar-seg {
  flex-basis: 0;
}

.ot-vc__warn {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: #b45309;
  background: rgba(245, 158, 11, 0.12);
}

.ot-vc__error {
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 13px;
  color: #dc2626;
  background: rgba(239, 68, 68, 0.08);
}

.ot-vc__group + .ot-vc__group {
  margin-top: 10px;
}

.ot-vc__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 10px;
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
  }
}

.ot-vc__dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
</style>
