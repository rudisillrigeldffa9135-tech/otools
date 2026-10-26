<script setup lang="ts">
// 仅 H5 使用：替代 uni 自带导航栏，宽屏时显示横向导航（底部 tabbar 会隐藏）
import { getUnreadCount } from '@/api/notify'
import { isLoggedIn } from '@/router/auth'
import { useAppStore } from '@/store/app'
import { customTabbarList } from '@/tabbar/config'
import { getToolByPath } from '@/tools/registry'
import { currRoute, HOME_PAGE } from '@/utils'

const appStore = useAppStore()
const navs = customTabbarList.map(item => ({ text: item.text, icon: item.icon, path: `/${item.pagePath}` }))

const path = ref('')
/** 未读提醒数；每次切换页面时刷新，30 秒内不重复请求 */
const unread = ref(0)
const loggedIn = ref(false)
let lastFetch = 0
onShow(() => {
  path.value = currRoute().path
  loggedIn.value = isLoggedIn()
  if (loggedIn.value && (Date.now() - lastFetch > 30_000 || path.value === '/pages/notify/index')) {
    lastFetch = Date.now()
    getUnreadCount().then(r => (unread.value = r.unread)).catch(() => {})
  }
})

function goNotify() {
  lastFetch = 0
  uni.navigateTo({ url: '/pages/notify/index' })
}

const isTabPage = computed(() => path.value === '/' || navs.some(n => n.path === path.value))
const tool = computed(() => getToolByPath(path.value))
const title = computed(() => tool.value?.name || '')

function isActive(navPath: string) {
  return path.value === navPath || (path.value === '/' && navPath === HOME_PAGE)
}

function go(navPath: string) {
  if (!isActive(navPath))
    uni.switchTab({ url: navPath })
}

function goBack() {
  // 直接通过链接打开工具页时没有上一页，回到首页
  if (getCurrentPages().length > 1)
    uni.navigateBack()
  else
    uni.switchTab({ url: HOME_PAGE })
}
</script>

<template>
  <view class="ot-header">
    <view class="ot-container h-56px flex items-center gap-2">
      <view v-if="!isTabPage" class="ot-header__icon-btn" @click="goBack">
        <view class="i-carbon-chevron-left text-22px" />
      </view>

      <view class="ot-header__brand" :class="{ 'is-sub': !isTabPage }" @click="go(HOME_PAGE)">
        <view class="ot-header__logo">
          O
        </view>
        <text class="text-17px text-main font-600">OTools</text>
      </view>

      <template v-if="title">
        <view class="i-carbon-chevron-right text-14px text-muted max-md:hidden" />
        <text class="truncate text-15px text-main font-500">{{ title }}</text>
      </template>

      <view class="flex-1" />

      <view class="flex items-center gap-1 max-md:hidden">
        <view
          v-for="nav in navs" :key="nav.path"
          class="ot-header__nav" :class="{ 'is-active': isActive(nav.path) }"
          @click="go(nav.path)"
        >
          {{ nav.text }}
        </view>
      </view>

      <view v-if="loggedIn && path !== '/pages/notify/index'" class="ot-header__icon-btn relative" title="提醒" @click="goNotify">
        <view class="i-carbon-notification text-18px" />
        <text v-if="unread" class="ot-header__badge">{{ unread > 99 ? '99+' : unread }}</text>
      </view>
      <view class="ot-header__icon-btn" @click="appStore.toggleDark()">
        <view :class="appStore.isDark ? 'i-carbon-sun' : 'i-carbon-moon'" class="text-18px" />
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.ot-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: color-mix(in srgb, var(--ot-bg) 82%, transparent);
  backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid var(--ot-border);
}

.ot-header__badge {
  position: absolute;
  top: 2px;
  right: 0;
  min-width: 16px;
  padding: 0 4px;
  border-radius: 999px;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  color: #fff;
  background: #ef4444;
}

.ot-header__brand {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

// 手机端的二级页面只显示返回和标题
@media (max-width: 767.9px) {
  .ot-header__brand.is-sub {
    display: none;
  }
}

.ot-header__logo {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: linear-gradient(135deg, #4f6ef7, #8b5cf6);
  color: #fff;
  font-weight: 700;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ot-header__nav {
  padding: 6px 14px;
  border-radius: 8px;
  color: var(--ot-text-2);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: var(--ot-fill);
    color: var(--ot-text);
  }

  &.is-active {
    color: var(--wot-color-theme);
    font-weight: 500;
  }
}

.ot-header__icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ot-text-2);
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
  }
}
</style>
