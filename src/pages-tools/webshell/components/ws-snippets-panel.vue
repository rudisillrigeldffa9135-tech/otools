<script lang="ts" setup>
// 快捷命令：会话里点一下发送到终端，也可以发送到所有已连接的会话。
// layout=list 为列表（概览中管理）；layout=bar 为会话底部「命令」标签（仿 FinalShell：左侧分类、右侧命令按钮，右键编辑）
import type { Snippet } from '../lib/types'
import { copyText, toast } from '@/utils/common'
import { openMenu } from '../lib/menu'
import { broadcast, connectedCount } from '../lib/sessions'
import { data, remove } from '../lib/store'
import { fillSnippet, snippetVars } from '../lib/util'
import SnippetEditor from './snippet-editor.vue'

const props = withDefaults(defineProps<{
  /** session：在会话中使用；manage：在概览中管理（发送时发往所有会话） */
  mode?: 'session' | 'manage'
  layout?: 'list' | 'bar'
}>(), { mode: 'session', layout: 'list' })

const emit = defineEmits<{ send: [text: string], close: [] }>()

const VAR_TIP = '支持多行与 {{变量}}，所有设备同步。'

const keyword = ref('')
const toAll = ref(false)
const editorOpen = ref(false)
const editing = ref<Snippet | null>(null)
const filling = ref<{ snippet: Snippet, values: Record<string, string> } | null>(null)

const groups = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  const list = data.snippets.filter(s => !k || s.name.toLowerCase().includes(k) || s.command.toLowerCase().includes(k) || s.category.toLowerCase().includes(k))
  const map = new Map<string, Snippet[]>()
  for (const s of list) {
    const c = s.category || '未分类'
    map.set(c, [...(map.get(c) ?? []), s])
  }
  return [...map.entries()].sort((a, b) => (a[0] === '未分类' ? 1 : b[0] === '未分类' ? -1 : a[0].localeCompare(b[0], 'zh-CN')))
})

function deliver(command: string, autoRun: boolean) {
  const text = command.replace(/\r?\n/g, '\r') + (autoRun ? '\r' : '')
  if (props.mode === 'manage' || toAll.value) {
    const n = broadcast(text)
    toast(n ? `已发送到 ${n} 个会话` : '没有已连接的会话')
  }
  else {
    emit('send', text)
  }
}

function run(s: Snippet) {
  const vars = snippetVars(s.command)
  if (!vars.length)
    return deliver(s.command, s.autoRun)
  filling.value = { snippet: s, values: Object.fromEntries(vars.map(v => [v.name, v.default])) }
}

function confirmFill() {
  if (!filling.value)
    return
  const { snippet, values } = filling.value
  filling.value = null
  deliver(fillSnippet(snippet.command, values), snippet.autoRun)
}

const category = ref('')
const categories = computed(() => [...new Set(data.snippets.map(s => s.category || '未分类'))].sort((a, b) => (a === '未分类' ? 1 : b === '未分类' ? -1 : a.localeCompare(b, 'zh-CN'))))
const barItems = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return data.snippets.filter(s => (!category.value || (s.category || '未分类') === category.value)
    && (!k || s.name.toLowerCase().includes(k) || s.command.toLowerCase().includes(k)))
})

function tipOf(s: Snippet) {
  return `${s.command}${s.autoRun ? '' : '\n（发送后不自动回车）'}\n右键可编辑`
}

function itemMenu(e: MouseEvent, s: Snippet) {
  openMenu(e, [
    { label: '执行', icon: 'i-carbon-play', action: () => run(s) },
    { label: '编辑', icon: 'i-carbon-edit', divider: true, action: () => edit(s) },
    { label: '复制命令', icon: 'i-carbon-copy', action: () => copyText(s.command) },
    {
      label: '删除',
      icon: 'i-carbon-trash-can',
      danger: true,
      divider: true,
      action: () => uni.showModal({ title: '删除快捷命令', content: `确定删除「${s.name}」吗？`, success: ({ confirm }) => confirm && remove(s.id) }),
    },
  ])
}

function edit(s: Snippet | null) {
  editing.value = s
  editorOpen.value = true
}

const fillOpen = computed({
  get: () => !!filling.value,
  set: (v) => {
    if (!v)
      filling.value = null
  },
})
</script>

<template>
  <div v-if="layout === 'bar'" class="ws-snb">
    <div class="ws-snb__cats">
      <div class="ws-snb__cat" :class="{ 'is-on': !category }" @click="category = ''">
        全部<span class="ws-snb__n">{{ data.snippets.length }}</span>
      </div>
      <div v-for="c in categories" :key="c" class="ws-snb__cat" :class="{ 'is-on': category === c }" @click="category = c">
        <span class="truncate">{{ c }}</span>
      </div>
    </div>
    <div class="ws-snb__main">
      <div class="ws-snb__bar">
        <input v-model="keyword" class="ws-snb__search" placeholder="搜索命令">
        <span class="ws-snb__btn" title="新建快捷命令" @click="edit(null)"><span class="i-carbon-add" />新建</span>
        <span class="ws-snb__btn" :class="{ 'is-on': toAll }" title="发送到所有已连接的会话" @click="toAll = !toAll">
          <span class="i-carbon-share-knowledge" />全部会话（{{ connectedCount }}）
        </span>
      </div>
      <div class="ws-snb__list">
        <div v-if="!data.snippets.length" class="ws-snb__empty">
          把常用命令存起来，点一下就能执行；{{ VAR_TIP }}
          <span class="ws-snb__link" @click="edit(null)">新建快捷命令</span>
        </div>
        <div
          v-for="s in barItems" :key="s.id" class="ws-snb__item" :title="tipOf(s)"
          @click="run(s)" @contextmenu="itemMenu($event, s)"
        >
          <span class="i-carbon-flash shrink-0 text-amber-500" />
          <span class="truncate">{{ s.name }}</span>
        </div>
      </div>
    </div>
  </div>
  <view v-else class="ot-sn">
    <view class="ot-sn__head">
      <text class="flex-1 text-13px text-main font-600">快捷命令</text>
      <view class="ot-sn__btn" title="新建" @click="edit(null)">
        <view class="i-carbon-add" />
      </view>
      <view v-if="mode === 'session'" class="ot-sn__btn" title="关闭" @click="emit('close')">
        <view class="i-carbon-close" />
      </view>
    </view>
    <view class="ot-sn__search">
      <view class="i-carbon-search text-14px text-muted" />
      <input v-model="keyword" class="min-w-0 flex-1 text-13px" placeholder="搜索命令">
    </view>
    <view v-if="mode === 'session'" class="mx-3 mt-2 flex items-center gap-2 text-12px text-muted">
      <wd-switch v-model="toAll" size="16px" />
      <text>发送到所有已连接的会话（{{ connectedCount }}）</text>
    </view>
    <scroll-view scroll-y class="ot-sn__list">
      <view v-if="!data.snippets.length" class="ot-sn__empty">
        <text>把常用命令存起来，点一下就能执行。</text>
        <text class="mt-1">{{ VAR_TIP }}</text>
        <wd-button size="small" custom-class="mt-3" @click="edit(null)">
          新建快捷命令
        </wd-button>
      </view>
      <view v-for="[cat, items] in groups" :key="cat" class="mb-2">
        <view class="ot-sn__cat">
          {{ cat }}
        </view>
        <view v-for="s in items" :key="s.id" class="ot-sn__item" @click="run(s)">
          <view class="min-w-0 flex-1">
            <view class="truncate text-13px text-main">
              {{ s.name }}
            </view>
            <view class="ot-mono truncate text-11px text-muted">
              {{ s.command }}
            </view>
          </view>
          <view v-if="!s.autoRun" class="shrink-0 text-10px text-muted">
            不回车
          </view>
          <view class="i-carbon-edit ot-sn__edit" title="编辑" @click.stop="edit(s)" />
          <view class="i-carbon-play-filled-alt shrink-0 text-14px text-[var(--wot-color-theme)]" />
        </view>
      </view>
    </scroll-view>
  </view>

  <snippet-editor v-model="editorOpen" :snippet="editing" />

  <wd-popup v-model="fillOpen" position="center" :z-index="1100" custom-style="border-radius: 16px; width: min(92vw, 420px);">
    <view v-if="filling" class="ws-form">
      <view class="text-16px text-main font-600">
        {{ filling.snippet.name }}
      </view>
      <view v-for="v in snippetVars(filling.snippet.command)" :key="v.name">
        <view class="ws-form__label">
          {{ v.name }}
        </view>
        <view class="ws-form__field">
          <input v-model="filling.values[v.name]" class="ot-mono min-w-0 flex-1" :placeholder="v.default || v.name" confirm-type="done" @confirm="confirmFill">
        </view>
      </view>
      <view class="ot-mono mt-3 break-all rounded-8px bg-[var(--ot-fill)] p-2 text-12px text-muted">
        {{ fillSnippet(filling.snippet.command, filling.values) }}
      </view>
      <view class="mt-4 flex justify-end gap-2">
        <wd-button type="info" plain @click="filling = null">
          取消
        </wd-button>
        <wd-button @click="confirmFill">
          {{ filling.snippet.autoRun ? '执行' : '发送' }}
        </wd-button>
      </view>
    </view>
  </wd-popup>
</template>

<style lang="scss" scoped>
.ot-sn {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  color: var(--ot-text);
}

.ot-sn__head {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  padding: 6px 8px 6px 12px;
  border-bottom: 1px solid var(--ot-border);
}

.ot-sn__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  font-size: 16px;
  color: var(--ot-text-2);
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
  }
}

.ot-sn__search {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  margin: 8px 12px 0;
  padding: 0 10px;
  border-radius: 8px;
  background: var(--ot-fill);
}

.ot-sn__list {
  flex: 1;
  min-height: 0;
  margin-top: 6px;
}

.ot-sn__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28px 16px;
  font-size: 12px;
  text-align: center;
  color: var(--ot-text-3);
}

.ot-sn__cat {
  padding: 6px 12px 2px;
  font-size: 11px;
  color: var(--ot-text-3);
}

.ot-sn__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
  }
}

.ot-sn__edit {
  flex-shrink: 0;
  padding: 4px;
  font-size: 14px;
  color: var(--ot-text-3);
}
</style>

<style lang="scss" scoped>
/* 会话底部「命令」标签（仿 FinalShell） */
.ws-snb {
  display: flex;
  height: 100%;
  min-height: 0;
  font-size: 12px;
  color: var(--ot-text);
}

.ws-snb__cats {
  flex-shrink: 0;
  width: 140px;
  padding: 2px 0;
  overflow: auto;
  border-right: 1px solid var(--ot-border);
}

.ws-snb__cat {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 10px;
  cursor: default;

  &:hover {
    background: var(--ot-fill);
  }

  &.is-on {
    color: #fff;
    background: var(--wot-color-theme);
  }
}

.ws-snb__n {
  margin-left: auto;
  opacity: 0.6;
}

.ws-snb__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.ws-snb__bar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 4px;
  border-bottom: 1px solid var(--ot-border);
}

.ws-snb__search {
  width: 180px;
  height: 22px;
  padding: 0 6px;
  box-sizing: border-box;
  border: 1px solid var(--ot-border);
  border-radius: 3px;
  font-size: 12px;
  color: var(--ot-text);
  background: var(--ot-card);
  outline: none;
}

.ws-snb__btn {
  display: flex;
  align-items: center;
  gap: 3px;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--ot-border);
  border-radius: 3px;
  color: var(--ot-text-2);
  cursor: pointer;

  &:hover,
  &.is-on {
    color: var(--wot-color-theme);
    border-color: var(--wot-color-theme);
  }
}

.ws-snb__list {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 6px;
  padding: 8px;
  overflow: auto;
}

.ws-snb__item {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 220px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--ot-border);
  border-radius: 3px;
  background: var(--ot-card);
  cursor: pointer;

  &:hover {
    border-color: var(--wot-color-theme);
    color: var(--wot-color-theme);
  }
}

.ws-snb__empty {
  width: 100%;
  padding: 16px 0;
  text-align: center;
  color: var(--ot-text-3);
}

.ws-snb__link {
  margin-left: 6px;
  color: var(--wot-color-theme);
  cursor: pointer;
}
</style>
