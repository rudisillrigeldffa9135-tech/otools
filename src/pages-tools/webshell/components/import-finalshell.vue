<script lang="ts" setup>
// 导入 FinalShell 导出的服务器：可直接选择导出的文件夹（含子文件夹），也可多选 .json 文件。
// 密码在本地解密还原，整个过程不上传任何内容。
import type { FsImported } from '../lib/finalshell'
import { toast } from '@/utils/common'
import { parseFinalShellFiles } from '../lib/finalshell'
import { data, save } from '../lib/store'
import { emptyHost } from '../lib/types'

const open = defineModel<boolean>({ required: true })
const list = ref<FsImported[]>([])
const picked = ref(new Set<number>())
const busy = ref(false)
const scanning = ref(false)

const existing = computed(() => new Set(data.hosts.map(h => `${h.username}@${h.host}:${h.port}`)))
function keyOf(h: FsImported) {
  return `${h.username}@${h.host}:${h.port}`
}

watch(open, (v) => {
  if (!v) {
    list.value = []
    picked.value = new Set()
  }
})

async function readFiles(files: File[]) {
  scanning.value = true
  try {
    const jsons = files.filter(f => /\.json$/i.test(f.name) && f.size < 256 * 1024)
    const parsed = parseFinalShellFiles(await Promise.all(jsons.map(async f => ({
      path: (f as any).webkitRelativePath || f.name,
      text: await f.text(),
    }))))
    if (!parsed.length) {
      toast(jsons.length ? '没有识别到 SSH 连接' : '没有找到 .json 文件')
    }
    list.value = parsed
    picked.value = new Set(parsed.map((h, i) => [h, i] as const).filter(([h]) => !existing.value.has(keyOf(h))).map(([, i]) => i))
  }
  finally {
    scanning.value = false
  }
}

function pick(directory: boolean) {
  const el = document.createElement('input')
  el.type = 'file'
  el.multiple = true
  if (directory)
    el.setAttribute('webkitdirectory', '')
  el.accept = directory ? '' : '.json,application/json'
  el.onchange = () => readFiles([...(el.files ?? [])])
  el.click()
}

function toggle(i: number) {
  const s = new Set(picked.value)
  s.has(i) ? s.delete(i) : s.add(i)
  picked.value = s
}

async function submit() {
  const chosen = list.value.filter((_, i) => picked.value.has(i))
  if (!chosen.length)
    return toast('请选择要导入的服务器')
  busy.value = true
  try {
    // 先把需要的分组建好（按名称复用已有分组）
    const groupId = new Map<string, string>(data.groups.map(g => [g.name, g.id]))
    for (const name of new Set(chosen.map(h => h.group).filter(Boolean))) {
      if (!groupId.has(name)) {
        const g = await save('group', { id: '', name, sort: Date.now() })
        groupId.set(name, g.id)
      }
    }
    const now = Math.floor(Date.now() / 1000)
    let keyCount = 0
    for (const h of chosen) {
      if (h.keyHint)
        keyCount++
      await save('host', {
        ...emptyHost(),
        name: h.name,
        groupId: h.group ? (groupId.get(h.group) ?? '') : '',
        host: h.host,
        port: h.port,
        username: h.username || 'root',
        auth: h.password ? 'password' : h.keyHint ? 'key' : 'password',
        password: h.password,
        note: h.note || (h.keyHint ? h.keyHint : '导入自 FinalShell'),
        createdAt: now,
      })
    }
    toast(`已导入 ${chosen.length} 台${keyCount ? `，其中 ${keyCount} 台需在编辑中选择私钥` : ''}`)
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
        <text class="flex-1 text-16px text-main font-600">导入 FinalShell 服务器</text>
        <view class="i-carbon-close cursor-pointer text-18px text-muted" @click="open = false" />
      </view>
      <view class="text-12px text-muted leading-18px">
        在 FinalShell 里右键连接或文件夹选择「导出」，然后在这里选择导出的文件夹（含子文件夹会按目录自动分组），或多选 .json 文件。密码会在本机解密，不会上传。
      </view>
      <view class="mt-3 flex gap-8px">
        <wd-button size="small" :loading="scanning" @click="pick(true)">
          选择文件夹
        </wd-button>
        <wd-button size="small" plain :loading="scanning" @click="pick(false)">
          选择文件
        </wd-button>
      </view>

      <template v-if="list.length">
        <view class="ws-form__label">
          识别到 {{ list.length }} 台（已存在的默认不选）
        </view>
        <scroll-view scroll-y class="max-h-280px">
          <view v-for="(h, i) in list" :key="i" class="ws-imp" @click="toggle(i)">
            <view :class="picked.has(i) ? 'i-carbon-checkbox-checked text-[var(--wot-color-theme)]' : 'i-carbon-checkbox text-muted'" class="shrink-0 text-16px" />
            <view class="min-w-0 flex-1">
              <view class="flex items-center gap-6px">
                <text class="truncate text-13px text-main">{{ h.name }}</text>
                <text v-if="h.group" class="ws-tag">{{ h.group }}</text>
                <text v-if="h.password" class="ws-tag is-ok">已含密码</text>
                <text v-else-if="h.keyHint" class="ws-tag is-warn">需私钥</text>
                <text v-else class="ws-tag is-warn">无密码</text>
              </view>
              <view class="ot-mono truncate text-11px text-muted">
                {{ h.username || 'root' }}@{{ h.host }}:{{ h.port }}
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

.ws-tag {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: 3px;
  font-size: 10px;
  line-height: 16px;
  color: var(--ot-text-3);
  background: var(--ot-fill);

  &.is-ok {
    color: #16a34a;
    background: rgba(34, 197, 94, 0.14);
  }

  &.is-warn {
    color: #d97706;
    background: rgba(245, 158, 11, 0.14);
  }
}
</style>
