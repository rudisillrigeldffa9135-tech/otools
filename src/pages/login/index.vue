<script lang="ts" setup>
import type { IAuthStatus } from '@/api/login'
import type { HttpError } from '@/http/types'
import { getAuthStatus, login, register, setupAdmin } from '@/api/login'
import { isLoggedIn } from '@/router/auth'
import { useAppStore } from '@/store/app'
import { useTokenStore } from '@/store/token'
import { useUserStore } from '@/store/user'
import { ensureDecodeURIComponent, HOME_PAGE } from '@/utils'
import { toast } from '@/utils/common'

definePage({
  layout: false,
  style: { navigationBarTitleText: '登录' },
})

type Mode = 'login' | 'setup' | 'register'
type Field = 'username' | 'nickname' | 'password' | 'confirm'

const appStore = useAppStore()
const tokenStore = useTokenStore()
const userStore = useUserStore()

const mode = ref<Mode>('login')
const status = ref<IAuthStatus>()
const loading = ref(false)
const redirect = ref('')
const form = reactive<Record<Field, string>>({ username: '', nickname: '', password: '', confirm: '' })
/** 当前聚焦的输入框（小程序不支持 :focus-within，用状态驱动聚焦样式） */
const focused = ref<Field | ''>('')
const showPassword = ref(false)
/** 表单内的错误提示，比一闪而过的 toast 更容易看到 */
const error = ref('')

const isCreate = computed(() => mode.value !== 'login')

const texts = computed(() => ({
  login: { title: '欢迎回来', sub: '登录后即可使用全部工具', button: '登录' },
  setup: { title: '初始化管理员', sub: '首次使用，请创建管理员账号', button: '创建并登录' },
  register: { title: '注册账号', sub: '注册后即可使用全部工具', button: '注册并登录' },
}[mode.value]))

// 修改任意输入后清除错误提示
watch(form, () => {
  error.value = ''
})

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
  error.value = ''
}

/** 前端预校验，规则与服务端（worker/src/lib.ts）一致 */
function validate() {
  const username = form.username.trim()
  if (!username)
    return '请输入用户名'
  if (!form.password)
    return '请输入密码'
  if (isCreate.value) {
    if (!/^[\w.-]{3,32}$/.test(username))
      return '用户名需为 3~32 位字母、数字、下划线、点或短横线'
    if (form.password.length < 8)
      return '密码至少 8 位'
    if (form.password !== form.confirm)
      return '两次输入的密码不一致'
  }
  return ''
}

async function submit() {
  if (loading.value)
    return
  error.value = validate()
  if (error.value)
    return

  loading.value = true
  const payload = { username: form.username.trim(), password: form.password, nickname: form.nickname.trim() }
  // 错误统一显示在表单里，不再额外弹 toast
  const options = { hideErrorToast: true }
  try {
    const res = mode.value === 'login'
      ? await login({ username: payload.username, password: payload.password }, options)
      : await (mode.value === 'setup' ? setupAdmin : register)(payload, options)
    tokenStore.setTokenInfo(res)
    await userStore.fetchUserInfo()
    toast(mode.value === 'login' ? '登录成功' : '创建成功', 'success')
    goNext()
  }
  catch (e) {
    error.value = (e as HttpError)?.message || '请求失败，请稍后重试'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <view class="ot-login">
    <view class="ot-login__theme" @click="appStore.toggleDark()">
      <view :class="appStore.isDark ? 'i-carbon-sun' : 'i-carbon-moon'" class="text-18px" />
    </view>

    <view class="ot-login__wrap">
      <view class="mb-7 flex items-center justify-center gap-2">
        <view class="ot-login__logo">
          O
        </view>
        <text class="text-20px text-main font-700">OTools</text>
      </view>

      <view class="ot-login__card">
        <view class="text-22px text-main font-600">
          {{ texts.title }}
        </view>
        <view class="mt-1 text-14px text-muted">
          {{ texts.sub }}
        </view>

        <view v-if="mode === 'setup'" class="ot-login__notice">
          <view class="i-carbon-information mt-2px shrink-0 text-16px" />
          <text>系统还没有任何账号，这里创建的第一个账号将成为管理员，之后可以在「我的 → 用户管理」中添加其他用户。</text>
        </view>

        <view class="mt-6 flex flex-col gap-4">
          <view>
            <view class="ot-login__label">
              用户名
            </view>
            <view class="ot-login__field" :class="{ 'is-focused': focused === 'username' }">
              <view class="i-carbon-user ot-login__icon" />
              <input
                v-model="form.username" class="ot-login__input" type="text"
                :placeholder="isCreate ? '3~32 位字母、数字、_ . -' : '请输入用户名'"
                placeholder-class="ot-login__placeholder" :maxlength="32" confirm-type="next"
                @focus="focused = 'username'" @blur="focused = ''" @confirm="submit"
              >
            </view>
          </view>

          <view v-if="isCreate">
            <view class="ot-login__label">
              昵称 <text class="text-muted font-400">（可选）</text>
            </view>
            <view class="ot-login__field" :class="{ 'is-focused': focused === 'nickname' }">
              <view class="i-carbon-user-avatar ot-login__icon" />
              <input
                v-model="form.nickname" class="ot-login__input" type="text" placeholder="显示的名字"
                placeholder-class="ot-login__placeholder" :maxlength="32"
                @focus="focused = 'nickname'" @blur="focused = ''"
              >
            </view>
          </view>

          <view>
            <view class="ot-login__label">
              密码
            </view>
            <view class="ot-login__field" :class="{ 'is-focused': focused === 'password' }">
              <view class="i-carbon-locked ot-login__icon" />
              <input
                v-model="form.password" class="ot-login__input" :password="!showPassword"
                :placeholder="isCreate ? '至少 8 位' : '请输入密码'"
                placeholder-class="ot-login__placeholder" :maxlength="128" confirm-type="done"
                @focus="focused = 'password'" @blur="focused = ''" @confirm="submit"
              >
              <view
                class="ot-login__eye" :class="showPassword ? 'i-carbon-view-off' : 'i-carbon-view'"
                @click="showPassword = !showPassword"
              />
            </view>
          </view>

          <view v-if="isCreate">
            <view class="ot-login__label">
              确认密码
            </view>
            <view class="ot-login__field" :class="{ 'is-focused': focused === 'confirm' }">
              <view class="i-carbon-locked ot-login__icon" />
              <input
                v-model="form.confirm" class="ot-login__input" :password="!showPassword" placeholder="再输入一次密码"
                placeholder-class="ot-login__placeholder" :maxlength="128" confirm-type="done"
                @focus="focused = 'confirm'" @blur="focused = ''" @confirm="submit"
              >
            </view>
          </view>
        </view>

        <view v-if="error" class="ot-login__error">
          <view class="i-carbon-warning-filled shrink-0 text-15px" />
          <text>{{ error }}</text>
        </view>

        <wd-button block size="large" :round="false" custom-class="ot-login__submit" :loading="loading" @click="submit">
          {{ texts.button }}
        </wd-button>

        <view v-if="mode !== 'setup'" class="mt-5 text-center text-13px text-muted">
          <template v-if="mode === 'login'">
            <text v-if="status?.allowRegister">
              还没有账号？<text class="ot-login__link" @click="switchMode('register')">立即注册</text>
            </text>
            <text v-else>没有账号？请联系管理员创建</text>
          </template>
          <text v-else>
            已有账号？<text class="ot-login__link" @click="switchMode('login')">去登录</text>
          </text>
        </view>
      </view>

      <view class="mt-6 text-center text-12px text-muted">
        简单好用的在线工具箱
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.ot-login {
  position: relative;
  box-sizing: border-box;
  min-height: 100vh;
  padding: 56px 16px 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background:
    radial-gradient(600px 400px at 0% 0%, rgba(79, 110, 247, 0.14), transparent 70%),
    radial-gradient(500px 400px at 100% 100%, rgba(139, 92, 246, 0.12), transparent 70%), var(--ot-bg);
}

.ot-login__theme {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ot-text-2);
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
  }
}

.ot-login__wrap {
  width: 100%;
  max-width: 420px;
}

.ot-login__logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #4f6ef7, #8b5cf6);
  color: #fff;
  font-weight: 700;
  font-size: 19px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 16px rgba(79, 110, 247, 0.35);
}

.ot-login__card {
  box-sizing: border-box;
  padding: 32px 28px 28px;
  border-radius: 20px;
  background: var(--ot-card);
  border: 1px solid var(--ot-border);
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    0 12px 32px rgba(15, 23, 42, 0.08);
}

@media (max-width: 420px) {
  .ot-login__card {
    padding: 28px 20px 24px;
  }
}

.ot-login__notice {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
  color: #3b5bdb;
  background: rgba(79, 110, 247, 0.08);
}

.ot-login__label {
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--ot-text-2);
}

.ot-login__field {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 46px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1.5px solid var(--ot-border);
  background: var(--ot-card);
  transition:
    border-color 0.15s,
    box-shadow 0.15s;

  &.is-focused {
    border-color: var(--wot-color-theme);
    box-shadow: 0 0 0 3px rgba(79, 110, 247, 0.15);
  }
}

.ot-login__icon {
  flex-shrink: 0;
  font-size: 17px;
  color: var(--ot-text-3);
}

.ot-login__field.is-focused .ot-login__icon {
  color: var(--wot-color-theme);
}

.ot-login__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  font-size: 15px;
  color: var(--ot-text);
}

:deep(.ot-login__placeholder) {
  color: var(--ot-text-3);
}

.ot-login__eye {
  flex-shrink: 0;
  padding: 4px;
  font-size: 17px;
  color: var(--ot-text-3);
  cursor: pointer;

  &:hover {
    color: var(--ot-text);
  }
}

.ot-login__error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: #dc2626;
  background: rgba(239, 68, 68, 0.08);
}

:deep(.ot-login__submit) {
  height: 48px !important;
  margin-top: 24px;
  border-radius: 12px !important;
  font-size: 16px !important;
  font-weight: 500;
}

.ot-login__link {
  color: var(--wot-color-theme);
  font-weight: 500;
  cursor: pointer;
}
</style>
