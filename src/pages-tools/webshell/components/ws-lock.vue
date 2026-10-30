<script lang="ts" setup>
// 设置主密码 / 解锁
import { toast } from '@/utils/common'
import { data, resetAll, setup, unlock } from '../lib/store'

const pwd = ref('')
const confirm = ref('')
const remember = ref(false)
const busy = ref(false)
const show = ref(false)

const isSetup = computed(() => data.phase === 'setup')

async function submit() {
  if (busy.value)
    return
  if (!pwd.value)
    return toast('请输入主密码')
  if (isSetup.value) {
    if (pwd.value.length < 8)
      return toast('主密码至少 8 位')
    if (pwd.value !== confirm.value)
      return toast('两次输入的主密码不一致')
  }
  busy.value = true
  try {
    if (isSetup.value)
      await setup(pwd.value, remember.value)
    else
      await unlock(pwd.value, remember.value)
    pwd.value = ''
    confirm.value = ''
  }
  catch (e: any) {
    toast(e?.message || '操作失败')
  }
  finally {
    busy.value = false
  }
}

function forgot() {
  uni.showModal({
    title: '忘记主密码',
    content: '主密码只保存在你的记忆里，服务端无法找回。只能重置：删除所有服务器、密钥、快捷命令与设置后重新开始。确定重置吗？',
    confirmText: '重置',
    confirmColor: '#ef4444',
    success: async ({ confirm: ok }) => {
      if (!ok)
        return
      try {
        await resetAll()
        toast('已重置，请设置新的主密码')
      }
      catch (e: any) {
        toast(e?.message || '重置失败')
      }
    },
  })
}
</script>

<template>
  <view class="ws-lock">
    <view class="ws-lock__icon">
      <view :class="isSetup ? 'i-carbon-security' : 'i-carbon-locked'" />
    </view>
    <view class="mt-3 text-18px text-main font-600">
      {{ isSetup ? '设置主密码' : '输入主密码解锁' }}
    </view>
    <view class="mt-2 max-w-380px text-center text-13px text-muted leading-20px">
      <template v-if="isSetup">
        服务器地址、密码、私钥、快捷命令都会先在浏览器里用主密码加密，再同步到云端。本站只保存密文，任何人（包括站点管理员）都无法查看。
      </template>
      <template v-else>
        你的 WebShell 数据已加密，需要主密码才能打开。
      </template>
    </view>

    <view class="ws-lock__form">
      <view class="ws-form__field">
        <input
          v-model="pwd" class="min-w-0 flex-1" :password="!show" :placeholder="isSetup ? '主密码（至少 8 位）' : '主密码'"
          :maxlength="128" :focus="true" confirm-type="done" @confirm="isSetup ? undefined : submit()"
        >
        <view class="ws-form__icon" :class="show ? 'i-carbon-view-off' : 'i-carbon-view'" @click="show = !show" />
      </view>
      <view v-if="isSetup" class="ws-form__field mt-2">
        <input v-model="confirm" class="min-w-0 flex-1" :password="!show" placeholder="再次输入主密码" :maxlength="128" confirm-type="done" @confirm="submit">
      </view>
      <view class="mt-3 flex items-center gap-2 text-13px text-main">
        <wd-switch v-model="remember" size="18px" />
        <text>在此设备上记住（公共电脑请勿开启）</text>
      </view>
      <view v-if="isSetup" class="ws-lock__warn">
        <view class="i-carbon-warning-alt shrink-0 text-15px" />
        <text>主密码无法找回，也不能由管理员重置。忘记后只能清空 WebShell 数据重新开始，请务必记牢。</text>
      </view>
      <wd-button block custom-class="mt-4" :loading="busy" @click="submit">
        {{ isSetup ? '设置并开始使用' : '解锁' }}
      </wd-button>
      <view v-if="!isSetup" class="mt-3 text-center">
        <text class="ws-form__link text-12px" @click="forgot">忘记主密码？</text>
      </view>
      <view v-if="busy" class="mt-2 text-center text-12px text-muted">
        正在进行密钥运算，需要一两秒…
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.ws-lock {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 16px;
}

.ws-lock__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 18px;
  font-size: 32px;
  color: var(--wot-color-theme);
  background: color-mix(in srgb, var(--wot-color-theme) 12%, transparent);
}

.ws-lock__form {
  width: min(100%, 360px);
  margin-top: 20px;
}

.ws-lock__warn {
  display: flex;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 18px;
  color: #b45309;
  background: rgba(245, 158, 11, 0.12);
}
</style>
