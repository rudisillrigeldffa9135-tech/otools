<script lang="ts" setup>
// 新建 / 编辑服务器
import type { Host } from '../lib/types'
import { toast } from '@/utils/common'
import { data, remove, save } from '../lib/store'
import { emptyHost, HOST_COLORS, hostLabel } from '../lib/types'
import { parseHostInput } from '../lib/util'

const props = defineProps<{ host: Host | null }>()
const emit = defineEmits<{ saved: [host: Host, connect: boolean], manageKeys: [] }>()
const open = defineModel<boolean>({ required: true })

const form = ref<Host>(emptyHost())
const showPwd = ref(false)
const saving = ref(false)
const newGroup = ref('')

const AUTHS = [
  { value: 'password', label: '密码' },
  { value: 'key', label: '私钥' },
  { value: 'interactive', label: '键盘交互' },
]

watch(open, (v) => {
  if (!v)
    return
  form.value = props.host ? { ...emptyHost(), ...props.host } : { ...emptyHost(), groupId: lastGroup() }
  showPwd.value = false
  newGroup.value = ''
})

function lastGroup() {
  return data.hosts.slice().sort((a, b) => b.createdAt - a.createdAt)[0]?.groupId ?? ''
}

const groupOptions = computed(() => [{ id: '', name: '未分组' }, ...data.groups, { id: '__new', name: '+ 新建分组…' }])
const groupIndex = computed(() => Math.max(0, groupOptions.value.findIndex(g => g.id === form.value.groupId)))
const keyOptions = computed(() => [{ id: '', name: '请选择私钥' }, ...data.keys.map(k => ({ id: k.id, name: `${k.name}（${k.type}）` }))])
const keyIndex = computed(() => Math.max(0, keyOptions.value.findIndex(k => k.id === form.value.keyId)))
/** 跳板机候选：排除自己，以及经自己跳转的服务器（避免循环） */
const jumpOptions = computed(() => [
  { id: '', name: '不使用跳板机（直连）' },
  ...data.hosts.filter(h => !form.value.id || (h.id !== form.value.id && h.jumpHostId !== form.value.id)).map(h => ({ id: h.id, name: `${h.name}（${hostLabel(h)}）` })),
])
const jumpIndex = computed(() => Math.max(0, jumpOptions.value.findIndex(h => h.id === form.value.jumpHostId)))

function pickGroup(i: number) {
  const g = groupOptions.value[i]
  if (g.id !== '__new') {
    form.value.groupId = g.id
    return
  }
  uni.showModal({
    title: '新建分组',
    editable: true,
    placeholderText: '分组名称，如：生产环境',
    success: async ({ confirm, content }) => {
      const name = (content ?? '').trim()
      if (!confirm || !name)
        return
      try {
        const g = await save('group', { id: '', name, sort: Date.now() })
        form.value.groupId = g.id
      }
      catch (e: any) {
        toast(e?.message || '创建失败')
      }
    },
  })
}

function validate() {
  const f = form.value
  // 粘贴 user@host:port、[IPv6]:port 等时自动拆开
  const parsed = parseHostInput(f.host)
  f.host = parsed.host
  if (parsed.username)
    f.username = parsed.username
  if (parsed.port)
    f.port = parsed.port
  if (!f.host)
    return '请填写服务器地址'
  if (!/^[\w.:%-]+$/.test(f.host))
    return '服务器地址格式不正确'
  if (!Number.isInteger(Number(f.port)) || f.port < 1 || f.port > 65535)
    return '端口需为 1~65535'
  if (!f.username.trim())
    return '请填写用户名'
  if (f.auth === 'key' && !f.keyId)
    return '请选择私钥，没有的话先在「密钥管理」中导入或生成'
  return ''
}

async function submit(connect: boolean) {
  const err = validate()
  if (err)
    return toast(err)
  saving.value = true
  try {
    const f = form.value
    const saved = await save('host', {
      ...f,
      name: f.name.trim() || f.host,
      port: Number(f.port) || 22,
      username: f.username.trim(),
      password: f.auth === 'key' ? '' : f.password,
      createdAt: f.createdAt || Math.floor(Date.now() / 1000),
    })
    open.value = false
    emit('saved', saved, connect)
  }
  catch (e: any) {
    toast(e?.message || '保存失败')
  }
  finally {
    saving.value = false
  }
}

function del() {
  const h = props.host
  if (!h)
    return
  const usedBy = data.hosts.filter(x => x.jumpHostId === h.id)
  uni.showModal({
    title: '删除服务器',
    content: `确定删除「${h.name}」吗？${usedBy.length ? `有 ${usedBy.length} 台服务器把它当作跳板机，删除后它们将无法连接。` : ''}`,
    success: async ({ confirm }) => {
      if (!confirm)
        return
      await remove(h.id)
      open.value = false
    },
  })
}
</script>

<template>
  <wd-popup v-model="open" position="center" :z-index="1100" custom-style="border-radius: 16px; width: min(94vw, 520px);">
    <view class="ws-form">
      <view class="mb-1 text-16px text-main font-600">
        {{ host ? '编辑服务器' : '新建服务器' }}
      </view>

      <view class="flex gap-3">
        <view class="min-w-0 flex-[3]">
          <view class="ws-form__label">
            地址 <text class="text-red-500">*</text>
          </view>
          <view class="ws-form__field">
            <input v-model="form.host" class="ot-mono min-w-0 flex-1" placeholder="IP、域名，或 user@host:port" :maxlength="253">
          </view>
        </view>
        <view class="min-w-0 flex-1">
          <view class="ws-form__label">
            端口
          </view>
          <view class="ws-form__field">
            <input v-model.number="form.port" type="number" class="ot-mono min-w-0 flex-1" placeholder="22" :maxlength="5">
          </view>
        </view>
      </view>

      <view class="flex gap-3">
        <view class="min-w-0 flex-1">
          <view class="ws-form__label">
            名称
          </view>
          <view class="ws-form__field">
            <input v-model="form.name" class="min-w-0 flex-1" placeholder="不填时使用地址" :maxlength="60">
          </view>
        </view>
        <view class="min-w-0 flex-1">
          <view class="ws-form__label">
            分组
          </view>
          <picker :range="groupOptions" range-key="name" :value="groupIndex" @change="pickGroup(Number($event.detail.value))">
            <view class="ws-form__field is-pick">
              <text class="min-w-0 flex-1 truncate">{{ groupOptions[groupIndex]?.name }}</text>
              <view class="i-carbon-chevron-down text-muted" />
            </view>
          </picker>
        </view>
      </view>

      <view class="ws-form__label">
        用户名 <text class="text-red-500">*</text>
      </view>
      <view class="ws-form__field">
        <input v-model="form.username" class="ot-mono min-w-0 flex-1" placeholder="如 root、ubuntu" :maxlength="64">
      </view>

      <view class="ws-form__label">
        认证方式
      </view>
      <ot-segmented v-model="form.auth" :options="AUTHS" size="small" />

      <template v-if="form.auth !== 'key'">
        <view class="ws-form__label">
          {{ form.auth === 'interactive' ? '密码（可选，用于自动回答密码提示）' : '密码' }}
        </view>
        <view class="ws-form__field">
          <input v-model="form.password" class="ot-mono min-w-0 flex-1" :password="!showPwd" placeholder="不填则每次连接时询问" :maxlength="256">
          <view class="ws-form__icon" :class="showPwd ? 'i-carbon-view-off' : 'i-carbon-view'" @click="showPwd = !showPwd" />
        </view>
        <view v-if="form.auth === 'interactive'" class="mt-1 text-12px text-muted">
          适用于需要动态口令（两步验证）的服务器，连接时会弹窗输入验证码。
        </view>
      </template>
      <template v-else>
        <view class="ws-form__label flex items-center">
          <text class="flex-1">私钥</text>
          <text class="ws-form__link" @click="emit('manageKeys')">密钥管理</text>
        </view>
        <picker :range="keyOptions" range-key="name" :value="keyIndex" @change="form.keyId = keyOptions[Number($event.detail.value)].id">
          <view class="ws-form__field is-pick">
            <text class="min-w-0 flex-1 truncate" :class="{ 'text-muted': !form.keyId }">{{ keyOptions[keyIndex]?.name }}</text>
            <view class="i-carbon-chevron-down text-muted" />
          </view>
        </picker>
      </template>

      <view class="ws-form__label">
        跳板机
      </view>
      <picker :range="jumpOptions" range-key="name" :value="jumpIndex" @change="form.jumpHostId = jumpOptions[Number($event.detail.value)].id">
        <view class="ws-form__field is-pick">
          <text class="min-w-0 flex-1 truncate">{{ jumpOptions[jumpIndex]?.name }}</text>
          <view class="i-carbon-chevron-down text-muted" />
        </view>
      </picker>
      <view class="mt-1 text-12px text-muted">
        内网服务器可以经一台公网服务器跳转连接（相当于 ssh -J）。
      </view>

      <view class="ws-form__label">
        登录后执行
      </view>
      <view class="ws-form__field">
        <input v-model="form.initCommand" class="ot-mono min-w-0 flex-1" placeholder="可选，如 cd /var/www && ls" :maxlength="500">
      </view>

      <view class="ws-form__label">
        备注
      </view>
      <view class="ws-form__field">
        <input v-model="form.note" class="min-w-0 flex-1" placeholder="可选" :maxlength="200">
      </view>

      <view class="ws-form__label">
        颜色标记
      </view>
      <view class="flex flex-wrap items-center gap-2">
        <view
          v-for="c in HOST_COLORS" :key="c" class="ws-form__color" :class="{ 'is-on': form.color === c }"
          :style="{ background: c || 'var(--ot-fill)' }" @click="form.color = c"
        >
          <view v-if="!c" class="i-carbon-close text-12px text-muted" />
        </view>
        <view class="flex-1" />
        <wd-switch v-model="form.pinned" size="18px" />
        <text class="text-13px text-main">置顶</text>
      </view>

      <view class="mt-5 flex flex-wrap gap-2">
        <wd-button v-if="host" type="error" plain @click="del">
          删除
        </wd-button>
        <view class="flex-1" />
        <wd-button type="info" plain :loading="saving" @click="submit(false)">
          保存
        </wd-button>
        <wd-button :loading="saving" @click="submit(true)">
          保存并连接
        </wd-button>
      </view>
    </view>
  </wd-popup>
</template>
