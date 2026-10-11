<script lang="ts" setup>
import { copyText } from '@/utils/common'

definePage({
  style: { navigationBarTitleText: 'JSON 格式化' },
})

const input = ref('')
const output = ref('')
const error = ref('')
const indent = ref<string>('2')
const indentOptions = [
  { value: '2', label: '2 空格' },
  { value: '4', label: '4 空格' },
  { value: 'tab', label: 'Tab' },
]

function parse() {
  error.value = ''
  if (!input.value.trim()) {
    error.value = '请输入 JSON'
    return undefined
  }
  try {
    return { value: JSON.parse(input.value) }
  }
  catch (e: any) {
    error.value = `解析失败：${e.message}`
    return undefined
  }
}

function format() {
  const res = parse()
  if (res)
    output.value = JSON.stringify(res.value, null, indent.value === 'tab' ? '\t' : Number(indent.value))
}

function minify() {
  const res = parse()
  if (res)
    output.value = JSON.stringify(res.value)
}

function escape() {
  const res = parse()
  if (res)
    output.value = JSON.stringify(JSON.stringify(res.value))
}

function unescape() {
  error.value = ''
  try {
    const str = JSON.parse(input.value)
    if (typeof str !== 'string')
      throw new Error('输入不是被转义的 JSON 字符串')
    output.value = JSON.stringify(JSON.parse(str), null, 2)
  }
  catch (e: any) {
    error.value = `去转义失败：${e.message}`
  }
}

function useOutput() {
  input.value = output.value
}

function loadSample() {
  input.value = '{"name":"OTools","version":"1.0.0","tags":["json","format"],"author":{"github":"otools"},"free":true}'
  format()
}
</script>

<template>
  <ot-tool-layout>
    <ot-panel title="输入">
      <template #extra>
        <wd-button size="small" type="info" plain @click="loadSample">
          示例
        </wd-button>
      </template>
      <ot-textarea v-model="input" placeholder="粘贴 JSON 文本" :height="200" />
      <view class="mt-3 flex flex-wrap items-center gap-2">
        <ot-segmented v-model="indent" :options="indentOptions" size="small" />
        <view class="flex-1" />
        <wd-button size="small" @click="format">
          格式化
        </wd-button>
        <wd-button size="small" plain @click="minify">
          压缩
        </wd-button>
        <wd-button size="small" type="info" plain @click="escape">
          转义
        </wd-button>
        <wd-button size="small" type="info" plain @click="unescape">
          去转义
        </wd-button>
      </view>
      <view v-if="error" class="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-13px text-red-500">
        {{ error }}
      </view>
    </ot-panel>

    <ot-panel title="结果">
      <template #extra>
        <wd-button size="small" type="info" plain :disabled="!output" @click="useOutput">
          作为输入
        </wd-button>
        <wd-button size="small" :disabled="!output" @click="copyText(output)">
          复制
        </wd-button>
      </template>
      <ot-textarea v-model="output" readonly placeholder="结果会显示在这里" :height="280" />
    </ot-panel>
  </ot-tool-layout>
</template>
