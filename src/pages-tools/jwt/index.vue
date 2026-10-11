<script lang="ts" setup>
import type { DecodedJwt } from './jwt'
import dayjs from 'dayjs'
import { copyText } from '@/utils/common'
import { CLAIM_LABELS, decodeJwt, isHmacAlg, jwtState, TIME_CLAIMS, verifyHmac } from './jwt'

definePage({
  style: { navigationBarTitleText: 'JWT 解析' },
})

// jwt.io 的示例，密钥为 your-256-bit-secret
const SAMPLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

const token = ref('')
const secret = ref('')
const secretIsBase64 = ref(false)
const now = ref(Math.floor(Date.now() / 1000))

// 每秒刷新，过期状态与剩余时间实时变化
let timer: ReturnType<typeof setInterval> | undefined
onShow(() => {
  timer = setInterval(() => (now.value = Math.floor(Date.now() / 1000)), 1000)
})
onHide(() => clearInterval(timer))
onUnload(() => clearInterval(timer))

const result = computed<{ jwt?: DecodedJwt, error?: string }>(() => {
  if (!token.value.trim())
    return {}
  try {
    return { jwt: decodeJwt(token.value) }
  }
  catch (e: any) {
    return { error: e.message }
  }
})
const jwt = computed(() => result.value.jwt)

const state = computed(() => (jwt.value ? jwtState(jwt.value.payload, now.value) : undefined))

const pretty = (o: unknown) => JSON.stringify(o, null, 2)

/** 声明列表：标准声明带中文说明，时间类声明转成可读时间 */
const claims = computed(() => {
  if (!jwt.value)
    return []
  return Object.entries(jwt.value.payload).map(([key, value]) => {
    const isTime = TIME_CLAIMS.includes(key) && typeof value === 'number'
    return {
      key,
      label: CLAIM_LABELS[key] || '',
      value: typeof value === 'string' ? value : JSON.stringify(value),
      time: isTime ? dayjs(value * 1000).format('YYYY-MM-DD HH:mm:ss') : '',
    }
  })
})

const alg = computed(() => String(jwt.value?.header.alg ?? ''))
const algWarning = computed(() => (alg.value.toLowerCase() === 'none' ? '算法为 none：该 token 没有签名，任何人都能伪造，服务端绝不应接受' : ''))

const verify = computed<{ ok?: boolean, error?: string }>(() => {
  if (!jwt.value || !secret.value)
    return {}
  try {
    return { ok: verifyHmac(jwt.value, secret.value, secretIsBase64.value) }
  }
  catch (e: any) {
    return { error: e.message }
  }
})

function useSample() {
  token.value = SAMPLE
  secret.value = 'your-256-bit-secret'
  secretIsBase64.value = false
}
</script>

<template>
  <ot-tool-layout>
    <ot-panel title="JWT">
      <template #extra>
        <wd-button size="small" type="info" plain @click="useSample">
          示例
        </wd-button>
        <wd-button size="small" type="info" plain :disabled="!token" @click="token = ''">
          清空
        </wd-button>
      </template>
      <ot-textarea v-model="token" :height="110" placeholder="粘贴 JWT，可带 Bearer 前缀" />
      <view v-if="jwt" class="ot-jwt__colored ot-mono">
        <text class="text-[#ef4444]">{{ jwt.parts[0] }}</text>.<text class="text-[#8b5cf6]">{{ jwt.parts[1] }}</text>.<text class="text-[#0ea5e9]">{{ jwt.parts[2] || '（无签名）' }}</text>
      </view>
      <view v-if="result.error" class="ot-jwt__msg is-error">
        <view class="i-carbon-warning-filled shrink-0" />
        <text>{{ result.error }}</text>
      </view>
    </ot-panel>

    <template v-if="jwt">
      <view v-if="state" class="ot-jwt__msg" :class="`is-${state.state}`">
        <view :class="state.state === 'valid' ? 'i-carbon-checkmark-filled' : state.state === 'noExp' ? 'i-carbon-information-filled' : 'i-carbon-time'" class="shrink-0" />
        <text>{{ state.text }}</text>
      </view>
      <view v-if="algWarning" class="ot-jwt__msg is-error">
        <view class="i-carbon-warning-filled shrink-0" />
        <text>{{ algWarning }}</text>
      </view>

      <view class="flex flex-col gap-3 md:flex-row">
        <ot-panel title="头部 Header" class="min-w-0 md:flex-1">
          <template #extra>
            <view class="i-carbon-copy cursor-pointer text-16px text-muted" @click="copyText(pretty(jwt.header))" />
          </template>
          <text class="ot-jwt__json ot-mono text-[#ef4444]" user-select selectable>{{ pretty(jwt.header) }}</text>
        </ot-panel>
        <ot-panel title="载荷 Payload" class="min-w-0 md:flex-[2]">
          <template #extra>
            <view class="i-carbon-copy cursor-pointer text-16px text-muted" @click="copyText(pretty(jwt.payload))" />
          </template>
          <text class="ot-jwt__json ot-mono text-[#8b5cf6]" user-select selectable>{{ pretty(jwt.payload) }}</text>
        </ot-panel>
      </view>

      <ot-panel title="声明说明">
        <view v-for="c in claims" :key="c.key" class="ot-jwt__claim">
          <view class="w-120px shrink-0">
            <text class="ot-mono text-13px text-main">{{ c.key }}</text>
            <view v-if="c.label" class="text-12px text-muted">
              {{ c.label }}
            </view>
          </view>
          <view class="min-w-0 flex-1">
            <text class="ot-mono break-all text-13px text-main" user-select selectable>{{ c.value }}</text>
            <view v-if="c.time" class="text-12px text-muted">
              {{ c.time }}
            </view>
          </view>
        </view>
      </ot-panel>

      <ot-panel title="签名校验">
        <template v-if="isHmacAlg(alg)">
          <view class="ot-jwt__field">
            <input v-model="secret" class="ot-mono min-w-0 flex-1 text-14px" :placeholder="`输入 ${alg} 密钥`">
          </view>
          <view class="mt-2 flex items-center justify-between">
            <text class="text-13px text-sub">密钥是 Base64 编码</text>
            <wd-switch v-model="secretIsBase64" size="18px" />
          </view>
          <view v-if="verify.ok !== undefined" class="ot-jwt__msg" :class="verify.ok ? 'is-valid' : 'is-error'">
            <view :class="verify.ok ? 'i-carbon-checkmark-filled' : 'i-carbon-close-filled'" class="shrink-0" />
            <text>{{ verify.ok ? '签名有效' : '签名无效：密钥不正确或 token 被篡改' }}</text>
          </view>
          <view v-if="verify.error" class="ot-jwt__msg is-error">
            {{ verify.error }}
          </view>
        </template>
        <view v-else class="text-13px text-muted leading-22px">
          当前算法为 {{ alg || '未知' }}，暂只支持校验 HS256 / HS384 / HS512 签名。RS / ES 等非对称算法需要公钥，请在服务端校验。
        </view>
        <view class="mt-3 text-12px text-muted">
          解析与校验均在本地完成，token 与密钥不会上传。
        </view>
      </ot-panel>
    </template>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-jwt__colored {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--ot-fill);
  font-size: 12px;
  line-height: 1.6;
  word-break: break-all;
  color: var(--ot-text-3);
}

.ot-jwt__msg {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;

  &.is-valid {
    color: #059669;
    background: rgba(16, 185, 129, 0.1);
  }

  &.is-expired,
  &.is-error {
    color: #dc2626;
    background: rgba(239, 68, 68, 0.08);
  }

  &.is-notYet {
    color: #b45309;
    background: rgba(245, 158, 11, 0.12);
  }

  &.is-noExp {
    color: var(--ot-text-2);
    background: var(--ot-fill);
  }
}

.ot-jwt__json {
  display: block;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 13px;
  line-height: 1.6;
}

.ot-jwt__claim {
  display: flex;
  gap: 12px;
  padding: 10px 0;

  & + & {
    border-top: 1px solid var(--ot-border);
  }
}

.ot-jwt__field {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  background: var(--ot-fill);
  color: var(--ot-text);
}
</style>
