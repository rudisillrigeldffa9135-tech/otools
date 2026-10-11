<script setup lang="ts">
// 对 wd-segmented 的封装：支持 { value, label } 形式的选项
type Value = string | number
type Option = Value | { value: Value, label: string }

const props = withDefaults(defineProps<{
  options: Option[]
  size?: 'large' | 'middle' | 'small'
}>(), {
  size: 'middle',
})

const model = defineModel<Value>({ required: true })

const items = computed(() => props.options.map(o => ({ value: typeof o === 'object' ? o.value : o })))
const labelMap = computed(() => new Map(
  props.options.map(o => (typeof o === 'object' ? [o.value, o.label] : [o, String(o)])),
))
</script>

<template>
  <view class="ot-segmented">
    <wd-segmented v-model:value="model" :options="items" :size="size">
      <template #label="{ option }">
        {{ labelMap.get(option.value) }}
      </template>
    </wd-segmented>
  </view>
</template>

<style lang="scss" scoped>
.ot-segmented {
  display: inline-block;
  min-width: 0;
  max-width: 100%;
}

// 默认等分且省略文字，这里改为按内容撑开
:deep(.wd-segmented__item) {
  flex: 1 0 auto;
  padding: 0 12px;
}

:deep(.wd-segmented__item-label) {
  white-space: nowrap;
  overflow: visible;
}
</style>
