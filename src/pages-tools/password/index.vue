<script lang="ts" setup>
import { copyText, getRandomInts } from '@/utils/common'

definePage({
  style: { navigationBarTitleText: '随机密码' },
})

const CHARSETS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digit: '0123456789',
  symbol: '!@#$%^&*()-_=+[]{};:,.?/~',
}
const AMBIGUOUS = /[0O1lI|]/g

const length = ref(16)
const count = ref(5)
const options = reactive({ upper: true, lower: true, digit: true, symbol: true, noAmbiguous: false })
const passwords = ref<string[]>([])

const charset = computed(() => {
  let s = (Object.keys(CHARSETS) as (keyof typeof CHARSETS)[])
    .filter(k => options[k])
    .map(k => CHARSETS[k])
    .join('')
  if (options.noAmbiguous)
    s = s.replace(AMBIGUOUS, '')
  return s
})

// 按字符集大小与长度估算熵
const strength = computed(() => {
  const bits = Math.log2(charset.value.length || 1) * length.value
  if (bits >= 100)
    return { text: '非常强', color: '#10b981', percent: 100 }
  if (bits >= 72)
    return { text: '强', color: '#22c55e', percent: 75 }
  if (bits >= 50)
    return { text: '中等', color: '#f59e0b', percent: 50 }
  return { text: '弱', color: '#ef4444', percent: 25 }
})

async function generate() {
  const chars = charset.value
  if (!chars) {
    passwords.value = []
    return
  }
  const list: string[] = []
  for (let i = 0; i < count.value; i++) {
    const idx = await getRandomInts(length.value, chars.length)
    list.push(idx.map(n => chars[n]).join(''))
  }
  passwords.value = list
}

watch([length, count, charset], generate, { immediate: true })
</script>

<template>
  <ot-tool-layout>
    <ot-panel title="设置">
      <view class="text-13px text-sub">
        长度：{{ length }}
      </view>
      <wd-slider v-model="length" :min="4" :max="64" hide-min-max hide-label />
      <view class="mt-2 flex flex-wrap gap-x-5 gap-y-3">
        <wd-checkbox v-model="options.upper" shape="square">
          大写 A-Z
        </wd-checkbox>
        <wd-checkbox v-model="options.lower" shape="square">
          小写 a-z
        </wd-checkbox>
        <wd-checkbox v-model="options.digit" shape="square">
          数字 0-9
        </wd-checkbox>
        <wd-checkbox v-model="options.symbol" shape="square">
          符号
        </wd-checkbox>
        <wd-checkbox v-model="options.noAmbiguous" shape="square">
          排除易混淆字符
        </wd-checkbox>
      </view>
      <view class="mt-4 flex items-center justify-between">
        <text class="text-13px text-sub">生成数量</text>
        <wd-input-number v-model="count" :min="1" :max="20" />
      </view>
    </ot-panel>

    <ot-panel title="结果">
      <template #extra>
        <text class="text-12px" :style="{ color: strength.color }">强度：{{ strength.text }}</text>
        <wd-button size="small" type="info" plain @click="copyText(passwords.join('\n'))">
          全部复制
        </wd-button>
        <wd-button size="small" @click="generate">
          重新生成
        </wd-button>
      </template>
      <view class="mb-3 h-4px overflow-hidden rounded bg-fill">
        <view class="h-full rounded transition-all" :style="{ width: `${strength.percent}%`, background: strength.color }" />
      </view>
      <view v-if="!charset" class="text-13px text-red-500">
        请至少选择一种字符类型
      </view>
      <ot-result v-for="(p, i) in passwords" :key="i" :label="`#${i + 1}`" :value="p" />
    </ot-panel>
  </ot-tool-layout>
</template>
