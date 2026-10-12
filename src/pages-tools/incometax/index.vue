<script lang="ts" setup>
import type { SpecialDeductions } from './tax'
import { annualSummary, bonusTrap, DEFAULT_INSURANCE_RATES, EMPTY_SPECIAL, insuranceOf, monthlySpecial, monthlyWithholding } from './tax'

definePage({
  style: { navigationBarTitleText: '个税计算器' },
})

const salaryInput = ref('20000')
const bonusInput = ref('0')
const insMode = ref<'rate' | 'amount'>('rate')
const baseInput = ref('')
const fundRate = ref(0.07)
const insAmountInput = ref('3000')
const special = reactive<SpecialDeductions>({ ...EMPTY_SPECIAL })
const elderlyMode = ref<'none' | 'only' | 'shared'>('none')
const elderlyShare = ref('1500')
const housing = ref<'none' | 'mortgage' | 1500 | 1100 | 800>('none')
const pensionInput = ref('0')
const otherInput = ref('0')

function num(s: string) {
  const n = Number(String(s).replace(/,/g, '').trim())
  return Number.isFinite(n) && n > 0 ? n : 0
}

const FUND_RATES = [0.05, 0.07, 0.08, 0.1, 0.12]

watch([elderlyMode, elderlyShare], () => {
  special.elderly = elderlyMode.value === 'only' ? 3000 : elderlyMode.value === 'shared' ? Math.min(num(elderlyShare.value), 1500) : 0
}, { immediate: true })
watch(housing, (h) => {
  special.mortgage = h === 'mortgage'
  special.rent = typeof h === 'number' ? h : 0
}, { immediate: true })
watch(pensionInput, v => (special.pension = Math.min(num(v), 12000)), { immediate: true })
watch(otherInput, v => (special.otherMonthly = num(v)), { immediate: true })

const salary = computed(() => num(salaryInput.value))
const bonus = computed(() => num(bonusInput.value))
const insurance = computed(() => {
  if (insMode.value === 'amount')
    return Math.min(num(insAmountInput.value), salary.value)
  const base = baseInput.value.trim() ? num(baseInput.value) : salary.value
  return insuranceOf({ base, ...DEFAULT_INSURANCE_RATES, housingFund: fundRate.value })
})
const specialMonthly = computed(() => monthlySpecial(special))

const rows = computed(() => monthlyWithholding(salary.value, insurance.value, specialMonthly.value))
const summary = computed(() => annualSummary(salary.value, insurance.value, special, bonus.value))
const trap = computed(() => bonusTrap(bonus.value))

const netRange = computed(() => {
  const nets = rows.value.map(r => r.net)
  return { min: Math.min(...nets), max: Math.max(...nets) }
})

function money(n: number, digits = 2) {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

const QUICK_SALARY = [8000, 15000, 20000, 30000, 50000]
</script>

<template>
  <ot-tool-layout>
    <ot-panel title="收入">
      <view class="ot-tax__row">
        <text class="ot-tax__label">月薪（税前）</text>
        <view class="ot-tax__field">
          <input v-model="salaryInput" class="min-w-0 flex-1" type="digit" placeholder="0">
          <text class="text-muted">元</text>
        </view>
      </view>
      <view class="ot-tax__chips">
        <view v-for="q in QUICK_SALARY" :key="q" class="ot-tax__chip" :class="{ 'is-active': salary === q }" @click="salaryInput = String(q)">
          {{ q / 1000 }}K
        </view>
      </view>
      <view class="ot-tax__row">
        <text class="ot-tax__label">全年一次性奖金</text>
        <view class="ot-tax__field">
          <input v-model="bonusInput" class="min-w-0 flex-1" type="digit" placeholder="0">
          <text class="text-muted">元</text>
        </view>
      </view>
    </ot-panel>

    <ot-panel title="五险一金（个人缴纳）">
      <template #extra>
        <ot-segmented v-model="insMode" :options="[{ value: 'rate', label: '按比例' }, { value: 'amount', label: '直接填写' }]" size="small" />
      </template>
      <template v-if="insMode === 'rate'">
        <view class="ot-tax__row mt-0!">
          <text class="ot-tax__label">缴费基数</text>
          <view class="ot-tax__field">
            <input v-model="baseInput" class="min-w-0 flex-1" type="digit" :placeholder="`默认同月薪 ${salary || 0}`">
            <text class="text-muted">元</text>
          </view>
        </view>
        <view class="ot-tax__row">
          <text class="ot-tax__label">公积金比例</text>
          <view class="flex flex-wrap gap-1.5">
            <view v-for="r in FUND_RATES" :key="r" class="ot-tax__chip" :class="{ 'is-active': fundRate === r }" @click="fundRate = r">
              {{ Math.round(r * 100) }}%
            </view>
          </view>
        </view>
        <view class="ot-tax__hint">
          养老 8% + 医疗 2% + 失业 0.5% + 公积金 {{ Math.round(fundRate * 100) }}% = 每月 {{ money(insurance) }} 元。缴费基数有上下限，以当地社保为准。
        </view>
      </template>
      <view v-else class="ot-tax__row mt-0!">
        <text class="ot-tax__label">每月合计</text>
        <view class="ot-tax__field">
          <input v-model="insAmountInput" class="min-w-0 flex-1" type="digit" placeholder="工资条上的扣款合计">
          <text class="text-muted">元</text>
        </view>
      </view>
    </ot-panel>

    <ot-panel title="专项附加扣除">
      <template #extra>
        <text class="text-12px text-muted">每月 {{ money(specialMonthly, 0) }} 元</text>
      </template>
      <view class="ot-tax__row mt-0!">
        <text class="ot-tax__label">子女教育</text>
        <wd-input-number v-model="special.children" :min="0" :max="6" />
        <text class="text-12px text-muted">每孩 2000/月</text>
      </view>
      <view class="ot-tax__row">
        <text class="ot-tax__label">3 岁以下婴幼儿</text>
        <wd-input-number v-model="special.infants" :min="0" :max="6" />
        <text class="text-12px text-muted">每孩 2000/月</text>
      </view>
      <view class="ot-tax__row">
        <text class="ot-tax__label">赡养老人</text>
        <ot-segmented v-model="elderlyMode" :options="[{ value: 'none', label: '无' }, { value: 'only', label: '独生 3000' }, { value: 'shared', label: '分摊' }]" size="small" />
      </view>
      <view v-if="elderlyMode === 'shared'" class="ot-tax__row">
        <text class="ot-tax__label">我分摊</text>
        <view class="ot-tax__field">
          <input v-model="elderlyShare" class="min-w-0 flex-1" type="digit">
          <text class="text-muted">元/月（≤1500）</text>
        </view>
      </view>
      <view class="ot-tax__row">
        <text class="ot-tax__label">住房</text>
        <view class="flex flex-wrap gap-1.5">
          <view
            v-for="h in [{ v: 'none', l: '无' }, { v: 'mortgage', l: '首套房贷 1000' }, { v: 1500, l: '租房 1500' }, { v: 1100, l: '租房 1100' }, { v: 800, l: '租房 800' }]"
            :key="h.v" class="ot-tax__chip" :class="{ 'is-active': housing === h.v }" @click="housing = h.v as any"
          >
            {{ h.l }}
          </view>
        </view>
      </view>
      <view class="ot-tax__hint">
        租金标准：直辖市、省会、计划单列市 1500；市辖区户籍人口超过 100 万的城市 1100；其他 800。房贷利息与租金只能二选一。
      </view>
      <view class="ot-tax__row">
        <text class="ot-tax__label">学历继续教育</text>
        <wd-switch v-model="special.education" size="20px" />
        <text class="text-12px text-muted">400/月</text>
      </view>
      <view class="ot-tax__row">
        <text class="ot-tax__label">个人养老金</text>
        <view class="ot-tax__field">
          <input v-model="pensionInput" class="min-w-0 flex-1" type="digit">
          <text class="text-muted">元/年（≤12000）</text>
        </view>
      </view>
      <view class="ot-tax__row">
        <text class="ot-tax__label">其他扣除</text>
        <view class="ot-tax__field">
          <input v-model="otherInput" class="min-w-0 flex-1" type="digit">
          <text class="text-muted">元/月</text>
        </view>
      </view>
      <view class="ot-tax__hint">
        其他扣除如企业年金、税优健康险等。大病医疗、职业资格继续教育在次年汇算时扣除，这里不计。
      </view>
    </ot-panel>

    <ot-panel title="计算结果">
      <view class="ot-tax__cards">
        <view class="ot-tax__card is-main">
          <text class="text-12px text-muted">每月到手</text>
          <text class="ot-mono text-22px text-main font-700">
            {{ netRange.min === netRange.max ? money(netRange.max) : `${money(netRange.min, 0)} ~ ${money(netRange.max, 0)}` }}
          </text>
          <text v-if="netRange.min !== netRange.max" class="text-11px text-muted">累计预扣：年初少扣、年底多扣</text>
        </view>
        <view class="ot-tax__card">
          <text class="text-12px text-muted">全年个税</text>
          <text class="ot-mono text-18px text-main font-600">{{ money(Math.min(summary.separate.totalTax, summary.combined.totalTax)) }}</text>
        </view>
        <view class="ot-tax__card">
          <text class="text-12px text-muted">全年到手（含奖金）</text>
          <text class="ot-mono text-18px text-main font-600">{{ money(summary.netIncome) }}</text>
        </view>
        <view class="ot-tax__card">
          <text class="text-12px text-muted">实际税负</text>
          <text class="ot-mono text-18px text-main font-600">{{ (summary.taxRate * 100).toFixed(2) }}%</text>
        </view>
      </view>

      <template v-if="bonus > 0">
        <view class="mt-4 text-14px text-main font-600">
          年终奖计税方式对比
        </view>
        <view class="ot-tax__compare">
          <view class="ot-tax__card" :class="{ 'is-best': summary.better === 'separate' }">
            <view class="flex items-center gap-1">
              <text class="text-13px text-main font-600">单独计税</text>
              <text v-if="summary.better === 'separate'" class="ot-tax__badge">推荐</text>
            </view>
            <text class="mt-1 text-12px text-muted">奖金个税 {{ money(summary.separate.bonusTax) }}（税率 {{ summary.separate.bonusRate * 100 }}%）</text>
            <text class="ot-mono mt-1 text-16px text-main">全年 {{ money(summary.separate.totalTax) }}</text>
          </view>
          <view class="ot-tax__card" :class="{ 'is-best': summary.better === 'combined' }">
            <view class="flex items-center gap-1">
              <text class="text-13px text-main font-600">并入综合所得</text>
              <text v-if="summary.better === 'combined'" class="ot-tax__badge">推荐</text>
            </view>
            <text class="mt-1 text-12px text-muted">与工资合并按年度税率表计算</text>
            <text class="ot-mono mt-1 text-16px text-main">全年 {{ money(summary.combined.totalTax) }}</text>
          </view>
        </view>
        <view v-if="summary.saving > 0" class="mt-2 text-12px text-emerald-600">
          选择推荐方式可少缴 {{ money(summary.saving) }} 元。次年个税汇算时可在个税 App 里选择计税方式。
        </view>
        <view v-if="trap" class="ot-tax__warn">
          <view class="i-carbon-warning-alt shrink-0 text-16px" />
          <text>
            单独计税有「多发少拿」区间：奖金在 {{ money(trap.from, 0) }} ~ {{ money(trap.to, 0) }} 元之间时，税后反而比 {{ money(trap.from, 0) }} 元少 {{ money(trap.loss) }} 元。
          </text>
        </view>
      </template>
    </ot-panel>

    <ot-panel title="逐月预扣明细（不含奖金）">
      <view class="ot-tax__thead">
        <text class="w-10">月份</text>
        <text class="flex-1 text-right">个税</text>
        <text class="w-12 text-right">税率</text>
        <text class="flex-1 text-right">到手</text>
      </view>
      <view v-for="r in rows" :key="r.month" class="ot-tax__trow">
        <text class="w-10 text-muted">{{ r.month }} 月</text>
        <text class="ot-mono flex-1 text-right">{{ money(r.tax) }}</text>
        <text class="w-12 text-right text-muted">{{ r.rate ? `${r.rate * 100}%` : '—' }}</text>
        <text class="ot-mono flex-1 text-right text-main">{{ money(r.net) }}</text>
      </view>
      <view class="mt-3 text-12px text-muted leading-20px">
        按全年同一单位、工资不变估算。工资个税采用累计预扣法：全年累计收入越过档位后，后面月份的税率会升高，全年总额不变。
      </view>
    </ot-panel>

    <view class="px-1 text-12px text-muted leading-20px">
      税率表与扣除标准：综合所得 3%~45% 七级超额累进；基本减除 5000 元/月；专项附加扣除按 2023 年起的标准；年终奖单独计税政策执行至 2027 年底。结果仅供参考，以税务部门为准。
    </view>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-tax__row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.ot-tax__label {
  flex-shrink: 0;
  width: 96px;
  font-size: 13px;
  color: var(--ot-text-2);
}

.ot-tax__field {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 6px;
  max-width: 280px;
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  font-size: 15px;
  background: var(--ot-fill);
  color: var(--ot-text);
  border: 1px solid transparent;

  &:focus-within {
    border-color: var(--wot-color-theme);
  }

  .text-muted {
    font-size: 12px;
    white-space: nowrap;
  }
}

.ot-tax__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  padding-left: 106px;
}

.ot-tax__chip {
  padding: 3px 10px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--ot-text-2);
  background: var(--ot-fill);
  border: 1px solid transparent;
  cursor: pointer;

  &.is-active {
    color: #f97316;
    border-color: #f97316;
    background: transparent;
    font-weight: 600;
  }
}

.ot-tax__hint {
  margin-top: 8px;
  font-size: 12px;
  line-height: 18px;
  color: var(--ot-text-3);
}

.ot-tax__cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

@media (min-width: 768px) {
  .ot-tax__cards {
    grid-template-columns: 1.4fr 1fr 1fr 1fr;
  }
}

.ot-tax__compare {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 8px;
}

.ot-tax__card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px;
  border-radius: 12px;
  background: var(--ot-fill);
  border: 1px solid transparent;

  &.is-main {
    background: rgba(249, 115, 22, 0.07);
    border-color: rgba(249, 115, 22, 0.25);
  }

  &.is-best {
    border-color: #10b981;
    background: rgba(16, 185, 129, 0.06);
  }
}

.ot-tax__badge {
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  color: #fff;
  background: #10b981;
}

.ot-tax__warn {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 18px;
  color: #b45309;
  background: rgba(245, 158, 11, 0.12);
}

.ot-tax__thead,
.ot-tax__trow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 4px;
  font-size: 13px;
}

.ot-tax__thead {
  font-size: 12px;
  color: var(--ot-text-3);
  border-bottom: 1px solid var(--ot-border);
}

.ot-tax__trow {
  border-bottom: 1px dashed var(--ot-border);
}

@media (max-width: 420px) {
  .ot-tax__label {
    width: 84px;
  }

  .ot-tax__chips {
    padding-left: 0;
  }
}
</style>
