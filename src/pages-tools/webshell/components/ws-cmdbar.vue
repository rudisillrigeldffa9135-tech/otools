<script lang="ts" setup>
// 终端下方的命令输入栏（仿 FinalShell）：回车发送，↑ ↓ 翻历史，Esc 清空；历史只保存在本机
import { toast } from '@/utils/common'
import { openMenu } from '../lib/menu'
import { broadcast } from '../lib/sessions'

const emit = defineEmits<{ send: [text: string] }>()

const KEY = 'ot-webshell-cmd-history'
const MAX = 100

function readHistory(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []
  }
  catch {
    return []
  }
}

const history = ref<string[]>(readHistory())
const text = ref('')
const toAll = ref(false)
let cursor = -1

function remember(cmd: string) {
  history.value = [cmd, ...history.value.filter(x => x !== cmd)].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(history.value))
  }
  catch {}
}

function send() {
  const cmd = text.value
  if (!cmd.trim())
    return
  if (toAll.value) {
    const n = broadcast(`${cmd}\r`)
    toast(n ? `已发送到 ${n} 个会话` : '没有已连接的会话')
  }
  else {
    emit('send', `${cmd}\r`)
  }
  remember(cmd)
  text.value = ''
  cursor = -1
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    send()
  }
  else if (e.key === 'Escape') {
    text.value = ''
    cursor = -1
  }
  else if (e.key === 'ArrowUp' && history.value.length) {
    e.preventDefault()
    cursor = Math.min(history.value.length - 1, cursor + 1)
    text.value = history.value[cursor]
  }
  else if (e.key === 'ArrowDown') {
    e.preventDefault()
    cursor = Math.max(-1, cursor - 1)
    text.value = cursor >= 0 ? history.value[cursor] : ''
  }
}

function showHistory(ev: MouseEvent) {
  const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  if (!history.value.length)
    return toast('还没有命令历史')
  openMenu({ clientX: rect.left, clientY: rect.top - 4 }, [
    ...history.value.slice(0, 20).map(cmd => ({ label: cmd.length > 60 ? `${cmd.slice(0, 60)}…` : cmd, action: () => (text.value = cmd) })),
    {
      label: '清空历史',
      icon: 'i-carbon-trash-can',
      divider: true,
      danger: true,
      action: () => {
        history.value = []
        try {
          localStorage.removeItem(KEY)
        }
        catch {}
      },
    },
  ])
}
</script>

<template>
  <div class="ws-cmd">
    <input
      v-model="text" class="ws-cmd__input" spellcheck="false" autocomplete="off"
      placeholder="命令输入（回车发送，↑↓ 历史，Esc 清空）" @keydown="onKey"
    >
    <span class="ws-cmd__btn" title="命令历史" @click="showHistory">历史</span>
    <span class="ws-cmd__btn" :class="{ 'is-on': toAll }" title="发送到所有已连接的会话" @click="toAll = !toAll">
      <span class="i-carbon-share-knowledge" />全部会话
    </span>
  </div>
</template>

<style lang="scss" scoped>
.ws-cmd {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 4px;
  border-top: 1px solid var(--ot-border);
  background: var(--ot-fill);
}

.ws-cmd__input {
  flex: 1;
  min-width: 0;
  height: 22px;
  padding: 0 8px;
  box-sizing: border-box;
  border: 1px solid var(--ot-border);
  border-radius: 3px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--ot-text);
  background: var(--ot-card);
  outline: none;

  &:focus {
    border-color: var(--wot-color-theme);
  }
}

.ws-cmd__btn {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 3px;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--ot-border);
  border-radius: 3px;
  font-size: 12px;
  color: var(--ot-text-2);
  background: var(--ot-card);
  cursor: pointer;

  &:hover,
  &.is-on {
    color: var(--wot-color-theme);
    border-color: var(--wot-color-theme);
  }
}
</style>
