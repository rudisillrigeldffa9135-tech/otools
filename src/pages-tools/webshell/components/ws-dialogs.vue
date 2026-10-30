<script lang="ts" setup>
// 连接过程中的对话框：确认主机密钥（首次连接 / 密钥变化）、键盘交互认证（动态口令等）
import { copyText } from '@/utils/common'
import { dialogs } from '../lib/dialogs'
import { hostLabel } from '../lib/types'

const current = computed(() => dialogs[0])
const answers = ref<string[]>([])

watch(current, (d) => {
  answers.value = d?.type === 'prompt' ? d.req.questions.map(() => '') : []
})

const open = computed({
  get: () => !!current.value,
  set: (v) => {
    // 点遮罩关闭视为拒绝 / 取消
    if (!v && current.value) {
      const d = current.value
      if (d.type === 'hostkey')
        d.resolve('reject')
      else
        d.resolve(null)
    }
  },
})

/** 主机密钥类型对应的服务器端公钥文件名 */
function keyFile(type: string) {
  return type.includes('ed25519') ? 'ed25519' : type.startsWith('ecdsa') ? 'ecdsa' : 'rsa'
}

function submitPrompt() {
  const d = current.value
  if (d?.type === 'prompt')
    d.resolve([...answers.value])
}
</script>

<template>
  <wd-popup v-model="open" position="center" :z-index="1150" custom-style="border-radius: 16px; width: min(92vw, 460px);">
    <view v-if="current" class="ws-form">
      <template v-if="current.type === 'hostkey'">
        <template v-if="current.previous">
          <view class="flex items-center gap-2 text-16px text-red-500 font-600">
            <view class="i-carbon-warning-filled text-20px" />主机密钥已变化
          </view>
          <view class="mt-2 text-13px text-main leading-20px">
            「{{ current.host.name || current.host.host }}」（{{ hostLabel(current.host) }}）的主机密钥与上次信任的不一致。
            可能是服务器重装了系统，也可能有人在冒充这台服务器（中间人攻击）。不确定时请不要继续。
          </view>
          <view class="ws-fp">
            <view class="text-11px text-muted">
              之前（{{ current.previous.type }}）
            </view>
            <view class="ot-mono break-all text-12px line-through">
              {{ current.previous.fingerprint }}
            </view>
            <view class="mt-2 text-11px text-muted">
              现在（{{ current.info.type }}）
            </view>
            <view class="ot-mono break-all text-12px text-main">
              {{ current.info.fingerprint }}
            </view>
          </view>
          <view class="mt-4 flex flex-wrap justify-end gap-2">
            <wd-button type="error" plain @click="current.resolve('trust')">
              我确认，更新并连接
            </wd-button>
            <wd-button @click="current.resolve('reject')">
              不连接
            </wd-button>
          </view>
        </template>
        <template v-else>
          <view class="text-16px text-main font-600">
            首次连接，请确认服务器身份
          </view>
          <view class="mt-2 text-13px text-main leading-20px">
            这是第一次连接「{{ current.host.name || current.host.host }}」（{{ hostLabel(current.host) }}）。
            如需核对，可在服务器上执行 <text class="ot-mono text-12px">ssh-keygen -lf /etc/ssh/ssh_host_{{ keyFile(current.info.type) }}_key.pub</text> 对比指纹。
          </view>
          <view class="ws-fp" @click="copyText(current.info.fingerprint)">
            <view class="text-11px text-muted">
              {{ current.info.type }} 指纹
            </view>
            <view class="ot-mono break-all text-12px text-main">
              {{ current.info.fingerprint }}
            </view>
          </view>
          <view class="mt-4 flex flex-wrap justify-end gap-2">
            <wd-button type="info" plain @click="current.resolve('reject')">
              取消
            </wd-button>
            <wd-button type="info" plain @click="current.resolve('once')">
              仅本次
            </wd-button>
            <wd-button @click="current.resolve('trust')">
              信任并连接
            </wd-button>
          </view>
        </template>
      </template>

      <template v-else>
        <view class="text-16px text-main font-600">
          {{ current.req.name || '服务器需要验证' }}
        </view>
        <view class="mt-1 text-12px text-muted">
          {{ hostLabel(current.host) }}
        </view>
        <view v-if="current.req.instruction" class="mt-2 whitespace-pre-wrap text-13px text-main">
          {{ current.req.instruction }}
        </view>
        <view v-for="(q, i) in current.req.questions" :key="i">
          <view class="ws-form__label">
            {{ q.prompt.trim() }}
          </view>
          <view class="ws-form__field">
            <input
              v-model="answers[i]" class="ot-mono min-w-0 flex-1" :password="!q.echo" :focus="i === 0"
              confirm-type="done" @confirm="i === current.req.questions.length - 1 && submitPrompt()"
            >
          </view>
        </view>
        <view class="mt-4 flex justify-end gap-2">
          <wd-button type="info" plain @click="current.resolve(null)">
            取消
          </wd-button>
          <wd-button @click="submitPrompt">
            确定
          </wd-button>
        </view>
      </template>
    </view>
  </wd-popup>
</template>

<style lang="scss" scoped>
.ws-fp {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--ot-fill);
}
</style>
