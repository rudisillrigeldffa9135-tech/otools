<script lang="ts" setup>
// 连接管理器（仿 FinalShell）：按分组的服务器树形表格，双击连接，右键菜单
import type { Host } from '../lib/types'
import { copyText, toast } from '@/utils/common'
import { openMenu } from '../lib/menu'
import { openSession } from '../lib/sessions'
import { data, remove, save } from '../lib/store'
import { formatHostPort } from '../lib/util'

const emit = defineEmits<{ editHost: [host: Host | null], importConfig: [] }>()
const open = defineModel<boolean>({ required: true })
const keyword = ref('')
const selectedId = ref('')
const collapsed = ref(new Set<string>())

const groups = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  const hosts = data.hosts.filter(h => !k || [h.name, h.host, h.username, h.note].some(v => v?.toLowerCase().includes(k)))
  const known = new Set(data.groups.map(g => g.id))
  return [...data.groups.map(g => ({ id: g.id, name: g.name })), { id: '', name: '未分组' }]
    .map(g => ({ ...g, hosts: hosts.filter(h => (known.has(h.groupId) ? h.groupId : '') === g.id) }))
    .filter(g => g.hosts.length || (g.id && !k))
})

const selected = computed(() => data.hosts.find(h => h.id === selectedId.value))

function connect(h: Host) {
  openSession(h)
  open.value = false
}

function toggle(id: string) {
  const s = new Set(collapsed.value)
  if (s.has(id))
    s.delete(id)
  else
    s.add(id)
  collapsed.value = s
}

function edit(h: Host | null) {
  emit('editHost', h)
}

function duplicate(h: Host) {
  emit('editHost', { ...h, id: '', name: `${h.name} 副本`, lastConnectedAt: 0, connectCount: 0, createdAt: 0 })
}

function del(h: Host) {
  uni.showModal({
    title: '删除服务器',
    content: `确定删除「${h.name}」吗？`,
    success: ({ confirm }) => confirm && remove(h.id),
  })
}

function newGroup() {
  uni.showModal({
    title: '新建文件夹',
    editable: true,
    placeholderText: '文件夹名称，如：生产环境',
    success: ({ confirm, content }) => {
      const name = (content ?? '').trim()
      if (confirm && name)
        save('group', { id: '', name, sort: Date.now() }).catch(e => toast(e?.message))
    },
  })
}

function rowMenu(e: MouseEvent, h: Host) {
  selectedId.value = h.id
  openMenu(e, [
    { label: '打开', icon: 'i-carbon-launch', action: () => connect(h) },
    { label: '编辑', icon: 'i-carbon-edit', divider: true, action: () => edit(h) },
    { label: '复制', icon: 'i-carbon-copy-file', action: () => duplicate(h) },
    { label: '复制地址', icon: 'i-carbon-copy', action: () => copyText(h.host) },
    { label: h.pinned ? '取消置顶' : '置顶', icon: 'i-carbon-pin', action: () => save('host', { ...h, pinned: !h.pinned }).catch(err => toast(err?.message)) },
    { label: '删除', icon: 'i-carbon-trash-can', danger: true, divider: true, action: () => del(h) },
  ])
}

function newMenu(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  openMenu({ clientX: rect.left, clientY: rect.bottom + 2 }, [
    { label: 'SSH 连接', icon: 'i-carbon-terminal', action: () => edit(null) },
    { label: '文件夹', icon: 'i-carbon-folder-add', action: newGroup },
    { label: '导入 SSH 配置…', icon: 'i-carbon-document-import', divider: true, action: () => emit('importConfig') },
  ])
}
</script>

<template>
  <wd-popup v-model="open" position="center" :z-index="1050" custom-style="border-radius: 8px; width: min(96vw, 760px); overflow: hidden;">
    <div class="ws-cm">
      <div class="ws-cm__title">
        <span class="i-carbon-folder-details text-16px" />
        <span class="flex-1">连接管理器</span>
        <span class="i-carbon-close cursor-pointer text-16px" @click="open = false" />
      </div>
      <div class="ws-cm__bar">
        <span class="ws-cm__btn" @click="newMenu"><span class="i-carbon-add" />新建 ▾</span>
        <span class="ws-cm__btn" :class="{ 'is-disabled': !selected }" @click="selected && edit(selected)"><span class="i-carbon-edit" />编辑</span>
        <span class="ws-cm__btn" :class="{ 'is-disabled': !selected }" @click="selected && duplicate(selected)"><span class="i-carbon-copy-file" />复制</span>
        <span class="ws-cm__btn" :class="{ 'is-disabled': !selected }" @click="selected && del(selected)"><span class="i-carbon-trash-can" />删除</span>
        <span class="flex-1" />
        <input v-model="keyword" class="ws-cm__search" placeholder="搜索名称、地址、备注">
      </div>
      <div class="ws-cm__head">
        <span class="ws-cm__c-name">名称</span>
        <span class="ws-cm__c-host">主机</span>
        <span class="ws-cm__c-user">用户名</span>
        <span class="ws-cm__c-note">备注</span>
      </div>
      <div class="ws-cm__rows">
        <div v-if="!data.hosts.length" class="ws-cm__empty">
          还没有服务器，点「新建」添加，或导入 ~/.ssh/config
        </div>
        <template v-for="g in groups" :key="g.id || 'none'">
          <div class="ws-cm__group" @click="toggle(g.id)">
            <span :class="collapsed.has(g.id) ? 'i-carbon-caret-right' : 'i-carbon-caret-down'" />
            <span :class="collapsed.has(g.id) ? 'i-carbon-folder' : 'i-carbon-folder-open'" class="text-amber-500" />
            <span>{{ g.name }}</span>
            <span class="opacity-60">（{{ g.hosts.length }}）</span>
          </div>
          <template v-if="!collapsed.has(g.id)">
            <div
              v-for="h in g.hosts" :key="h.id" class="ws-cm__tr" :class="{ 'is-sel': selectedId === h.id }"
              @click="selectedId = h.id" @dblclick="connect(h)" @contextmenu="rowMenu($event, h)"
            >
              <span class="ws-cm__c-name">
                <span class="i-carbon-terminal shrink-0" :style="{ color: h.color || undefined }" />
                <span v-if="h.pinned" class="i-carbon-pin-filled shrink-0 text-amber-500" />
                <span class="truncate">{{ h.name }}</span>
              </span>
              <span class="ws-cm__c-host ot-mono">{{ formatHostPort(h.host, h.port) }}</span>
              <span class="ws-cm__c-user">{{ h.username }}</span>
              <span class="ws-cm__c-note">{{ h.note }}</span>
            </div>
          </template>
        </template>
      </div>
      <div class="ws-cm__foot">
        <span class="flex-1 opacity-70">双击打开连接，右键查看更多操作</span>
        <wd-button size="small" :disabled="!selected" @click="selected && connect(selected)">
          打开
        </wd-button>
      </div>
    </div>
  </wd-popup>
</template>

<style lang="scss" scoped>
.ws-cm {
  display: flex;
  flex-direction: column;
  height: min(80vh, 560px);
  font-size: 12px;
  color: var(--ot-text);
  background: var(--ot-card);
}

.ws-cm__title {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 10px;
  font-size: 13px;
  font-weight: 600;
  border-bottom: 1px solid var(--ot-border);
}

.ws-cm__bar {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 34px;
  padding: 0 6px;
  border-bottom: 1px solid var(--ot-border);
  background: var(--ot-fill);
}

.ws-cm__btn {
  display: flex;
  align-items: center;
  gap: 3px;
  height: 24px;
  padding: 0 8px;
  border-radius: 3px;
  color: var(--ot-text-2);
  cursor: pointer;

  &:hover {
    color: var(--wot-color-theme);
    background: var(--ot-card);
  }

  &.is-disabled {
    opacity: 0.4;
    pointer-events: none;
  }
}

.ws-cm__search {
  width: 200px;
  height: 24px;
  padding: 0 8px;
  box-sizing: border-box;
  border: 1px solid var(--ot-border);
  border-radius: 3px;
  font-size: 12px;
  color: var(--ot-text);
  background: var(--ot-card);
  outline: none;
}

.ws-cm__head,
.ws-cm__tr {
  display: flex;
  align-items: center;
  height: 24px;
  padding: 0 8px;

  > span {
    padding: 0 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.ws-cm__head {
  border-bottom: 1px solid var(--ot-border);
  color: var(--ot-text-3);
  background: var(--ot-fill);
}

.ws-cm__rows {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.ws-cm__group {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px;
  font-weight: 600;
  cursor: default;
  user-select: none;
}

.ws-cm__tr {
  padding-left: 30px;
  cursor: default;
  user-select: none;

  &:hover {
    background: var(--ot-fill);
  }

  &.is-sel {
    color: #fff;
    background: var(--wot-color-theme);

    [class*='text-'],
    .i-carbon-terminal {
      color: #fff !important;
    }
  }
}

.ws-cm__c-name {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.ws-cm__c-host {
  flex-shrink: 0;
  width: 200px;
}

.ws-cm__c-user {
  flex-shrink: 0;
  width: 90px;
}

.ws-cm__c-note {
  flex-shrink: 0;
  width: 140px;
}

.ws-cm__empty {
  padding: 40px 0;
  text-align: center;
  color: var(--ot-text-3);
}

.ws-cm__foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-top: 1px solid var(--ot-border);
}

@media (max-width: 640px) {
  .ws-cm__c-user,
  .ws-cm__c-note {
    display: none;
  }

  .ws-cm__c-host {
    width: 140px;
  }
}
</style>
