<script lang="ts" setup>
// 终端（仅 H5）：封装 xterm.js，负责显示、输入、复制粘贴、搜索与自适应大小
import type { Settings } from '../lib/types'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import { toast } from '@/utils/common'
import { THEMES } from '../lib/themes'
import '@xterm/xterm/css/xterm.css'

const props = defineProps<{
  settings: Settings
}>()

const emit = defineEmits<{
  data: [data: string]
  resize: [size: { cols: number, rows: number }]
  title: [title: string]
  search: []
}>()

const el = ref<HTMLDivElement>()
let term: Terminal | undefined
let fit: FitAddon | undefined
let search: SearchAddon | undefined
let observer: ResizeObserver | undefined
let fitTimer: ReturnType<typeof setTimeout> | undefined

function options() {
  const s = props.settings
  return {
    fontSize: s.fontSize,
    fontFamily: s.fontFamily,
    theme: THEMES[s.theme]?.theme ?? THEMES.dark.theme,
    cursorStyle: s.cursorStyle,
    cursorBlink: s.cursorBlink,
    scrollback: s.scrollback,
  }
}

async function paste() {
  try {
    const text = await navigator.clipboard.readText()
    if (text)
      emit('data', text.replace(/\r?\n/g, '\r'))
  }
  catch {
    toast('浏览器不允许读取剪贴板，请使用 Ctrl+Shift+V 或右键菜单粘贴')
  }
}

function copySelection() {
  const text = term?.getSelection()
  if (text)
    navigator.clipboard.writeText(text).then(() => toast('已复制'), () => {})
  return !!text
}

function doFit() {
  clearTimeout(fitTimer)
  fitTimer = setTimeout(() => {
    if (!term || !fit || !el.value || el.value.offsetWidth === 0)
      return
    try {
      fit.fit()
    }
    catch {}
  }, 30)
}

onMounted(() => {
  term = new Terminal({ ...options(), allowProposedApi: true, convertEol: false, macOptionIsMeta: true, rightClickSelectsWord: false })
  fit = new FitAddon()
  search = new SearchAddon()
  term.loadAddon(fit)
  term.loadAddon(search)
  term.loadAddon(new WebLinksAddon((e, uri) => {
    if (e.ctrlKey || e.metaKey)
      window.open(uri, '_blank', 'noopener')
  }))
  term.loadAddon(new Unicode11Addon())
  term.unicode.activeVersion = '11'
  term.open(el.value!)
  term.onData(d => emit('data', d))
  term.onResize(size => emit('resize', size))
  term.onTitleChange(t => emit('title', t))
  term.onSelectionChange(() => {
    if (props.settings.copyOnSelect && term?.hasSelection())
      navigator.clipboard.writeText(term.getSelection()).catch(() => {})
  })
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown')
      return true
    const mod = e.ctrlKey && e.shiftKey
    if (mod && e.code === 'KeyC') {
      copySelection()
      return false
    }
    if (mod && e.code === 'KeyV') {
      paste()
      return false
    }
    if (mod && e.code === 'KeyF') {
      emit('search')
      return false
    }
    // 浏览器自带的 Ctrl+V 粘贴走 paste 事件，这里不拦截
    return true
  })
  el.value!.addEventListener('contextmenu', (e) => {
    if (!props.settings.rightClickPaste)
      return
    e.preventDefault()
    if (!copySelection())
      paste()
    term?.clearSelection()
  })
  observer = new ResizeObserver(doFit)
  observer.observe(el.value!)
  doFit()
})

watch(() => props.settings, () => {
  if (!term)
    return
  Object.assign(term.options, options())
  doFit()
}, { deep: true })

onBeforeUnmount(() => {
  clearTimeout(fitTimer)
  observer?.disconnect()
  term?.dispose()
})

defineExpose({
  write: (d: string | Uint8Array) => term?.write(d),
  writeln: (d: string) => term?.writeln(d),
  clear: () => term?.clear(),
  reset: () => term?.reset(),
  focus: () => term?.focus(),
  fit: doFit,
  size: () => ({ cols: term?.cols ?? 80, rows: term?.rows ?? 24 }),
  paste,
  copySelection,
  selectAll: () => term?.selectAll(),
  findNext: (q: string, opts?: { caseSensitive?: boolean, regex?: boolean }) => search?.findNext(q, opts),
  findPrevious: (q: string, opts?: { caseSensitive?: boolean, regex?: boolean }) => search?.findPrevious(q, opts),
  clearSearch: () => search?.clearDecorations(),
  getText: () => {
    if (!term)
      return ''
    const buf = term.buffer.active
    const lines: string[] = []
    for (let i = 0; i < buf.length; i++)
      lines.push(buf.getLine(i)?.translateToString(true) ?? '')
    return lines.join('\n').replace(/\n+$/, '\n')
  },
})
</script>

<template>
  <div ref="el" class="ot-term" :style="{ background: THEMES[settings.theme]?.theme.background }" />
</template>

<style lang="scss" scoped>
.ot-term {
  width: 100%;
  height: 100%;
  padding: 6px 0 0 8px;
  box-sizing: border-box;
  overflow: hidden;

  :deep(.xterm) {
    height: 100%;
  }

  :deep(.xterm-viewport) {
    scrollbar-width: thin;
  }
}
</style>
