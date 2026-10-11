<script lang="ts" setup>
import { copyText, getRandomBytes } from '@/utils/common'

definePage({
  style: { navigationBarTitleText: 'UUID 生成' },
})

const count = ref(5)
const upper = ref(false)
const hyphen = ref(true)

// RFC 4122 v4：设置版本位与变体位
async function uuidv4() {
  const b = await getRandomBytes(16)
  b[6] = (b[6] & 0x0F) | 0x40
  b[8] = (b[8] & 0x3F) | 0x80
  const hex = Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const rawList = ref<string[]>([])
async function generate() {
  const arr: string[] = []
  for (let i = 0; i < count.value; i++)
    arr.push(await uuidv4())
  rawList.value = arr
}

const list = computed(() => rawList.value.map((u) => {
  const s = hyphen.value ? u : u.replace(/-/g, '')
  return upper.value ? s.toUpperCase() : s
}))

watch(count, generate, { immediate: true })
</script>

<template>
  <ot-tool-layout>
    <ot-panel title="设置">
      <view class="flex flex-wrap items-center gap-x-6 gap-y-3">
        <view class="flex items-center gap-2 text-13px text-sub">
          数量
          <wd-input-number v-model="count" :min="1" :max="50" />
        </view>
        <view class="flex items-center gap-2 text-13px text-sub">
          <wd-switch v-model="upper" size="18px" />
          大写
        </view>
        <view class="flex items-center gap-2 text-13px text-sub">
          <wd-switch v-model="hyphen" size="18px" />
          连字符
        </view>
      </view>
    </ot-panel>

    <ot-panel title="结果">
      <template #extra>
        <wd-button size="small" type="info" plain @click="copyText(list.join('\n'))">
          全部复制
        </wd-button>
        <wd-button size="small" @click="generate">
          重新生成
        </wd-button>
      </template>
      <ot-result v-for="(u, i) in list" :key="i" :label="`#${i + 1}`" :value="u" />
    </ot-panel>
  </ot-tool-layout>
</template>
