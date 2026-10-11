<script lang="ts" setup>
import type { Algorithm, CipherOptions, Encoding, Mode, Padding } from './cipher'
import { copyText, getRandomBytes, toast } from '@/utils/common'
import { blockSize, decrypt, encodeBytes, encrypt, keySizes, needsIv, parseBytes } from './cipher'

definePage({
  style: { navigationBarTitleText: '对称加密' },
})

const direction = ref<'encrypt' | 'decrypt'>('encrypt')
const input = ref('')

const opts = reactive<CipherOptions>({
  algorithm: 'AES',
  mode: 'CBC',
  padding: 'Pkcs7',
  keyType: 'raw',
  key: '',
  keyEncoding: 'utf8',
  iv: '',
  ivEncoding: 'utf8',
  textEncoding: 'utf8',
  outputEncoding: 'base64',
})

const ALGOS: Algorithm[] = ['AES', 'DES', '3DES']
const MODES: Mode[] = ['CBC', 'ECB', 'CTR', 'CFB', 'OFB']
const PADDINGS: { value: Padding, label: string }[] = [
  { value: 'Pkcs7', label: 'PKCS7' },
  { value: 'ZeroPadding', label: 'Zero' },
  { value: 'NoPadding', label: '不填充' },
  { value: 'AnsiX923', label: 'ANSI X9.23' },
  { value: 'Iso10126', label: 'ISO 10126' },
]
const ENCODINGS: { value: Encoding, label: string }[] = [
  { value: 'utf8', label: 'UTF-8' },
  { value: 'hex', label: 'Hex' },
  { value: 'base64', label: 'Base64' },
]

// 流模式（CTR / CFB / OFB）通常不填充；切回分组模式时恢复 PKCS7
watch(() => opts.mode, (m, old) => {
  const stream = (x: Mode) => ['CTR', 'CFB', 'OFB'].includes(x)
  if (stream(m) && !stream(old))
    opts.padding = 'NoPadding'
  else if (!stream(m) && stream(old) && opts.padding === 'NoPadding')
    opts.padding = 'Pkcs7'
})

/** 口令模式的随机盐：小程序没有 crypto-js 需要的原生随机数，这里预先生成 */
const salt = ref<Uint8Array>()
async function newSalt() {
  salt.value = await getRandomBytes(8)
}
onLoad(newSalt)

function byteLength(s: string, enc: Encoding) {
  if (!s)
    return 0
  try {
    return parseBytes(s, enc, '').sigBytes
  }
  catch {
    return -1
  }
}
const keyBytes = computed(() => byteLength(opts.key, opts.keyEncoding))
const ivBytes = computed(() => byteLength(opts.iv, opts.ivEncoding))
const showIv = computed(() => needsIv(opts))

const output = computed<{ value?: string, error?: string }>(() => {
  if (!input.value)
    return {}
  if (!opts.key)
    return { error: opts.keyType === 'raw' ? '请输入密钥' : '请输入口令' }
  try {
    const value = direction.value === 'encrypt'
      ? encrypt(input.value, { ...opts }, salt.value)
      : decrypt(input.value, { ...opts })
    return { value }
  }
  catch (e: any) {
    return { error: e.message }
  }
})

async function randomKey() {
  const sizes = keySizes(opts.algorithm)
  const size = sizes[sizes.length - 1]
  opts.key = encodeBytes(await getRandomBytes(size), opts.keyEncoding)
}
async function randomIv() {
  opts.iv = encodeBytes(await getRandomBytes(blockSize(opts.algorithm)), opts.ivEncoding)
}

/** 把结果作为输入，切换加 / 解密方向，便于验证往返 */
function swap() {
  if (!output.value.value)
    return toast('没有可互换的结果')
  input.value = output.value.value
  direction.value = direction.value === 'encrypt' ? 'decrypt' : 'encrypt'
}

const keyHint = computed(() => {
  if (opts.keyType === 'passphrase')
    return '用 MD5 派生密钥与 IV（OpenSSL EVP_BytesToKey），密文以 Salted__ 开头，可用 openssl enc -md md5 解密'
  const need = keySizes(opts.algorithm).join(' / ')
  return `需要 ${need} 字节${keyBytes.value > 0 ? `，当前 ${keyBytes.value} 字节` : ''}${opts.algorithm === 'AES' ? '（对应 AES-128 / 192 / 256）' : ''}`
})
</script>

<template>
  <ot-tool-layout>
    <ot-panel title="算法">
      <view class="ot-ci__row">
        <text class="ot-ci__label">算法</text>
        <ot-segmented v-model="opts.algorithm" :options="ALGOS" size="small" />
      </view>
      <view class="ot-ci__row">
        <text class="ot-ci__label">模式</text>
        <view class="flex flex-wrap gap-1.5">
          <view v-for="m in MODES" :key="m" class="ot-ci__opt" :class="{ 'is-active': opts.mode === m }" @click="opts.mode = m">
            {{ m }}
          </view>
        </view>
      </view>
      <view class="ot-ci__row">
        <text class="ot-ci__label">填充</text>
        <view class="flex flex-wrap gap-1.5">
          <view v-for="p in PADDINGS" :key="p.value" class="ot-ci__opt" :class="{ 'is-active': opts.padding === p.value }" @click="opts.padding = p.value">
            {{ p.label }}
          </view>
        </view>
      </view>
      <view class="ot-ci__row">
        <text class="ot-ci__label">密钥</text>
        <ot-segmented v-model="opts.keyType" :options="[{ value: 'raw', label: '密钥 + IV' }, { value: 'passphrase', label: '口令（OpenSSL）' }]" size="small" />
      </view>
    </ot-panel>

    <ot-panel :title="opts.keyType === 'raw' ? '密钥与 IV' : '口令'">
      <view class="ot-ci__field">
        <input v-model="opts.key" class="ot-mono min-w-0 flex-1 text-14px" :placeholder="opts.keyType === 'raw' ? '密钥' : '口令（任意长度）'">
        <template v-if="opts.keyType === 'raw'">
          <picker :range="ENCODINGS" range-key="label" :value="ENCODINGS.findIndex(e => e.value === opts.keyEncoding)" @change="opts.keyEncoding = ENCODINGS[$event.detail.value].value">
            <view class="ot-ci__enc">
              {{ ENCODINGS.find(e => e.value === opts.keyEncoding)?.label }}
              <view class="i-carbon-chevron-down text-12px" />
            </view>
          </picker>
          <view class="ot-ci__icon i-carbon-renew" title="随机生成" @click="randomKey" />
        </template>
      </view>
      <view class="mt-1.5 text-12px leading-18px" :class="keyBytes < 0 || (opts.keyType === 'raw' && keyBytes > 0 && !keySizes(opts.algorithm).includes(keyBytes)) ? 'text-red-500' : 'text-muted'">
        {{ keyBytes < 0 ? `不是有效的 ${ENCODINGS.find(e => e.value === opts.keyEncoding)?.label}` : keyHint }}
      </view>

      <template v-if="showIv">
        <view class="ot-ci__field mt-3">
          <input v-model="opts.iv" class="ot-mono min-w-0 flex-1 text-14px" placeholder="IV（初始向量）">
          <picker :range="ENCODINGS" range-key="label" :value="ENCODINGS.findIndex(e => e.value === opts.ivEncoding)" @change="opts.ivEncoding = ENCODINGS[$event.detail.value].value">
            <view class="ot-ci__enc">
              {{ ENCODINGS.find(e => e.value === opts.ivEncoding)?.label }}
              <view class="i-carbon-chevron-down text-12px" />
            </view>
          </picker>
          <view class="ot-ci__icon i-carbon-renew" title="随机生成" @click="randomIv" />
        </view>
        <view class="mt-1.5 text-12px" :class="ivBytes < 0 || (ivBytes > 0 && ivBytes !== blockSize(opts.algorithm)) ? 'text-red-500' : 'text-muted'">
          需要 {{ blockSize(opts.algorithm) }} 字节{{ ivBytes > 0 ? `，当前 ${ivBytes} 字节` : '' }}
        </view>
      </template>
      <view v-else-if="opts.mode === 'ECB' && opts.keyType === 'raw'" class="mt-2 text-12px text-amber-600">
        ECB 模式不使用 IV，相同的明文块会得到相同的密文块，安全性较差，仅用于兼容旧系统。
      </view>
    </ot-panel>

    <ot-panel>
      <template #extra>
        <view class="flex items-center gap-2 text-12px text-muted">
          <text>明文</text>
          <picker :range="ENCODINGS" range-key="label" :value="ENCODINGS.findIndex(e => e.value === opts.textEncoding)" @change="opts.textEncoding = ENCODINGS[$event.detail.value].value">
            <view class="ot-ci__enc is-small">
              {{ ENCODINGS.find(e => e.value === opts.textEncoding)?.label }}
              <view class="i-carbon-chevron-down text-12px" />
            </view>
          </picker>
          <text>密文</text>
          <view class="ot-ci__enc is-small" @click="opts.outputEncoding = opts.outputEncoding === 'base64' ? 'hex' : 'base64'">
            {{ opts.outputEncoding === 'base64' ? 'Base64' : 'Hex' }}
            <view class="i-carbon-renew text-12px" />
          </view>
        </view>
      </template>
      <template #default>
        <view class="mb-3 flex items-center justify-between gap-2">
          <ot-segmented v-model="direction" :options="[{ value: 'encrypt', label: '加密' }, { value: 'decrypt', label: '解密' }]" />
        </view>
        <ot-textarea v-model="input" :height="120" :mono="direction === 'decrypt' || opts.textEncoding !== 'utf8'" :placeholder="direction === 'encrypt' ? '输入要加密的内容' : `粘贴 ${opts.outputEncoding === 'base64' ? 'Base64' : 'Hex'} 格式的密文`" />
      </template>
    </ot-panel>

    <ot-panel :title="direction === 'encrypt' ? '密文' : '明文'">
      <template #extra>
        <wd-button size="small" type="info" plain @click="swap">
          互换
        </wd-button>
        <wd-button v-if="direction === 'encrypt' && opts.keyType === 'passphrase'" size="small" type="info" plain @click="newSalt">
          换盐
        </wd-button>
        <wd-button size="small" icon="copy" :disabled="!output.value" @click="copyText(output.value || '')">
          复制
        </wd-button>
      </template>
      <view v-if="output.error" class="ot-ci__error">
        <view class="i-carbon-warning-filled shrink-0" />
        <text>{{ output.error }}</text>
      </view>
      <view v-else-if="output.value !== undefined" class="ot-ci__output ot-mono" user-select>
        <text user-select selectable>{{ output.value || '（空）' }}</text>
      </view>
      <view v-else class="py-4 text-center text-13px text-muted">
        输入内容后实时{{ direction === 'encrypt' ? '加密' : '解密' }}
      </view>
    </ot-panel>

    <view class="px-1 text-12px text-muted leading-20px">
      全部在本地计算，密钥与内容不会上传。新系统推荐 AES-256 + CBC/CTR 并使用随机 IV；DES 与 3DES 已不再安全，仅用于对接旧系统。暂不支持 GCM 模式。
    </view>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-ci__row {
  display: flex;
  align-items: center;
  gap: 10px;

  & + & {
    margin-top: 12px;
  }
}

.ot-ci__label {
  flex-shrink: 0;
  width: 36px;
  font-size: 13px;
  color: var(--ot-text-2);
}

.ot-ci__opt {
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--ot-text-2);
  background: var(--ot-fill);
  border: 1px solid transparent;
  cursor: pointer;

  &.is-active {
    color: var(--wot-color-theme);
    border-color: var(--wot-color-theme);
    background: transparent;
    font-weight: 600;
  }
}

.ot-ci__field {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 6px 0 12px;
  border-radius: 10px;
  background: var(--ot-fill);
  color: var(--ot-text);
  border: 1px solid transparent;

  &:focus-within {
    border-color: var(--wot-color-theme);
  }
}

.ot-ci__enc {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--ot-text-2);
  background: var(--ot-card);
  border: 1px solid var(--ot-border);
  cursor: pointer;
  white-space: nowrap;

  &.is-small {
    padding: 2px 6px;
  }
}

.ot-ci__icon {
  flex-shrink: 0;
  padding: 6px;
  font-size: 16px;
  color: var(--ot-text-3);
  cursor: pointer;

  &:hover {
    color: var(--wot-color-theme);
  }
}

.ot-ci__output {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--ot-fill);
  font-size: 13px;
  line-height: 1.6;
  color: var(--ot-text);
  word-break: break-all;
  white-space: pre-wrap;
  max-height: 320px;
  overflow-y: auto;
}

.ot-ci__error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: #dc2626;
  background: rgba(239, 68, 68, 0.08);
}
</style>
