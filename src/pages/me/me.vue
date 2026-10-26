<script lang="ts" setup>
import type { ThemeMode } from '@/store/app'
import { changePassword } from '@/api/login'
import { LOGIN_PAGE } from '@/router/auth'
import { useAppStore } from '@/store/app'
import { useTokenStore } from '@/store/token'
import { useToolStore } from '@/store/tool'
import { useUserStore } from '@/store/user'
import { tools } from '@/tools/registry'
import { toast } from '@/utils/common'
import { promptInstall, pwaState } from '@/utils/pwa'

definePage({
  style: {
    navigationBarTitleText: '我的',
  },
})

const appStore = useAppStore()
const toolStore = useToolStore()
const tokenStore = useTokenStore()
const userStore = useUserStore()

const user = computed(() => userStore.userInfo)
const isAdmin = computed(() => user.value.role === 'admin')

const remindSettings = ref<{ refresh: () => void }>()

onShow(() => {
  // 同步最新的角色 / 昵称（可能被管理员修改过）
  userStore.fetchUserInfo().catch(() => {})
  remindSettings.value?.refresh()
})

function goAdmin() {
  uni.navigateTo({ url: '/pages-admin/users/index' })
}

function logout() {
  uni.showModal({
    title: '退出登录',
    content: '确定退出当前账号吗？',
    success: async ({ confirm }) => {
      if (!confirm)
        return
      await tokenStore.logout()
      uni.reLaunch({ url: LOGIN_PAGE })
    },
  })
}

/* ---------------- 修改密码 ---------------- */

const showPwd = ref(false)
const savingPwd = ref(false)
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirm: '' })

function openChangePassword() {
  Object.assign(pwdForm, { oldPassword: '', newPassword: '', confirm: '' })
  showPwd.value = true
}

async function submitPassword() {
  if (!pwdForm.oldPassword || !pwdForm.newPassword)
    return toast('请填写原密码和新密码')
  if (pwdForm.newPassword.length < 8)
    return toast('新密码至少 8 位')
  if (pwdForm.newPassword !== pwdForm.confirm)
    return toast('两次输入的新密码不一致')
  savingPwd.value = true
  try {
    await changePassword({ oldPassword: pwdForm.oldPassword, newPassword: pwdForm.newPassword })
    showPwd.value = false
    toast('密码已修改', 'success')
  }
  catch {
    // 错误提示已由 http 层弹出
  }
  finally {
    savingPwd.value = false
  }
}

const themeOptions: { value: ThemeMode, label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'auto', label: '跟随系统' },
]
const themeMode = computed({
  get: () => appStore.themeMode,
  set: (v: ThemeMode) => appStore.setThemeMode(v),
})

function clearRecent() {
  toolStore.clearRecent()
  toast('已清空', 'success')
}

/* ---------------- 安装到桌面（H5 / PWA） ---------------- */

async function installApp() {
  if (pwaState.canPrompt.value) {
    if (await promptInstall())
      toast('已安装，可从桌面或主屏幕打开', 'success')
    return
  }
  uni.showModal({
    title: '添加到主屏幕',
    content: '在 Safari 中点击底部的「分享」按钮，选择「添加到主屏幕」即可像应用一样打开 OTools。',
    showCancel: false,
    confirmText: '知道了',
  })
}

const version = '1.0.0'
</script>

<template>
  <view class="ot-container flex flex-col gap-3 pb-6 pt-4 md:pt-6" style="max-width: 960px">
    <ot-panel>
      <view class="flex items-center gap-3">
        <view class="ot-me__avatar">
          {{ (user.nickname || user.username || '?').slice(0, 1).toUpperCase() }}
        </view>
        <view class="min-w-0 flex-1">
          <view class="flex items-center gap-1.5">
            <text class="truncate text-16px text-main font-600">{{ user.nickname || user.username }}</text>
            <wd-tag :type="isAdmin ? 'primary' : 'default'" plain>
              {{ isAdmin ? '管理员' : '用户' }}
            </wd-tag>
          </view>
          <view class="mt-2px text-12px text-muted">
            @{{ user.username }}
          </view>
        </view>
      </view>
      <view class="mt-3">
        <view v-if="isAdmin" class="ot-row" @click="goAdmin">
          <text>用户管理</text>
          <view class="i-carbon-chevron-right text-muted" />
        </view>
        <view class="ot-row" @click="openChangePassword">
          <text>修改密码</text>
          <view class="i-carbon-chevron-right text-muted" />
        </view>
        <view class="ot-row" @click="logout">
          <text class="text-red-500">退出登录</text>
          <view class="i-carbon-logout text-muted" />
        </view>
      </view>
    </ot-panel>

    <!-- #ifdef H5 -->
    <ot-panel v-if="pwaState.canPrompt.value || pwaState.needManual.value" title="应用">
      <view class="ot-row" @click="installApp">
        <view class="flex items-center gap-2">
          <view class="i-carbon-download text-muted" />
          <text>安装到{{ pwaState.needManual.value ? '主屏幕' : '桌面' }}</text>
        </view>
        <text class="text-12px text-muted">像应用一样独立窗口打开</text>
      </view>
    </ot-panel>
    <!-- #endif -->

    <ot-remind-settings ref="remindSettings" />

    <ot-panel title="外观">
      <ot-segmented v-model="themeMode" :options="themeOptions" />
    </ot-panel>

    <ot-panel :title="`我的收藏 · ${toolStore.favorites.length}`">
      <view v-if="toolStore.favorites.length" class="ot-grid">
        <ot-tool-card v-for="tool in toolStore.favorites" :key="tool.id" :tool="tool" />
      </view>
      <view v-else class="py-6 text-center text-13px text-muted">
        点击工具卡片右上角的 ☆ 即可收藏
      </view>
    </ot-panel>

    <ot-panel title="数据">
      <view class="ot-row" @click="clearRecent">
        <text>清空最近使用</text>
        <text class="text-muted">{{ toolStore.recentIds.length }} 条</text>
      </view>
      <view class="mt-2 text-12px text-muted">
        除「密码管理」需要同步到服务端（加密存储）外，其余工具均在本地运行，输入内容不会上传到任何服务器。
      </view>
    </ot-panel>

    <ot-panel title="关于">
      <view class="ot-row">
        <text>版本</text>
        <text class="text-muted">v{{ version }}</text>
      </view>
      <view class="ot-row">
        <text>工具数量</text>
        <text class="text-muted">{{ tools.length }}</text>
      </view>
      <view class="mt-2 text-12px text-muted leading-20px">
        基于 uni-app、unibest、wot-design-uni、UnoCSS 等开源项目构建。
      </view>
    </ot-panel>

    <wd-popup
      v-model="showPwd" position="center" :z-index="1000" closable
      custom-style="width: 92vw; max-width: 400px; border-radius: 16px;"
    >
      <view class="ot-me__form">
        <view class="mb-4 text-16px text-main font-600">
          修改密码
        </view>
        <view class="ot-me__field">
          <input v-model="pwdForm.oldPassword" class="flex-1" password placeholder="原密码" :maxlength="128">
        </view>
        <view class="ot-me__field">
          <input v-model="pwdForm.newPassword" class="flex-1" password placeholder="新密码（至少 8 位）" :maxlength="128">
        </view>
        <view class="ot-me__field">
          <input v-model="pwdForm.confirm" class="flex-1" password placeholder="确认新密码" :maxlength="128">
        </view>
        <view class="mt-2 text-12px text-muted">
          修改后其他设备上的登录将失效。
        </view>
        <view class="mt-5 flex justify-end gap-2">
          <wd-button type="info" plain @click="showPwd = false">
            取消
          </wd-button>
          <wd-button :loading="savingPwd" @click="submitPassword">
            确定
          </wd-button>
        </view>
      </view>
    </wd-popup>
  </view>
</template>

<style lang="scss" scoped>
.ot-me__avatar {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #4f6ef7, #8b5cf6);
  color: #fff;
  font-size: 20px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ot-me__form {
  box-sizing: border-box;
  padding: 20px;
  background: var(--ot-card);
  color: var(--ot-text);
}

.ot-me__field {
  display: flex;
  align-items: center;
  min-height: 40px;
  padding: 0 12px;
  margin-top: 10px;
  border-radius: 10px;
  background: var(--ot-fill);
  font-size: 14px;
}

.ot-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  font-size: 14px;
  color: var(--ot-text);
  cursor: pointer;

  & + & {
    border-top: 1px solid var(--ot-border);
  }
}
</style>
