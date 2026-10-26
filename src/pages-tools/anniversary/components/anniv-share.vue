<script lang="ts" setup>
// 纪念日只读分享：链接（可设有效期与访问密码），对方免登录查看实时的倒数 / 累计天数；不包含备注
import type { IAnnivShare } from '@/api/anniversary'
import dayjs from 'dayjs'
import { getAnnivShare, shareAnniversary, unshareAnniversary } from '@/api/anniversary'
import { copyText, toast } from '@/utils/common'
import { getPageUrl } from '@/utils/site'
import QrPopup from '../../qrcode/components/qr-popup.vue'

const props = defineProps<{
  id: number
  title: string
}>()

const emit = defineEmits<{ changed: [meta: IAnnivShare] }>()

const open = defineModel<boolean>({ required: true })

const TTLS = [
  { value: 0, label: '永久' },
  { value: 86400, label: '1 天' },
  { value: 604800, label: '7 天' },
  { value: 2592000, label: '30 天' },
]
const PWD_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'

const meta = ref<IAnnivShare>()
const ttl = ref(0)
const pwdOn = ref(false)
const pwd = ref('')
const busy = ref(false)
const qrOpen = ref(false)

const link = computed(() => meta.value?.shareCode ? getPageUrl(`/pages-tools/anniversary/share?c=${meta.value.shareCode}`) : '')
const shareText = computed(() => meta.value?.sharePassword ? `${link.value}\n访问密码：${meta.value.sharePassword}` : link.value)
const dirty = computed(() => !!meta.value?.shareCode && (pwdOn.value ? pwd.value.trim() : '') !== (meta.value?.sharePassword || ''))

function randomPwd() {
  const bytes = typeof crypto !== 'undefined' && crypto.getRandomValues
    ? crypto.getRandomValues(new Uint8Array(6))
    : Uint8Array.from({ length: 6 }, () => Math.floor(Math.random() * 256))
  pwd.value = Array.from(bytes, b => PWD_CHARS[b % PWD_CHARS.length]).join('')
}

watch(pwdOn, (v) => {
  if (v && !pwd.value)
    randomPwd()
})

watch(open, async (v) => {
  if (!v)
    return
  meta.value = undefined
  try {
    meta.value = await getAnnivShare(props.id)
    pwdOn.value = !!meta.value.sharePassword
    pwd.value = meta.value.sharePassword || ''
  }
  catch {}
})

async function save(renew = false) {
  let password = ''
  if (pwdOn.value) {
    password = pwd.value.trim()
    if (!password)
      return toast('请填写访问密码，或关闭「访问密码」')
    if (/\s/.test(password))
      return toast('访问密码不能包含空格')
  }
  busy.value = true
  try {
    meta.value = await shareAnniversary(props.id, ttl.value, renew, password)
    emit('changed', meta.value)
    copyText(shareText.value)
  }
  catch {}
  finally {
    busy.value = false
  }
}

async function stop() {
  busy.value = true
  try {
    meta.value = await unshareAnniversary(props.id)
    emit('changed', meta.value)
    toast('已取消分享，原链接失效', 'success')
  }
  catch {}
  finally {
    busy.value = false
  }
}
</script>

<template>
  <wd-popup v-model="open" position="center" :z-index="1100" custom-style="border-radius: 16px; width: min(92vw, 420px);">
    <view class="ot-as">
      <view class="flex items-center gap-2">
        <view class="i-carbon-share text-18px text-[var(--wot-color-theme)]" />
        <text class="flex-1 text-16px text-main font-600">分享「{{ title }}」</text>
        <view class="i-carbon-close cursor-pointer text-18px text-muted" @click="open = false" />
      </view>
      <text class="mt-2 block text-12px text-muted leading-18px">
        拿到链接的人无需登录即可查看实时的天数（不包含备注）；取消分享后链接立即失效。
      </text>
      <view class="ot-as__row">
        <text class="ot-as__label">有效期</text>
        <ot-segmented v-model="ttl" :options="TTLS" size="small" />
      </view>
      <view class="ot-as__row is-wrap">
        <text class="ot-as__label">访问密码</text>
        <wd-switch v-model="pwdOn" size="20px" />
        <template v-if="pwdOn">
          <view class="ot-as__pwd">
            <input v-model="pwd" class="ot-mono min-w-0 flex-1 text-14px" placeholder="设置密码" :maxlength="32">
          </view>
          <text class="ot-as__link" @click="randomPwd">随机</text>
        </template>
        <text v-else class="text-12px text-muted">不设密码，拿到链接即可查看</text>
      </view>

      <template v-if="meta?.shareCode">
        <view class="ot-as__url ot-mono" @click="copyText(shareText)">
          {{ link || '（无法生成链接）' }}
        </view>
        <text class="mt-1.5 block text-12px text-muted">
          {{ meta.shareExpiresAt ? `${dayjs(meta.shareExpiresAt * 1000).format('YYYY-MM-DD HH:mm')} 失效` : '永久有效' }}{{ meta.sharePassword ? ` · 访问密码 ${meta.sharePassword}` : ' · 无密码' }}
        </text>
        <text v-if="dirty" class="mt-1 block text-12px text-amber-600">修改后点「保存设置」生效</text>
        <view class="mt-4 flex flex-wrap gap-2">
          <wd-button size="small" icon="copy" @click="copyText(shareText)">
            {{ meta.sharePassword ? '复制链接和密码' : '复制链接' }}
          </wd-button>
          <wd-button size="small" type="info" plain :loading="busy" @click="save(false)">
            保存设置
          </wd-button>
          <wd-button size="small" type="info" plain :disabled="!link" @click="qrOpen = true">
            二维码
          </wd-button>
          <wd-button size="small" type="info" plain :loading="busy" @click="save(true)">
            换新链接
          </wd-button>
          <wd-button size="small" type="error" plain :loading="busy" @click="stop">
            取消分享
          </wd-button>
        </view>
      </template>
      <wd-button v-else block custom-class="mt-4" :loading="busy" :disabled="!meta" @click="save(false)">
        生成分享链接
      </wd-button>
    </view>
    <qr-popup v-model="qrOpen" :text="link" :note="`纪念日 · ${title}`" />
  </wd-popup>
</template>

<style lang="scss" scoped>
.ot-as {
  padding: 18px;
  font-size: 13px;
  color: var(--ot-text-2);
}

.ot-as__row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;

  &.is-wrap {
    flex-wrap: wrap;
    row-gap: 8px;
  }
}

.ot-as__label {
  flex-shrink: 0;
  width: 56px;
}

.ot-as__pwd {
  display: flex;
  align-items: center;
  width: 130px;
  height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--ot-text);
  background: var(--ot-fill);
}

.ot-as__link {
  font-size: 12px;
  color: var(--wot-color-theme);
  cursor: pointer;
}

.ot-as__url {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 12px;
  word-break: break-all;
  color: var(--ot-text);
  background: var(--ot-fill);
  cursor: pointer;
}
</style>
