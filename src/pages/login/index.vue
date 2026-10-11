<script lang="ts" setup>
import type { IAuthStatus } from '@/api/login'
import { getAuthStatus, register, setupAdmin } from '@/api/login'
import { isLoggedIn } from '@/router/auth'
import { useTokenStore } from '@/store/token'
import { useUserStore } from '@/store/user'
import { ensureDecodeURIComponent, HOME_PAGE } from '@/utils'
import { toast } from '@/utils/common'

definePage({
  layout: false,
  style: { navigationBarTitleText: '登录' },
})

type Mode = 'login' | 'setup' | 'register'

const tokenStore = useTokenStore()
const userStore = useUserStore()

const mode = ref<Mode>('login')
const status = ref<IAuthStatus>()
const loading = ref(false)
const redirect = ref('')
const form = reactive({ username: '', nickname: '', password: '', confirm: '' })

const texts = computed(() => ({
  login: { title: '登录 OTools', sub: '登录后即可使用全部工具', button: '登录' },
  setup: { title: '初始化管理员', sub: '首次使用，请创建管理员账号', button: '创建并登录' },
  register: { title: '注册账号', sub: '注册后即可使用全部工具', button: '注册并登录' },
}[mode.value]))

function goNext() {
  uni.reLaunch({ url: redirect.value || HOME_PAGE })
}

onLoad(async (query) => {
  redirect.value = query?.redirect ? ensureDecodeURIComponent(query.redirect) : ''
  if (isLoggedIn()) {
    goNext()
    return
  }
  try {
    status.value = await getAuthStatus()
    if (!status.value.initialized)
      mode.value = 'setup'
  }
  catch {
    // 网络错误已由 http 层提示，保持登录模式
  }
})

function switchMode(m: Mode) {
  mode.value = m
  form.password = ''
  form.confirm = ''
}

async function submit() {
  const username = form.username.trim()
  if (!username || !form.password)
    return toast('请输入用户名和密码')
  if (mode.value !== 'login') {
    if (form.password.length < 8)
      return toast('密码至少 8 位')
    if (form.password !== form.confirm)
      return toast('两次输入的密码不一致')
  }

  loading.value = true
  try {
    if (mode.value === 'login') {
      await tokenStore.login({ username, password: form.password })
    }
    else {
      const api = mode.value === 'setup' ? setupAdmin : register
      tokenStore.setTokenInfo(await api({ username, password: form.password, nickname: form.nickname.trim() }))
      await userStore.fetchUserInfo()
      toast('创建成功', 'success')
    }
    goNext()
  }
  catch {
    // 错误提示已由 http 层弹出
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <view class="ot-login">
    <view class="ot-login__card">
      <view class="mb-6 flex flex-col items-center">
        <view class="ot-login__logo">
          O
        </view>
        <view class="mt-3 text-20px text-main font-600">
          {{ texts.title }}
        </view>
        <view class="mt-1 text-13px text-muted">
          {{ texts.sub }}
        </view>
      </view>

      <view class="flex flex-col gap-3">
        <view class="ot-login__field">
          <view class="i-carbon-user text-16px text-muted" />
          <wd-input
            v-model="form.username" placeholder="用户名" clearable no-border
            custom-class="flex-1" :maxlength="32" @confirm="submit"
          />
        </view>
        <view v-if="mode !== 'login'" class="ot-login__field">
          <view class="i-carbon-user-avatar text-16px text-muted" />
          <wd-input v-model="form.nickname" placeholder="昵称（可选）" clearable no-border custom-class="flex-1" :maxlength="32" />
        </view>
        <view class="ot-login__field">
          <view class="i-carbon-locked text-16px text-muted" />
          <wd-input
            v-model="form.password" :placeholder="mode === 'login' ? '密码' : '密码（至少 8 位）'"
            show-password no-border custom-class="flex-1" :maxlength="128" @confirm="submit"
          />
        </view>
        <view v-if="mode !== 'login'" class="ot-login__field">
          <view class="i-carbon-locked text-16px text-muted" />
          <wd-input
            v-model="form.confirm" placeholder="确认密码" show-password no-border
            custom-class="flex-1" :maxlength="128" @confirm="submit"
          />
        </view>
      </view>

      <wd-button block size="large" custom-class="mt-6" :loading="loading" @click="submit">
        {{ texts.button }}
      </wd-button>

      <view class="mt-4 text-center text-13px text-muted">
        <template v-if="mode === 'login'">
          <text v-if="status?.allowRegister" class="ot-login__link" @click="switchMode('register')">没有账号？立即注册</text>
          <text v-else>没有账号？请联系管理员创建</text>
        </template>
        <text v-else-if="mode === 'register'" class="ot-login__link" @click="switchMode('login')">已有账号？去登录</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.ot-login {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 48px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ot-bg);
}

.ot-login__card {
  box-sizing: border-box;
  width: 100%;
  max-width: 400px;
  padding: 32px 24px;
  border-radius: 18px;
  background: var(--ot-card);
  border: 1px solid var(--ot-border);
  box-shadow: var(--ot-shadow);
}

.ot-login__logo {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: linear-gradient(135deg, #4f6ef7, #8b5cf6);
  color: #fff;
  font-weight: 700;
  font-size: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ot-login__field {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  border-radius: 10px;
  background: var(--ot-fill);

  :deep(.wd-input) {
    background: transparent;
  }
}

.ot-login__link {
  color: var(--wot-color-theme);
  cursor: pointer;
}
</style>
