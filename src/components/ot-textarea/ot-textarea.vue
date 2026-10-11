<script setup lang="ts">
// 多行输入框：统一样式，去掉小程序 textarea 默认 140 字限制
withDefaults(defineProps<{
  placeholder?: string
  height?: number
  readonly?: boolean
  mono?: boolean
}>(), {
  placeholder: '请输入内容',
  height: 160,
  readonly: false,
  mono: true,
})

const model = defineModel<string>({ default: '' })

function onInput(e: any) {
  model.value = e.detail.value
}
</script>

<template>
  <view class="ot-textarea" :class="{ 'is-readonly': readonly }">
    <textarea
      class="ot-textarea__inner" :class="{ 'ot-mono': mono }"
      :style="{ height: `${height}px` }"
      :value="model"
      :placeholder="placeholder"
      placeholder-class="ot-textarea__placeholder"
      :maxlength="-1"
      :disabled="readonly"
      :show-confirm-bar="false"
      @input="onInput"
    />
    <view
      v-if="model && !readonly"
      class="ot-textarea__clear i-carbon-close-filled"
      @click="model = ''"
    />
  </view>
</template>

<style lang="scss" scoped>
.ot-textarea {
  position: relative;
  border-radius: 10px;
  background: var(--ot-fill);
  border: 1px solid transparent;
  transition: border-color 0.15s;

  &:focus-within {
    border-color: var(--wot-color-theme);
  }
}

.ot-textarea__inner {
  box-sizing: border-box;
  width: 100%;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--ot-text);
  background: transparent;
}

.ot-textarea__clear {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 16px;
  color: var(--ot-text-3);
  cursor: pointer;
}
</style>

<style lang="scss">
.ot-textarea__placeholder {
  color: var(--ot-text-3);
}
</style>
