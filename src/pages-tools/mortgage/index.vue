<script lang="ts" setup>
import type { Plan, Prepay, RepayMethod } from './mortgage'
import { buildPlan, formatMonths, groupByYear, mergePlans, METHOD_NAME, money, wan } from './mortgage'

definePage({
  style: { navigationBarTitleText: '房贷计算器' },
})

type LoanKind = 'commercial' | 'fund' | 'combo'

const kind = ref<LoanKind>('commercial')
const inputMode = ref<'amount' | 'price'>('amount')
const price = ref('300')
const downRatio = ref(30)
const commercialWan = ref('100')
const commercialRate = ref('3.1')
const fundWan = ref('50')
const fundRate = ref('2.6')
const years = ref(30)
const method = ref<RepayMethod>('annuity')

const YEARS = [5, 10, 15, 20, 25, 30]
const RATIOS = [15, 20, 25, 30, 40, 50]

const prepayOn = ref(false)
const prepayYear = ref('3')
const prepayWan = ref('20')
const prepayStrategy = ref<Prepay['strategy']>('shorten')

const num = (s: string) => Number(String(s).trim())

/** 按房屋总价计算时的贷款总额（万） */
const loanFromPrice = computed(() => Math.max(0, num(price.value) * (1 - downRatio.value / 100)))

/** 各笔贷款的本金（元） */
const amounts = computed(() => {
  if (kind.value === 'combo') {
    const fund = num(fundWan.value) * 10000
    const total = inputMode.value === 'price' ? loanFromPrice.value * 10000 : num(commercialWan.value) * 10000 + fund
    return { commercial: inputMode.value === 'price' ? Math.max(0, total - fund) : num(commercialWan.value) * 10000, fund }
  }
  const total = inputMode.value === 'price' ? loanFromPrice.value * 10000 : num(kind.value === 'fund' ? fundWan.value : commercialWan.value) * 10000
  return kind.value === 'fund' ? { commercial: 0, fund: total } : { commercial: total, fund: 0 }
})

const prepay = computed<Prepay | undefined>(() => {
  if (!prepayOn.value)
    return undefined
  return { afterPeriod: Math.round(num(prepayYear.value) * 12), amount: num(prepayWan.value) * 10000, strategy: prepayStrategy.value }
})

/** 计算某种还款方式的方案；组合贷时提前还款优先还商贷（利率更高） */
function calc(m: RepayMethod, withPrepay: boolean): Plan {
  const months = years.value * 12
  const { commercial, fund } = amounts.value
  const pp = withPrepay ? prepay.value : undefined
  const plans: Plan[] = []
  if (commercial > 0)
    plans.push(buildPlan({ principal: commercial, annualRate: num(commercialRate.value), months }, m, pp))
  if (fund > 0)
    plans.push(buildPlan({ principal: fund, annualRate: num(fundRate.value), months }, m, commercial > 0 ? undefined : pp))
  if (!plans.length)
    throw new Error('请输入贷款金额')
  return plans.length === 2 ? mergePlans(plans[0], plans[1]) : plans[0]
}

const result = computed(() => {
  try {
    if (!(years.value >= 1 && years.value <= 50))
      throw new Error('贷款年限需在 1~50 年之间')
    const annuity = calc('annuity', false)
    const linear = calc('linear', false)
    const base = method.value === 'annuity' ? annuity : linear
    const withPrepay = prepay.value ? calc(method.value, true) : undefined
    return { annuity, linear, base, withPrepay }
  }
  catch (e: any) {
    return { error: e.message as string }
  }
})

const totalLoan = computed(() => amounts.value.commercial + amounts.value.fund)

/** 明细：有提前还款时展示提前还款后的方案 */
const detailPlan = computed(() => result.value.withPrepay ?? result.value.base)
const groups = computed(() => (detailPlan.value ? groupByYear(detailPlan.value.rows) : []))
const expanded = ref<number[]>([])
function toggleYear(y: number) {
  const i = expanded.value.indexOf(y)
  i >= 0 ? expanded.value.splice(i, 1) : expanded.value.push(y)
}
watch([groups], () => (expanded.value = []))

const prepaySummary = computed(() => {
  const r = result.value
  if (!r.withPrepay || !r.base)
    return null
  const at = prepay.value!.afterPeriod
  const before = r.base.rows[at]?.payment ?? 0
  const after = r.withPrepay.rows[at]?.payment ?? 0
  return {
    saved: r.base.totalInterest - r.withPrepay.totalInterest,
    months: r.withPrepay.months,
    shortened: r.base.months - r.withPrepay.months,
    before,
    after,
    paidOff: r.withPrepay.months <= at,
  }
})
</script>

<template>
  <ot-tool-layout>
    <ot-panel>
      <ot-segmented v-model="kind" :options="[{ value: 'commercial', label: '商业贷款' }, { value: 'fund', label: '公积金' }, { value: 'combo', label: '组合贷' }]" />

      <view class="ot-mg__row mt-4">
        <text class="ot-mg__label">计算方式</text>
        <ot-segmented v-model="inputMode" :options="[{ value: 'amount', label: '按贷款金额' }, { value: 'price', label: '按房屋总价' }]" size="small" />
      </view>

      <template v-if="inputMode === 'price'">
        <view class="ot-mg__row">
          <text class="ot-mg__label">房屋总价</text>
          <view class="ot-mg__field">
            <input v-model="price" class="min-w-0 flex-1" type="digit" placeholder="0">
            <text class="text-muted">万元</text>
          </view>
        </view>
        <view class="ot-mg__row">
          <text class="ot-mg__label">首付比例</text>
          <view class="flex flex-wrap gap-1.5">
            <view v-for="r in RATIOS" :key="r" class="ot-mg__chip" :class="{ 'is-active': downRatio === r }" @click="downRatio = r">
              {{ r }}%
            </view>
          </view>
        </view>
        <view class="ot-mg__hint">
          首付 {{ money(num(price) * downRatio / 100) }} 万，贷款 {{ money(loanFromPrice) }} 万{{ kind === 'combo' ? `（其中公积金 ${money(num(fundWan))} 万，其余为商贷）` : '' }}
        </view>
      </template>

      <view v-if="kind !== 'fund' && (inputMode === 'amount')" class="ot-mg__row">
        <text class="ot-mg__label">商贷金额</text>
        <view class="ot-mg__field">
          <input v-model="commercialWan" class="min-w-0 flex-1" type="digit" placeholder="0">
          <text class="text-muted">万元</text>
        </view>
      </view>
      <view v-if="kind !== 'fund'" class="ot-mg__row">
        <text class="ot-mg__label">商贷利率</text>
        <view class="ot-mg__field">
          <input v-model="commercialRate" class="min-w-0 flex-1" type="digit" placeholder="0">
          <text class="text-muted">%</text>
        </view>
      </view>
      <view v-if="kind !== 'commercial' && (inputMode === 'amount' || kind === 'combo')" class="ot-mg__row">
        <text class="ot-mg__label">公积金金额</text>
        <view class="ot-mg__field">
          <input v-model="fundWan" class="min-w-0 flex-1" type="digit" placeholder="0">
          <text class="text-muted">万元</text>
        </view>
      </view>
      <view v-if="kind !== 'commercial'" class="ot-mg__row">
        <text class="ot-mg__label">公积金利率</text>
        <view class="ot-mg__field">
          <input v-model="fundRate" class="min-w-0 flex-1" type="digit" placeholder="0">
          <text class="text-muted">%</text>
        </view>
      </view>

      <view class="ot-mg__row">
        <text class="ot-mg__label">贷款年限</text>
        <view class="flex flex-wrap items-center gap-1.5">
          <view v-for="y in YEARS" :key="y" class="ot-mg__chip" :class="{ 'is-active': years === y }" @click="years = y">
            {{ y }} 年
          </view>
          <view class="ot-mg__field is-small">
            <input :value="String(years)" class="w-8 text-center" type="number" @input="years = Number(($event as any).detail.value) || 0">
            <text class="text-muted">年</text>
          </view>
        </view>
      </view>
      <view class="ot-mg__hint">
        利率请按借款合同填写（LPR + 加点），默认值仅为示例。
      </view>
    </ot-panel>

    <view v-if="result.error" class="ot-mg__error">
      <view class="i-carbon-warning-filled shrink-0" />
      <text>{{ result.error }}</text>
    </view>

    <template v-else-if="result.annuity && result.linear">
      <ot-panel :title="`贷款 ${wan(totalLoan)} · ${years} 年`">
        <view class="ot-mg__compare">
          <view class="ot-mg__card" :class="{ 'is-active': method === 'annuity' }" @click="method = 'annuity'">
            <view class="flex items-center justify-between">
              <text class="text-14px text-main font-600">等额本息</text>
              <view v-if="method === 'annuity'" class="i-carbon-checkmark-filled text-16px text-[var(--wot-color-theme)]" />
            </view>
            <text class="mt-2 block text-12px text-muted">每月月供</text>
            <text class="ot-mono block text-22px text-main font-700">{{ money(result.annuity.firstPayment) }}</text>
            <view class="ot-mg__kv">
              <text>支付利息</text><text class="ot-mono">{{ wan(result.annuity.totalInterest) }}</text>
            </view>
            <view class="ot-mg__kv">
              <text>还款总额</text><text class="ot-mono">{{ wan(result.annuity.totalPayment) }}</text>
            </view>
            <text class="mt-2 block text-11px text-muted leading-16px">每月还款额固定，前期利息占比高</text>
          </view>
          <view class="ot-mg__card" :class="{ 'is-active': method === 'linear' }" @click="method = 'linear'">
            <view class="flex items-center justify-between">
              <text class="text-14px text-main font-600">等额本金</text>
              <view v-if="method === 'linear'" class="i-carbon-checkmark-filled text-16px text-[var(--wot-color-theme)]" />
            </view>
            <text class="mt-2 block text-12px text-muted">首月月供</text>
            <text class="ot-mono block text-22px text-main font-700">{{ money(result.linear.firstPayment) }}</text>
            <view class="ot-mg__kv">
              <text>每月递减</text><text class="ot-mono">{{ money(result.linear.rows[0].payment - (result.linear.rows[1]?.payment ?? 0)) }}</text>
            </view>
            <view class="ot-mg__kv">
              <text>支付利息</text><text class="ot-mono">{{ wan(result.linear.totalInterest) }}</text>
            </view>
            <view class="ot-mg__kv">
              <text>还款总额</text><text class="ot-mono">{{ wan(result.linear.totalPayment) }}</text>
            </view>
          </view>
        </view>
        <view class="mt-3 text-12px text-muted leading-20px">
          等额本金比等额本息少付利息 <text class="text-main font-600">{{ wan(result.annuity.totalInterest - result.linear.totalInterest) }}</text>，但前期月供多 {{ money(result.linear.firstPayment - result.annuity.firstPayment) }} 元。点击卡片切换下方明细。
        </view>
      </ot-panel>

      <ot-panel title="提前还款测算">
        <template #extra>
          <wd-switch v-model="prepayOn" size="20px" />
        </template>
        <view v-if="!prepayOn" class="text-13px text-muted">
          打开后按「{{ METHOD_NAME[method] }}」测算提前还款能省多少利息{{ kind === 'combo' ? '（组合贷优先提前还商贷）' : '' }}。
        </view>
        <template v-else>
          <view class="ot-mg__row mt-0!">
            <text class="ot-mg__label">还款时间</text>
            <view class="ot-mg__field">
              <text class="text-muted">第</text>
              <input v-model="prepayYear" class="min-w-0 flex-1 text-center" type="digit">
              <text class="text-muted">年后</text>
            </view>
          </view>
          <view class="ot-mg__row">
            <text class="ot-mg__label">还款金额</text>
            <view class="ot-mg__field">
              <input v-model="prepayWan" class="min-w-0 flex-1" type="digit">
              <text class="text-muted">万元</text>
            </view>
          </view>
          <view class="ot-mg__row">
            <text class="ot-mg__label">还款后</text>
            <ot-segmented v-model="prepayStrategy" :options="[{ value: 'shorten', label: '缩短年限' }, { value: 'reduce', label: '减少月供' }]" size="small" />
          </view>
          <view v-if="prepaySummary" class="ot-mg__saving">
            <view class="flex items-baseline justify-between">
              <text class="text-13px text-sub">节省利息</text>
              <text class="ot-mono text-22px text-emerald-600 font-700">{{ money(prepaySummary.saved) }}</text>
            </view>
            <template v-if="prepaySummary.paidOff">
              <view class="ot-mg__kv">
                <text>结果</text><text>一次性还清</text>
              </view>
            </template>
            <template v-else>
              <view class="ot-mg__kv">
                <text>月供</text><text class="ot-mono">{{ money(prepaySummary.before) }} → {{ money(prepaySummary.after) }}</text>
              </view>
              <view class="ot-mg__kv">
                <text>还款期限</text><text>{{ formatMonths(prepaySummary.months) }}{{ prepaySummary.shortened ? `（缩短 ${formatMonths(prepaySummary.shortened)}）` : '' }}</text>
              </view>
            </template>
            <view v-if="method === 'annuity' && prepayStrategy === 'shorten'" class="mt-2 text-11px text-muted">
              按「月供基本不变」反推期数，各银行实际取整规则可能略有差异。
            </view>
          </view>
        </template>
      </ot-panel>

      <ot-panel :title="`还款明细 · ${METHOD_NAME[method]}${result.withPrepay ? '（含提前还款）' : ''}`">
        <view class="ot-mg__thead">
          <text class="w-14">年度</text>
          <text class="flex-1 text-right">还款</text>
          <text class="flex-1 text-right">本金</text>
          <text class="flex-1 text-right">利息</text>
          <text class="flex-1 text-right">剩余本金</text>
        </view>
        <view v-for="g in groups" :key="g.year">
          <view class="ot-mg__trow is-year" @click="toggleYear(g.year)">
            <view class="w-14 flex items-center gap-0.5">
              <view class="text-12px text-muted" :class="expanded.includes(g.year) ? 'i-carbon-chevron-down' : 'i-carbon-chevron-right'" />
              <text>第 {{ g.year }} 年</text>
            </view>
            <text class="ot-mono flex-1 text-right">{{ money(g.payment, 0) }}</text>
            <text class="ot-mono flex-1 text-right">{{ money(g.principal, 0) }}</text>
            <text class="ot-mono flex-1 text-right">{{ money(g.interest, 0) }}</text>
            <text class="ot-mono flex-1 text-right">{{ money(g.balance, 0) }}</text>
          </view>
          <template v-if="expanded.includes(g.year)">
            <view v-for="r in g.rows" :key="r.period" class="ot-mg__trow">
              <text class="w-14 pl-4 text-muted">{{ r.period }} 期</text>
              <text class="ot-mono flex-1 text-right">{{ money(r.payment) }}</text>
              <text class="ot-mono flex-1 text-right">{{ money(r.principal) }}</text>
              <text class="ot-mono flex-1 text-right">{{ money(r.interest) }}</text>
              <text class="ot-mono flex-1 text-right">{{ money(r.balance) }}</text>
              <view v-if="r.prepaid" class="ot-mg__prepaid">
                本期后提前还款 {{ money(r.prepaid) }}
              </view>
            </view>
          </template>
        </view>
        <view class="mt-3 text-12px text-muted leading-20px">
          单位：元。按月计息，月利率 = 年利率 ÷ 12；实际金额以银行为准（各期取整到分会有几分钱差异）。
        </view>
      </ot-panel>
    </template>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-mg__row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.ot-mg__label {
  flex-shrink: 0;
  width: 70px;
  font-size: 13px;
  color: var(--ot-text-2);
}

.ot-mg__field {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 6px;
  max-width: 260px;
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

  &.is-small {
    flex: none;
    height: 30px;
    padding: 0 8px;
    font-size: 13px;
  }
}

.ot-mg__chip {
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--ot-text-2);
  background: var(--ot-fill);
  border: 1px solid transparent;
  cursor: pointer;

  &.is-active {
    color: var(--wot-color-theme);
    border-color: var(--wot-color-theme);
    background: transparent;
    font-weight: 600;
  }
}

.ot-mg__hint {
  margin-top: 8px;
  padding-left: 80px;
  font-size: 12px;
  line-height: 18px;
  color: var(--ot-text-3);
}

.ot-mg__error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  color: #dc2626;
  background: rgba(239, 68, 68, 0.08);
}

.ot-mg__compare {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.ot-mg__card {
  padding: 12px;
  border-radius: 12px;
  background: var(--ot-fill);
  border: 1px solid transparent;
  cursor: pointer;

  &.is-active {
    border-color: var(--wot-color-theme);
    background: rgba(79, 110, 247, 0.05);
  }
}

.ot-mg__kv {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--ot-text-2);
}

.ot-mg__saving {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(16, 185, 129, 0.07);
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.ot-mg__thead,
.ot-mg__trow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  font-size: 12px;
}

.ot-mg__thead {
  color: var(--ot-text-3);
  border-bottom: 1px solid var(--ot-border);
}

.ot-mg__trow {
  color: var(--ot-text);
  border-bottom: 1px dashed var(--ot-border);

  &.is-year {
    font-weight: 600;
    cursor: pointer;
    border-bottom-style: solid;

    &:hover {
      background: var(--ot-fill);
    }
  }
}

.ot-mg__prepaid {
  width: 100%;
  padding-left: 16px;
  font-size: 11px;
  color: #059669;
}

@media (max-width: 480px) {
  .ot-mg__compare {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
