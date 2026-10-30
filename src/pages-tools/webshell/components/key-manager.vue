<script lang="ts" setup>
// 密钥管理（仅 H5）：生成、导入私钥，复制公钥，一键把公钥装到已连接的服务器
import type { SshKey } from '../lib/types'
import dayjs from 'dayjs'
import { copyText, toast } from '@/utils/common'
import { getConn, sessions } from '../lib/sessions'
import { loadSsh } from '../lib/ssh'
import { data, remove, save } from '../lib/store'
import { shellQuote } from '../lib/util'

const open = defineModel<boolean>({ required: true })

type Mode = 'list' | 'generate' | 'import'
const mode = ref<Mode>('list')
const busy = ref(false)
const gen = ref({ name: '', type: 'ed25519' as 'ed25519' | 'rsa' | 'ecdsa' })
const imp = ref({ name: '', pem: '', passphrase: '', needPass: false })

const TYPES = [
  { value: 'ed25519', label: 'Ed25519（推荐）' },
  { value: 'rsa', label: 'RSA 4096' },
  { value: 'ecdsa', label: 'ECDSA P-256' },
]

watch(open, (v) => {
  if (v)
    mode.value = 'list'
})

function usedBy(k: SshKey) {
  return data.hosts.filter(h => h.auth === 'key' && h.keyId === k.id)
}

function installCommand(k: SshKey) {
  return `mkdir -p ~/.ssh && chmod 700 ~/.ssh && grep -qxF ${shellQuote(k.publicKey)} ~/.ssh/authorized_keys 2>/dev/null || echo ${shellQuote(k.publicKey)} >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys`
}

async function generate() {
  busy.value = true
  try {
    const ssh = await loadSsh()
    const name = gen.value.name.trim() || `otools-${dayjs().format('YYYYMMDD')}`
    const k = await ssh.generateKey(gen.value.type, name)
    await save('key', { id: '', name, type: k.type, privateKey: k.privateKey, passphrase: '', publicKey: k.publicKey, fingerprint: k.fingerprint, createdAt: Math.floor(Date.now() / 1000) })
    toast('已生成，把公钥添加到服务器后即可使用', 'success')
    gen.value.name = ''
    mode.value = 'list'
  }
  catch (e: any) {
    toast(e?.message || '生成失败')
  }
  finally {
    busy.value = false
  }
}

function pickFile() {
  const el = document.createElement('input')
  el.type = 'file'
  el.onchange = async () => {
    const f = el.files?.[0]
    if (!f)
      return
    if (f.size > 64 * 1024)
      return toast('文件太大，不像是私钥文件')
    imp.value.pem = await f.text()
    if (!imp.value.name)
      imp.value.name = f.name
  }
  el.click()
}

async function doImport() {
  const pem = imp.value.pem.trim()
  if (!pem)
    return toast('请粘贴私钥内容或选择私钥文件')
  if (/^ssh-(?:rsa|ed25519|dss)|^ecdsa-sha2/.test(pem))
    return toast('这是公钥，请导入私钥（通常是没有 .pub 后缀的文件）')
  busy.value = true
  try {
    const ssh = await loadSsh()
    let info
    try {
      info = await ssh.parseKey(pem, imp.value.passphrase)
    }
    catch (e: any) {
      if (e?.code === 'passphrase') {
        imp.value.needPass = true
        return toast(imp.value.passphrase ? '私钥密码不正确' : '这个私钥设置了密码，请填写私钥密码')
      }
      throw e
    }
    const name = imp.value.name.trim() || info.fingerprint.slice(7, 19)
    await save('key', { id: '', name, type: info.type, privateKey: `${pem}\n`, passphrase: imp.value.passphrase, publicKey: `${info.publicKey} ${name}`.trim(), fingerprint: info.fingerprint, createdAt: Math.floor(Date.now() / 1000) })
    toast('已导入', 'success')
    imp.value = { name: '', pem: '', passphrase: '', needPass: false }
    mode.value = 'list'
  }
  catch (e: any) {
    toast(e?.message || '导入失败')
  }
  finally {
    busy.value = false
  }
}

function rename(k: SshKey) {
  uni.showModal({
    title: '重命名',
    editable: true,
    content: k.name,
    success: ({ confirm, content }) => {
      const name = (content ?? '').trim()
      if (confirm && name)
        save('key', { ...k, name }).catch(e => toast(e?.message || '保存失败'))
    },
  })
}

function del(k: SshKey) {
  const used = usedBy(k)
  uni.showModal({
    title: '删除密钥',
    content: `确定删除「${k.name}」吗？${used.length ? `有 ${used.length} 台服务器在使用它，删除后需要重新选择私钥。` : ''}删除后无法恢复。`,
    success: async ({ confirm }) => {
      if (confirm)
        await remove(k.id)
    },
  })
}

function install(k: SshKey) {
  const targets = sessions.filter(s => s.status === 'connected')
  if (!targets.length)
    return toast('请先连接要安装公钥的服务器（用密码登录），或复制安装命令手动执行')
  uni.showActionSheet({
    itemList: targets.map(s => s.title),
    success: async ({ tapIndex }) => {
      const conn = getConn(targets[tapIndex].key)
      if (!conn)
        return
      try {
        const r = await conn.ssh.exec(conn.id, installCommand(k), { timeout: 15000 })
        toast(r.code === 0 ? '已添加到 authorized_keys' : (r.stderr.trim() || '安装失败'), r.code === 0 ? 'success' : 'none')
      }
      catch (e: any) {
        toast(e?.message || '安装失败')
      }
    },
  })
}

function keyMenu(k: SshKey) {
  const items: [string, () => void][] = [
    ['复制公钥', () => copyText(k.publicKey)],
    ['复制安装命令（在服务器上执行）', () => copyText(installCommand(k))],
    ['安装到已连接的服务器', () => install(k)],
    ['导出私钥', () => {
      uni.showModal({
        title: '导出私钥',
        content: '私钥将以明文文件下载到本机，请妥善保管。',
        success: ({ confirm }) => {
          if (!confirm)
            return
          const a = document.createElement('a')
          a.href = URL.createObjectURL(new Blob([k.privateKey], { type: 'text/plain' }))
          a.download = k.name.replace(/[\\/:*?"<>|\s]+/g, '_') || 'id_key'
          a.click()
          setTimeout(() => URL.revokeObjectURL(a.href), 1000)
        },
      })
    }],
    ['重命名', () => rename(k)],
    ['删除', () => del(k)],
  ]
  uni.showActionSheet({ itemList: items.map(i => i[0]), success: ({ tapIndex }) => items[tapIndex]?.[1]() })
}
</script>

<template>
  <wd-popup v-model="open" position="center" :z-index="1100" custom-style="border-radius: 16px; width: min(94vw, 560px);">
    <view class="ws-form">
      <view class="mb-2 flex items-center gap-2">
        <view v-if="mode !== 'list'" class="i-carbon-arrow-left cursor-pointer text-18px text-muted" @click="mode = 'list'" />
        <text class="flex-1 text-16px text-main font-600">{{ mode === 'generate' ? '生成密钥' : mode === 'import' ? '导入私钥' : '密钥管理' }}</text>
        <view class="i-carbon-close cursor-pointer text-18px text-muted" @click="open = false" />
      </view>

      <template v-if="mode === 'list'">
        <view class="text-12px text-muted leading-18px">
          私钥用主密码端到端加密后同步，服务器上看不到明文。
        </view>
        <view class="mt-3 flex gap-2">
          <wd-button size="small" icon="add" @click="mode = 'generate'">
            生成密钥
          </wd-button>
          <wd-button size="small" type="info" plain @click="mode = 'import'">
            导入私钥
          </wd-button>
        </view>
        <view v-if="!data.keys.length" class="py-8 text-center text-13px text-muted">
          还没有密钥
        </view>
        <view v-for="k in data.keys" :key="k.id" class="ws-key" @click="keyMenu(k)">
          <view class="i-carbon-password shrink-0 text-20px text-[var(--wot-color-theme)]" />
          <view class="min-w-0 flex-1">
            <view class="flex items-center gap-2">
              <text class="truncate text-14px text-main">{{ k.name }}</text>
              <text class="shrink-0 text-11px text-muted">{{ k.type }}</text>
              <view v-if="k.passphrase" class="i-carbon-locked shrink-0 text-12px text-muted" title="有私钥密码" />
            </view>
            <view class="ot-mono truncate text-11px text-muted">
              {{ k.fingerprint }}
            </view>
            <view v-if="usedBy(k).length" class="truncate text-11px text-muted">
              用于：{{ usedBy(k).map(h => h.name).join('、') }}
            </view>
          </view>
          <view class="i-carbon-overflow-menu-vertical shrink-0 text-16px text-muted" />
        </view>
      </template>

      <template v-else-if="mode === 'generate'">
        <view class="ws-form__label">
          名称（也作为公钥的备注）
        </view>
        <view class="ws-form__field">
          <input v-model="gen.name" class="min-w-0 flex-1" placeholder="如 my-laptop" :maxlength="60">
        </view>
        <view class="ws-form__label">
          类型
        </view>
        <ot-segmented v-model="gen.type" :options="TYPES" size="small" />
        <view class="mt-2 text-12px text-muted leading-18px">
          生成后在列表里点「安装到已连接的服务器」，或复制安装命令到服务器上执行，再把服务器的认证方式改为「私钥」。
        </view>
        <wd-button block custom-class="mt-4" :loading="busy" @click="generate">
          生成
        </wd-button>
      </template>

      <template v-else>
        <view class="ws-form__label">
          名称
        </view>
        <view class="ws-form__field">
          <input v-model="imp.name" class="min-w-0 flex-1" placeholder="如 id_ed25519" :maxlength="60">
        </view>
        <view class="ws-form__label flex items-center">
          <text class="flex-1">私钥内容</text>
          <text class="ws-form__link" @click="pickFile">选择文件</text>
        </view>
        <view class="ws-form__field is-area">
          <textarea v-model="imp.pem" class="ot-mono text-12px" placeholder="-----BEGIN OPENSSH PRIVATE KEY----- …（支持 OpenSSH、PEM 格式）" :maxlength="20000" />
        </view>
        <template v-if="imp.needPass || imp.passphrase">
          <view class="ws-form__label">
            私钥密码
          </view>
          <view class="ws-form__field">
            <input v-model="imp.passphrase" class="ot-mono min-w-0 flex-1" password placeholder="生成私钥时设置的密码" :maxlength="200">
          </view>
        </template>
        <view v-else class="ws-form__link mt-2 text-12px" @click="imp.needPass = true">
          私钥有密码？
        </view>
        <wd-button block custom-class="mt-4" :loading="busy" @click="doImport">
          导入
        </wd-button>
      </template>
    </view>
  </wd-popup>
</template>

<style lang="scss" scoped>
.ws-key {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--ot-fill);
  cursor: pointer;
}
</style>
