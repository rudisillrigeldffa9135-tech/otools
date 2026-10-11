<script lang="ts" setup>
import { Base64 } from 'js-base64'
import { copyText } from '@/utils/common'

definePage({
  style: { navigationBarTitleText: 'Base64 编解码' },
})

const mode = ref<'encode' | 'decode'>('encode')
const modeOptions = [
  { value: 'encode', label: '编码' },
  { value: 'decode', label: '解码' },
]
const urlSafe = ref(false)
const input = ref('')

const result = computed(() => {
  if (!input.value)
    return { text: '', error: '' }
  if (mode.value === 'encode')
    return { text: Base64.encode(input.value, urlSafe.value), error: '' }
  const src = input.value.trim()
  if (!Base64.isValid(src))
    return { text: '', error: '不是有效的 Base64 字符串' }
  return { text: Base64.decode(src), error: '' }
})

function swap() {
  input.value = result.value.text
  mode.value = mode.value === 'encode' ? 'decode' : 'encode'
}
</script>

<template>
  <ot-tool-layout>
    <ot-panel>
      <view class="mb-3 flex flex-wrap items-center gap-3">
        <ot-segmented v-model="mode" :options="modeOptions" />
        <view v-if="mode === 'encode'" class="flex items-center gap-2 text-13px text-sub">
          <wd-switch v-model="urlSafe" size="18px" />
          URL 安全
        </view>
      </view>
      <ot-textarea
        v-model="input" :height="160" :mono="mode === 'decode'"
        :placeholder="mode === 'encode' ? '输入要编码的文本' : '输入 Base64 字符串'"
      />
    </ot-panel>

    <ot-panel title="结果">
      <template #extra>
        <wd-button size="small" type="info" plain :disabled="!result.text" @click="swap">
          互换
        </wd-button>
        <wd-button size="small" :disabled="!result.text" @click="copyText(result.text)">
          复制
        </wd-button>
      </template>
      <view v-if="result.error" class="text-13px text-red-500">
        {{ result.error }}
      </view>
      <ot-textarea v-else :model-value="result.text" readonly :height="160" placeholder="结果会实时显示在这里" />
    </ot-panel>
  </ot-tool-layout>
</template>
