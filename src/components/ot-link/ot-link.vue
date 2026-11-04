<script setup lang="ts">
// 站内页面链接：H5 渲染为真正的 <a>，支持 Ctrl/⌘/Shift + 点击、鼠标中键、右键「在新标签页中打开」；
// 普通点击仍走 uni 路由（保留页面栈与拦截器）。小程序渲染为 view
import { pageHref } from '@/utils/link'

const props = defineProps<{
  /** 页面路径，如 /pages-tools/json/index?x=1 */
  to: string
  hoverClass?: string
}>()
const emit = defineEmits<{ click: [] }>()

function go() {
  emit('click')
  uni.navigateTo({ url: props.to, fail: () => uni.switchTab({ url: props.to.split('?')[0] }) })
}

// #ifdef H5
const href = computed(() => pageHref(props.to))
function onClick(e: MouseEvent) {
  // 带修饰键或非左键时交给浏览器（新标签页 / 新窗口打开）
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0)
    return
  e.preventDefault()
  go()
}
// #endif
</script>

<template>
  <!-- #ifdef H5 -->
  <a :href="href" class="ot-link" @click="onClick"><slot /></a>
  <!-- #endif -->
  <!-- #ifndef H5 -->
  <view :hover-class="hoverClass || 'none'" @click="go">
    <slot />
  </view>
  <!-- #endif -->
</template>

<style lang="scss">
/* 不加 scoped、只用低优先级选择器，使用方 class 上的颜色 / display 都能覆盖 */
a.ot-link {
  color: inherit;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}
</style>
