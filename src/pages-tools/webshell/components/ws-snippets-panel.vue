<script lang="ts" setup>
// 快捷命令列表：会话里点一下发送到终端；也可以发送到所有已连接的会话
import type { Snippet } from '../lib/types'
import { toast } from '@/utils/common'
import { broadcast, connectedCount } from '../lib/sessions'
import { data } from '../lib/store'
import { fillSnippet, snippetVars } from '../lib/util'
import SnippetEditor from './snippet-editor.vue'

const props = withDefaults(defineProps<{
  /** session：在会话中使用；manage：在概览中管理（发送时发往所有会话） */
  mode?: 'session' | 'manage'
}>(), { mode: 'session' })

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
  <view class="ot-sn">
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
  </view>
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
