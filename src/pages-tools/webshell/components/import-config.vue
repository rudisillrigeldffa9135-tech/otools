<script lang="ts" setup>
// 从 ~/.ssh/config 导入服务器（浏览器读不到本机的私钥文件，用到私钥的服务器导入后需要再选择私钥）
import type { ImportedHost } from '../lib/util'
import { toast } from '@/utils/common'
import { data, save } from '../lib/store'
import { emptyHost } from '../lib/types'
import { parseSshConfig } from '../lib/util'

const open = defineModel<boolean>({ required: true })
const text = ref('')
const picked = ref(new Set<string>())
const busy = ref(false)

const parsed = computed<ImportedHost[]>(() => parseSshConfig(text.value))
const existing = computed(() => new Set(data.hosts.map(h => `${h.username}@${h.host}:${h.port}`)))

watch(parsed, (list) => {
  picked.value = new Set(list.filter(h => !existing.value.has(`${h.username}@${h.host}:${h.port}`)).map(h => h.alias))
})

watch(open, (v) => {
  if (v)
    text.value = ''
})

function toggle(alias: string) {
  const s = new Set(picked.value)
  if (s.has(alias))
    s.delete(alias)
  else
    s.add(alias)
  picked.value = s
}

function pickFile() {
  const el = document.createElement('input')
  el.type = 'file'
  el.onchange = async () => {
    const f = el.files?.[0]
    if (f && f.size < 512 * 1024)
      text.value = await f.text()
  }
  el.click()
}

async function submit() {
  const list = parsed.value.filter(h => picked.value.has(h.alias))
  if (!list.length)
    return toast('请选择要导入的服务器')
  busy.value = true
  try {
    const ids = new Map<string, string>(data.hosts.map(h => [h.name, h.id]))
    const created: { id: string, jump: string }[] = []
    const now = Math.floor(Date.now() / 1000)
    for (const h of list) {
      const saved = await save('host', {
        ...emptyHost(),
        name: h.alias,
        host: h.host,
        port: h.port,
        username: h.username || 'root',
        auth: h.identityFile ? 'key' : 'password',
        note: h.identityFile ? `导入自 SSH 配置，需要私钥 ${h.identityFile}` : '导入自 SSH 配置',
        createdAt: now,
      })
      ids.set(h.alias, saved.id)
      if (h.proxyJump)
        created.push({ id: saved.id, jump: h.proxyJump })
    }
    // 第二步：关联跳板机
    for (const c of created) {
      const jumpId = ids.get(c.jump)
      const host = data.hosts.find(h => h.id === c.id)
      if (jumpId && host)
        await save('host', { ...host, jumpHostId: jumpId })
    }
    const needKey = list.filter(h => h.identityFile).length
    toast(`已导入 ${list.length} 台${needKey ? `，其中 ${needKey} 台需要在编辑中选择私钥` : ''}`)
    open.value = false
  }
  catch (e: any) {
    toast(e?.message || '导入失败')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <wd-popup v-model="open" position="center" :z-index="1100" custom-style="border-radius: 16px; width: min(94vw, 560px);">
    <view class="ws-form">
      <view class="mb-1 flex items-center">
        <text class="flex-1 text-16px text-main font-600">导入 SSH 配置</text>
        <view class="i-carbon-close cursor-pointer text-18px text-muted" @click="open = false" />
      </view>
      <view class="text-12px text-muted leading-18px">
        粘贴 ~/.ssh/config 的内容（Windows 在 C:\Users\你的用户名\.ssh\config），支持 Host、HostName、Port、User、IdentityFile、ProxyJump。
      </view>
      <view class="ws-form__label flex items-center">
        <text class="flex-1">配置内容</text>
        <text class="ws-form__link" @click="pickFile">选择文件</text>
      </view>
      <view class="ws-form__field is-area">
        <textarea v-model="text" class="ot-mono text-12px" placeholder="Host web&#10;  HostName 1.2.3.4&#10;  User root&#10;  Port 22" :maxlength="200000" />
      </view>
      <template v-if="parsed.length">
        <view class="ws-form__label">
          识别到 {{ parsed.length }} 台（已存在的默认不选）
        </view>
        <scroll-view scroll-y class="max-h-240px">
          <view v-for="h in parsed" :key="h.alias" class="ws-imp" @click="toggle(h.alias)">
            <view :class="picked.has(h.alias) ? 'i-carbon-checkbox-checked text-[var(--wot-color-theme)]' : 'i-carbon-checkbox text-muted'" class="shrink-0 text-16px" />
            <view class="min-w-0 flex-1">
              <view class="truncate text-13px text-main">
                {{ h.alias }}
              </view>
              <view class="ot-mono truncate text-11px text-muted">
                {{ h.username || 'root' }}@{{ h.host }}:{{ h.port }}{{ h.proxyJump ? ` · 经 ${h.proxyJump}` : '' }}{{ h.identityFile ? ` · 私钥 ${h.identityFile}` : '' }}
              </view>
            </view>
          </view>
        </scroll-view>
      </template>
      <wd-button block custom-class="mt-4" :loading="busy" :disabled="!picked.size" @click="submit">
        导入 {{ picked.size || '' }} 台
      </wd-button>
    </view>
  </wd-popup>
</template>

<style lang="scss" scoped>
.ws-imp {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
  cursor: pointer;
}
</style>
