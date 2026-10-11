<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAppStore } from '@/store/app'
import FgTabbar from '@/tabbar/index.vue'
import { isPageTabbar } from './tabbar/store'
import { currRoute } from './utils'

const appStore = useAppStore()

const isCurrentPageTabbar = ref(true)

function applyTheme(dark: boolean) {
  // #ifdef H5
  document.documentElement.classList.toggle('ot-dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  // #endif
  // #ifndef H5
  uni.setNavigationBarColor({
    frontColor: dark ? '#ffffff' : '#000000',
    backgroundColor: dark ? '#111317' : '#f5f6f8',
    fail: () => {},
  })
  uni.setBackgroundColor?.({ backgroundColor: dark ? '#111317' : '#f5f6f8', fail: () => {} } as any)
  // #endif
}

onShow(() => {
  const { path } = currRoute()
  // 线上首页路径可能是 '/'，同样视为 tabbar 页
  isCurrentPageTabbar.value = path === '/' || isPageTabbar(path)
  appStore.syncSystemTheme()
  applyTheme(appStore.isDark)
})

watch(() => appStore.isDark, applyTheme)
</script>

<template>
  <wd-config-provider :theme="appStore.isDark ? 'dark' : 'light'">
    <view class="ot-root" :class="{ 'ot-dark': appStore.isDark }">
      <KuRootView />
      <FgTabbar v-if="isCurrentPageTabbar" />
    </view>
  </wd-config-provider>
</template>

<style lang="scss">
.ot-root {
  min-height: 100vh;
  background-color: var(--ot-bg);
  color: var(--ot-text);
}
</style>
