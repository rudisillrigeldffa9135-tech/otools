<script lang="ts" setup>
import { copyText } from '@/utils/common'

definePage({
  style: { navigationBarTitleText: 'URL 编解码' },
})

const mode = ref<'encode' | 'decode'>('encode')
const modeOptions = [
  { value: 'encode', label: '编码' },
  { value: 'decode', label: '解码' },
]
// component: encodeURIComponent，编码所有保留字符；full: encodeURI，保留 URL 结构
const scope = ref<'component' | 'full'>('component')
const scopeOptions = [
  { value: 'component', label: '参数' },
  { value: 'full', label: '完整 URL' },
]
const input = ref('')

const result = computed(() => {
  if (!input.value)
    return { text: '', error: '' }
  try {
    const fn = mode.value === 'encode'
      ? (scope.value === 'component' ? encodeURIComponent : encodeURI)
      : (scope.value === 'component' ? decodeURIComponent : decodeURI)
    return { text: fn(input.value), error: '' }
  }
  catch {
    return { text: '', error: '解码失败：包含无效的 % 转义序列' }
  }
})

// 解析查询参数（不依赖 URL 对象，兼容小程序）
const params = computed(() => {
  const src = mode.value === 'decode' ? input.value : result.value.text
  const qIndex = src.indexOf('?')
  if (qIndex < 0)
    return []
  const query = src.slice(qIndex + 1).split('#')[0]
  return query.split('&').filter(Boolean).map((pair) => {
    const [k, ...rest] = pair.split('=')
    const safeDecode = (s: string) => {
      try {
        return decodeURIComponent(s.replace(/\+/g, ' '))
      }
      catch {
        return s
      }
    }
    return { key: safeDecode(k), value: safeDecode(rest.join('=')) }
  })
})
</script>

<template>
  <ot-tool-layout>
    <ot-panel>
      <view class="mb-3 flex flex-wrap items-center gap-3">
        <ot-segmented v-model="mode" :options="modeOptions" />
        <ot-segmented v-model="scope" :options="scopeOptions" size="small" />
      </view>
      <ot-textarea v-model="input" :height="140" placeholder="输入 URL 或文本" />
    </ot-panel>

    <ot-panel title="结果">
      <template #extra>
        <wd-button size="small" :disabled="!result.text" @click="copyText(result.text)">
          复制
        </wd-button>
      </template>
      <view v-if="result.error" class="text-13px text-red-500">
        {{ result.error }}
      </view>
      <ot-textarea v-else :model-value="result.text" readonly :height="140" placeholder="结果会实时显示在这里" />
    </ot-panel>

    <ot-panel v-if="params.length" :title="`查询参数 · ${params.length}`">
      <ot-result v-for="(p, i) in params" :key="i" :label="p.key" :value="p.value" />
    </ot-panel>
  </ot-tool-layout>
</template>
