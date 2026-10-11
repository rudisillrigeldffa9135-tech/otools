<script lang="ts" setup>
import { formatThousands, parseRmbUpper, toChineseNumber, toRmbUpper } from './rmb'

definePage({
  style: { navigationBarTitleText: '人民币大写' },
})

const amount = ref('1234.56')
const upperInput = ref('')

/** 金额 → 各种中文写法 */
const result = computed<{ rows?: { label: string, value: string }[], error?: string }>(() => {
  if (!amount.value.trim())
    return {}
  try {
    return {
      rows: [
        { label: '金额大写', value: toRmbUpper(amount.value) },
        { label: '中文小写', value: toChineseNumber(amount.value) },
        { label: '中文大写', value: toChineseNumber(amount.value, true) },
        { label: '千分位', value: formatThousands(amount.value) },
      ],
    }
  }
  catch (e: any) {
    return { error: e.message }
  }
})

/** 大写 → 数字，用于核对票据 */
const parsed = computed<{ value?: string, error?: string }>(() => {
  if (!upperInput.value.trim())
    return {}
  try {
    return { value: parseRmbUpper(upperInput.value) }
  }
  catch (e: any) {
    return { error: e.message }
  }
})

const QUICK = ['0.5', '100', '1001', '10000', '105000', '1680.32', '20000001']

/** 大写数字对照表 */
const TABLE = [
  ['零', '0'],
  ['壹', '1'],
  ['贰', '2'],
  ['叁', '3'],
  ['肆', '4'],
  ['伍', '5'],
  ['陆', '6'],
  ['柒', '7'],
  ['捌', '8'],
  ['玖', '9'],
  ['拾', '十'],
  ['佰', '百'],
  ['仟', '千'],
  ['万', '万'],
  ['亿', '亿'],
]
</script>

<template>
  <ot-tool-layout>
    <ot-panel title="金额">
      <view class="ot-rmb__field">
        <text class="ot-rmb__yen">¥</text>
        <input v-model="amount" class="ot-mono min-w-0 flex-1 text-20px" type="digit" placeholder="输入金额，如 1234.56">
        <view v-if="amount" class="i-carbon-close-filled cursor-pointer text-17px text-muted" @click="amount = ''" />
      </view>
      <view class="mt-3 flex flex-wrap items-center gap-1.5">
        <text class="text-12px text-muted">试试：</text>
        <view v-for="q in QUICK" :key="q" class="ot-rmb__chip ot-mono" @click="amount = q">
          {{ q }}
        </view>
      </view>
      <view v-if="result.error" class="ot-rmb__error">
        <view class="i-carbon-warning-filled shrink-0" />
        <text>{{ result.error }}</text>
      </view>
    </ot-panel>

    <ot-panel v-if="result.rows" title="结果">
      <view class="ot-rmb__main">
        <text class="text-12px text-muted">金额大写</text>
        <text class="mt-1 block break-all text-20px text-main font-600 leading-snug" user-select selectable>{{ result.rows[0].value }}</text>
      </view>
      <ot-result v-for="r in result.rows" :key="r.label" :label="r.label" :value="r.value" />
      <view class="mt-3 text-12px text-muted leading-20px">
        按《支付结算办法》书写：到「元」为止写「整」，到「角」为止可不写「整」；超过两位小数按四舍五入到分。
      </view>
    </ot-panel>

    <ot-panel title="大写金额核对">
      <view class="ot-rmb__field">
        <input v-model="upperInput" class="min-w-0 flex-1 text-15px" placeholder="输入票据上的大写金额，如 壹仟贰佰叁拾肆元伍角陆分">
        <view v-if="upperInput" class="i-carbon-close-filled cursor-pointer text-17px text-muted" @click="upperInput = ''" />
      </view>
      <ot-result v-if="parsed.value" class="mt-3" label="对应数字" :value="parsed.value" />
      <view v-if="parsed.error" class="ot-rmb__error">
        <view class="i-carbon-warning-filled shrink-0" />
        <text>{{ parsed.error }}</text>
      </view>
    </ot-panel>

    <ot-panel title="大写数字对照">
      <view class="ot-rmb__table">
        <view v-for="[u, n] in TABLE" :key="u" class="ot-rmb__cell">
          <text class="text-18px text-main">{{ u }}</text>
          <text class="text-12px text-muted">{{ n }}</text>
        </view>
      </view>
    </ot-panel>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-rmb__field {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 14px;
  border-radius: 12px;
  background: var(--ot-fill);
  color: var(--ot-text);
}

.ot-rmb__yen {
  font-size: 20px;
  color: var(--ot-text-3);
}

.ot-rmb__chip {
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

.ot-rmb__error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: #dc2626;
  background: rgba(239, 68, 68, 0.08);
}

.ot-rmb__main {
  margin-bottom: 12px;
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.06);
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.ot-rmb__table {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

@media (min-width: 640px) {
  .ot-rmb__table {
    grid-template-columns: repeat(8, minmax(0, 1fr));
  }
}

.ot-rmb__cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  border-radius: 8px;
  background: var(--ot-fill);
}
</style>
