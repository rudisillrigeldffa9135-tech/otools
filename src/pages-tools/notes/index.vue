<script lang="ts" setup>
import type { INoteListItem, ShareTtl } from '@/api/notes'
import dayjs from 'dayjs'
import { createNote, deleteNote, getNote, listNotes, shareNote, unshareNote, updateNote } from '@/api/notes'
import { copyText, toast } from '@/utils/common'
import { getPageUrl } from '@/utils/site'
import QrView from '../qrcode/components/qr-view.vue'
import MdView from './components/md-view.vue'
import { countText } from './markdown'
import { derivePreview, deriveTitle } from './note-text'

definePage({
  style: { navigationBarTitleText: 'Markdown 便签' },
})

const MAX_LENGTH = 100_000
/** 停止输入多久后自动保存 */
const SAVE_DELAY = 800
const DRAFT_KEY = 'ot-notes-draft'

/** 宽屏同时显示列表与编辑器，窄屏二选一 */
function windowWidth() {
  // #ifdef H5
  return window.innerWidth
  // #endif
  // #ifndef H5
  return uni.getWindowInfo().windowWidth
  // #endif
}
const wide = ref(windowWidth() >= 768)
type Mode = 'edit' | 'preview' | 'split'
const mode = ref<Mode>(wide.value ? 'split' : 'edit')
const modeOptions = computed(() => [
  { value: 'edit', label: '编辑' },
  { value: 'preview', label: '预览' },
  ...(wide.value ? [{ value: 'split', label: '分栏' }] : []),
])

/* ---------------- 列表 ---------------- */

const list = ref<INoteListItem[]>([])
const listLoading = ref(false)
const keyword = ref('')

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw)
    return list.value
  return list.value.filter(n => `${n.title} ${n.preview}`.toLowerCase().includes(kw))
})

async function loadList() {
  listLoading.value = true
  try {
    list.value = await listNotes()
  }
  catch {}
  finally {
    listLoading.value = false
  }
}

function sortList() {
  list.value.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt || b.id - a.id)
}

/* ---------------- 当前便签 ---------------- */

interface Current {
  /** 还没保存过的新便签没有 id */
  id?: number
  content: string
  /** 编辑开始时（或上次保存后）的版本 */
  version?: number
  pinned: boolean
  updatedAt?: number
  shareCode?: string | null
  shareExpiresAt?: number
}

const current = ref<Current>()
/** 编辑器光标与焦点 */
const cursor = ref(0)
const editorFocus = ref(false)
/** 小程序通过 selection-start / end 设置光标 */
const selStart = ref(-1)
const selEnd = ref(-1)
const opening = ref(false)
const dirty = ref(false)
const saving = ref(false)
const saveError = ref('')
/** 其他设备改过这条便签，暂停自动保存，等用户选择 */
const conflict = ref(false)
const lastSavedAt = ref(0)
let saveTimer: ReturnType<typeof setTimeout> | undefined
/** 每次输入 +1，用来判断保存期间是否又有新输入 */
let editSeq = 0

const stats = computed(() => countText(current.value?.content ?? ''))
const title = computed(() => deriveTitle(current.value?.content ?? '') || '无标题')

const statusText = computed(() => {
  if (conflict.value)
    return '有冲突，已暂停保存'
  if (saving.value)
    return '保存中…'
  if (saveError.value)
    return '保存失败'
  if (dirty.value)
    return '未保存'
  if (lastSavedAt.value)
    return `已保存 ${dayjs(lastSavedAt.value).format('HH:mm:ss')}`
  return current.value?.updatedAt ? `修改于 ${formatTime(current.value.updatedAt)}` : ''
})

function formatTime(sec: number) {
  const d = dayjs(sec * 1000)
  if (d.isSame(dayjs(), 'day'))
    return d.format('HH:mm')
  return d.isSame(dayjs(), 'year') ? d.format('MM-DD HH:mm') : d.format('YYYY-MM-DD')
}

/** 本地草稿：保存失败或页面意外关闭时不丢内容 */
interface Draft {
  id?: number
  content: string
  version?: number
  at: number
}
function writeDraft() {
  const c = current.value
  if (!c)
    return
  try {
    uni.setStorageSync(DRAFT_KEY, { id: c.id, content: c.content, version: c.version, at: Date.now() } satisfies Draft)
  }
  catch {}
}
function clearDraft() {
  try {
    uni.removeStorageSync(DRAFT_KEY)
  }
  catch {}
}
const pendingDraft = ref<Draft>()

function scheduleSave(delay = SAVE_DELAY) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => save(), delay)
}

/** 保存当前便签；force 为 true 时忽略版本冲突直接覆盖 */
async function save(force = false) {
  const c = current.value
  clearTimeout(saveTimer)
  if (!c || !dirty.value || saving.value || (conflict.value && !force))
    return
  // 空白的新便签不保存
  if (!c.id && !c.content.trim())
    return
  if (c.content.length > MAX_LENGTH) {
    saveError.value = `超过 ${MAX_LENGTH} 字的上限`
    return
  }
  const seq = editSeq
  const content = c.content
  saving.value = true
  saveError.value = ''
  try {
    const res = c.id
      ? await updateNote(c.id, { content, baseVersion: c.version, force }, { hideErrorToast: true })
      : await createNote(content, { hideErrorToast: true })
    // 保存期间可能已切换到别的便签
    if (current.value === c) {
      c.id = res.id
      c.version = res.version
      c.updatedAt = res.updatedAt
      conflict.value = false
      lastSavedAt.value = Date.now()
      if (seq === editSeq) {
        dirty.value = false
        clearDraft()
      }
    }
    // 就地更新列表，避免每次保存都重新拉取
    const item = list.value.find(n => n.id === res.id)
    const fields = { ...res, title: deriveTitle(content), preview: derivePreview(content) }
    if (item)
      Object.assign(item, fields)
    else
      list.value.unshift({ ...fields })
    sortList()
  }
  catch (e: any) {
    if (e?.statusCode === 409) {
      conflict.value = true
    }
    else {
      saveError.value = e?.message || '网络异常'
      // 网络问题稍后自动重试
      scheduleSave(5000)
    }
  }
  finally {
    saving.value = false
  }
  // 保存期间又有输入，继续保存
  if (current.value === c && dirty.value && !conflict.value && !saveError.value)
    scheduleSave()
}

function onInput(e: any) {
  const c = current.value
  if (!c)
    return
  c.content = e.detail.value
  cursor.value = e.detail.cursor ?? c.content.length
  editSeq++
  dirty.value = true
  writeDraft()
  scheduleSave()
}

/** 切换便签前先把未保存的内容存掉 */
async function flush() {
  if (dirty.value && !conflict.value)
    await save()
}

function resetState() {
  dirty.value = false
  saveError.value = ''
  conflict.value = false
  lastSavedAt.value = 0
}

async function openNote(id: number) {
  if (current.value?.id === id)
    return
  await flush()
  opening.value = true
  try {
    const note = await getNote(id)
    resetState()
    current.value = { id: note.id, content: note.content, version: note.version, pinned: note.pinned, updatedAt: note.updatedAt, shareCode: note.shareCode, shareExpiresAt: note.shareExpiresAt }
    if (!wide.value)
      mode.value = note.content ? 'preview' : 'edit'
  }
  catch {}
  finally {
    opening.value = false
  }
}

async function newNote(content = '') {
  await flush()
  resetState()
  current.value = { content, pinned: false }
  mode.value = wide.value ? 'split' : 'edit'
  if (content) {
    dirty.value = true
    scheduleSave()
  }
  nextTick(() => (editorFocus.value = true))
}

async function backToList() {
  await flush()
  current.value = undefined
  resetState()
}

/* ---------------- 冲突处理 ---------------- */

/** 加载最新版本；自己的修改先复制到剪贴板，避免丢失 */
async function reloadLatest() {
  const c = current.value
  if (!c?.id)
    return
  copyText(c.content)
  const note = await getNote(c.id)
  resetState()
  clearDraft()
  current.value = { id: note.id, content: note.content, version: note.version, pinned: note.pinned, updatedAt: note.updatedAt, shareCode: note.shareCode, shareExpiresAt: note.shareExpiresAt }
  toast('已加载最新版本，你的修改已复制')
}

function overwrite() {
  save(true)
}

/* ---------------- 分享 ---------------- */

const shareOpen = ref(false)
const shareTtl = ref<ShareTtl>(0)
const sharing = ref(false)
const SHARE_TTLS: { value: ShareTtl, label: string }[] = [
  { value: 0, label: '永久' },
  { value: 86400, label: '1 天' },
  { value: 604800, label: '7 天' },
  { value: 2592000, label: '30 天' },
]

function shareLink(code?: string | null) {
  return code ? getPageUrl(`/pages-tools/notes/share?c=${code}`) : ''
}

async function openShare() {
  // 分享的是服务器上的版本，先把未保存的修改存掉
  await flush()
  if (!current.value?.id)
    return toast('先输入内容，保存后才能分享')
  shareOpen.value = true
}

function applyShare(meta: { id: number, shareCode: string | null, shareExpiresAt: number }) {
  if (current.value?.id === meta.id) {
    current.value.shareCode = meta.shareCode
    current.value.shareExpiresAt = meta.shareExpiresAt
  }
  const item = list.value.find(n => n.id === meta.id)
  if (item) {
    item.shareCode = meta.shareCode
    item.shareExpiresAt = meta.shareExpiresAt
  }
}

/** 开启分享或修改有效期；renew 为 true 时换一个新链接 */
async function doShare(renew = false) {
  const c = current.value
  if (!c?.id)
    return
  sharing.value = true
  try {
    const meta = await shareNote(c.id, shareTtl.value, renew)
    applyShare(meta)
    copyText(shareLink(meta.shareCode))
  }
  catch {}
  finally {
    sharing.value = false
  }
}

async function stopShare() {
  const c = current.value
  if (!c?.id)
    return
  sharing.value = true
  try {
    applyShare(await unshareNote(c.id))
    toast('已取消分享，原链接失效', 'success')
  }
  catch {}
  finally {
    sharing.value = false
  }
}

/** 在分享弹窗里展开 / 收起二维码 */
const shareQrOpen = ref(false)
const shareQrView = ref<InstanceType<typeof QrView>>()
watch(shareOpen, (v) => {
  if (!v)
    shareQrOpen.value = false
})

/* ---------------- 置顶、删除、导出 ---------------- */

async function togglePin(item: { id?: number, pinned: boolean }) {
  if (!item.id)
    return
  const pinned = !item.pinned
  await updateNote(item.id, { pinned })
  const target = list.value.find(n => n.id === item.id)
  if (target)
    target.pinned = pinned
  if (current.value?.id === item.id)
    current.value.pinned = pinned
  sortList()
}

function remove(id?: number) {
  const c = current.value
  if (!id) {
    // 未保存的新便签直接丢弃
    current.value = undefined
    resetState()
    clearDraft()
    return
  }
  uni.showModal({
    title: '删除便签',
    content: '删除后无法恢复，确定删除吗？',
    confirmColor: '#ef4444',
    success: async ({ confirm }) => {
      if (!confirm)
        return
      await deleteNote(id)
      list.value = list.value.filter(n => n.id !== id)
      if (c?.id === id) {
        clearTimeout(saveTimer)
        current.value = undefined
        resetState()
        clearDraft()
      }
      toast('已删除', 'success')
    },
  })
}

function exportMarkdown() {
  const c = current.value
  if (!c?.content)
    return toast('便签是空的')
  // #ifdef H5
  const blob = new Blob([c.content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${title.value.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) || 'note'}.md`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  // #endif
  // #ifndef H5
  copyText(c.content)
  // #endif
}

/* ---------------- 编辑器工具栏 ---------------- */

// #ifdef H5
function editorEl() {
  return document.querySelector('.ot-notes__editor textarea') as HTMLTextAreaElement | null
}
// #endif

/**
 * 在光标处插入；有选中文字时（H5）包裹选中内容
 * @param line 是否作用于行首（标题、列表、引用等）
 */
function insert(before: string, after = '', placeholder = '', line = false) {
  const c = current.value
  if (!c)
    return
  let start = cursor.value
  let end = cursor.value
  // #ifdef H5
  const el = editorEl()
  if (el) {
    start = el.selectionStart
    end = el.selectionEnd
  }
  // #endif
  start = Math.min(start, c.content.length)
  end = Math.min(Math.max(end, start), c.content.length)
  if (line) {
    // 移到行首
    start = c.content.lastIndexOf('\n', start - 1) + 1
    end = Math.max(end, start)
  }
  const selected = c.content.slice(start, end) || placeholder
  const text = `${before}${selected}${after}`
  c.content = c.content.slice(0, start) + text + c.content.slice(end)
  // 选中占位文字，方便直接输入替换
  const selFrom = start + before.length
  const selTo = selFrom + selected.length
  cursor.value = selTo
  editSeq++
  dirty.value = true
  writeDraft()
  scheduleSave()
  nextTick(() => {
    // #ifdef H5
    const t = editorEl()
    if (t) {
      t.value = c.content
      t.focus()
      t.setSelectionRange(selFrom, selTo)
    }
    // #endif
    // #ifndef H5
    selStart.value = selFrom
    selEnd.value = selTo
    editorFocus.value = true
    // #endif
  })
}

const TOOLS: { icon: string, title: string, run: () => void }[] = [
  { icon: 'i-carbon-text-bold', title: '粗体', run: () => insert('**', '**', '粗体') },
  { icon: 'i-carbon-text-italic', title: '斜体', run: () => insert('*', '*', '斜体') },
  { icon: 'i-carbon-text-strikethrough', title: '删除线', run: () => insert('~~', '~~', '删除线') },
  { icon: 'i-carbon-heading', title: '标题', run: () => insert('## ', '', '标题', true) },
  { icon: 'i-carbon-list-bulleted', title: '无序列表', run: () => insert('- ', '', '列表项', true) },
  { icon: 'i-carbon-list-numbered', title: '有序列表', run: () => insert('1. ', '', '列表项', true) },
  { icon: 'i-carbon-checkbox-checked', title: '任务', run: () => insert('- [ ] ', '', '待办事项', true) },
  { icon: 'i-carbon-quotes', title: '引用', run: () => insert('> ', '', '引用', true) },
  { icon: 'i-carbon-code', title: '行内代码', run: () => insert('`', '`', 'code') },
  { icon: 'i-carbon-terminal', title: '代码块', run: () => insert('\n```js\n', '\n```\n', '// 代码') },
  { icon: 'i-carbon-link', title: '链接', run: () => insert('[', '](https://)', '链接文字') },
  { icon: 'i-carbon-table', title: '表格', run: () => insert('\n| 列 1 | 列 2 |\n| --- | --- |\n| ', ' |  |\n', '内容') },
]

// #ifdef H5
/** Tab 缩进、Ctrl/⌘+S 立即保存 */
function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    save()
    return
  }
  if (e.key === 'Tab' && target.tagName === 'TEXTAREA' && target.closest('.ot-notes__editor')) {
    e.preventDefault()
    insert('  ')
  }
}
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}
function onResize() {
  wide.value = window.innerWidth >= 768
  if (!wide.value && mode.value === 'split')
    mode.value = 'edit'
}
// #endif

/* ---------------- 生命周期 ---------------- */

onLoad(async (query) => {
  try {
    const draft = uni.getStorageSync(DRAFT_KEY) as Draft | ''
    if (draft && draft.content)
      pendingDraft.value = draft
  }
  catch {}
  await loadList()
  const id = Number(query?.id)
  if (id)
    openNote(id)
  else if (wide.value && list.value.length && !pendingDraft.value)
    openNote(list.value[0].id)
})

/** 恢复上次没保存成功的草稿 */
async function restoreDraft() {
  const d = pendingDraft.value
  pendingDraft.value = undefined
  if (!d)
    return
  if (d.id) {
    current.value = undefined
    await openNote(d.id)
    const c = current.value as Current | undefined
    if (c?.id === d.id) {
      c.content = d.content
      // 用草稿当时的版本保存，期间若其他设备改过会提示冲突
      c.version = d.version
      dirty.value = true
      save()
    }
  }
  else {
    newNote(d.content)
  }
}
function discardDraft() {
  pendingDraft.value = undefined
  clearDraft()
}

onShow(() => {
  // #ifdef H5
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('resize', onResize)
  // #endif
})
function unbind() {
  // #ifdef H5
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('resize', onResize)
  // #endif
}
onHide(() => {
  unbind()
  flush()
})
onUnload(() => {
  unbind()
  flush()
})

const showList = computed(() => wide.value || !current.value)
</script>

<template>
  <ot-tool-layout :max-width="1280">
    <view v-if="pendingDraft" class="ot-notes__banner">
      <view class="i-carbon-document shrink-0 text-16px" />
      <text class="min-w-0 flex-1">有一份 {{ dayjs(pendingDraft.at).format('MM-DD HH:mm') }} 未保存成功的草稿</text>
      <text class="ot-notes__link" @click="restoreDraft">恢复</text>
      <text class="ot-notes__link is-muted" @click="discardDraft">丢弃</text>
    </view>

    <view class="ot-notes" :class="{ 'is-wide': wide }">
      <!-- 列表 -->
      <view v-if="showList" class="ot-notes__side">
        <view class="flex items-center gap-2">
          <view class="ot-notes__search">
            <view class="i-carbon-search shrink-0 text-14px text-muted" />
            <input v-model="keyword" class="min-w-0 flex-1 text-13px" placeholder="搜索标题和内容">
          </view>
          <wd-button size="small" icon="add" @click="newNote()">
            新建
          </wd-button>
        </view>
        <view class="ot-notes__list">
          <view v-if="!filtered.length" class="py-8 text-center text-13px text-muted">
            {{ listLoading ? '加载中…' : keyword ? '没有匹配的便签' : '还没有便签，点「新建」写第一条' }}
          </view>
          <view
            v-for="n in filtered" :key="n.id" class="ot-notes__item"
            :class="{ 'is-active': current?.id === n.id }" @click="openNote(n.id)"
          >
            <view class="flex items-center gap-1.5">
              <view v-if="n.pinned" class="i-carbon-pin-filled shrink-0 text-12px text-amber-500" />
              <view v-if="n.shareCode" class="i-carbon-share shrink-0 text-12px text-[var(--wot-color-theme)]" />
              <text class="min-w-0 flex-1 truncate text-14px text-main font-600">{{ n.title || '无标题' }}</text>
            </view>
            <text v-if="n.preview" class="ot-ellipsis-2 mt-1 text-12px text-sub leading-18px">{{ n.preview }}</text>
            <text class="mt-1 text-11px text-muted">{{ formatTime(n.updatedAt) }} · {{ n.size }} 字</text>
          </view>
        </view>
      </view>

      <!-- 编辑器 -->
      <view v-if="current" class="ot-notes__main">
        <view class="ot-notes__bar">
          <view v-if="!wide" class="i-carbon-arrow-left cursor-pointer p-1 text-18px text-sub" @click="backToList" />
          <ot-segmented v-model="mode" :options="modeOptions" size="small" />
          <view class="flex-1" />
          <text class="ot-notes__status" :class="{ 'is-error': saveError || conflict, 'is-pending': dirty && !saveError && !conflict }">
            {{ statusText }}
          </text>
          <view v-if="saveError" class="ot-notes__link text-12px" @click="save()">
            重试
          </view>
        </view>

        <view v-if="conflict" class="ot-notes__banner is-warn">
          <view class="i-carbon-warning-alt shrink-0 text-16px" />
          <text class="min-w-0 flex-1">这条便签已在其他设备上修改过，自动保存已暂停。</text>
          <text class="ot-notes__link" @click="reloadLatest">加载最新</text>
          <text class="ot-notes__link" @click="overwrite">用我的覆盖</text>
        </view>

        <view v-if="mode !== 'preview'" class="ot-notes__tools">
          <view v-for="t in TOOLS" :key="t.title" class="ot-notes__tool" :title="t.title" @click="t.run">
            <view :class="t.icon" />
          </view>
        </view>

        <view class="ot-notes__body" :class="`is-${mode}`">
          <view v-if="mode !== 'preview'" class="ot-notes__editor">
            <textarea
              class="ot-notes__textarea ot-mono"
              :value="current.content"
              :maxlength="-1"
              :focus="editorFocus"
              :selection-start="selStart"
              :selection-end="selEnd"
              :show-confirm-bar="false"
              :adjust-position="false"
              :disable-default-padding="true"
              placeholder="支持 Markdown：# 标题、**粗体**、- 列表、- [ ] 待办、```代码块``` …&#10;输入后自动保存"
              placeholder-class="ot-notes__placeholder"
              @input="onInput"
              @blur="editorFocus = false; save()"
            />
          </view>
          <scroll-view v-if="mode !== 'edit'" scroll-y class="ot-notes__preview">
            <md-view v-if="current.content.trim()" :source="current.content" />
            <view v-else class="py-10 text-center text-13px text-muted">
              预览区：在左侧输入 Markdown
            </view>
          </scroll-view>
        </view>

        <view class="ot-notes__foot">
          <text>{{ stats.words }} 字 · {{ stats.lines }} 行</text>
          <view class="flex-1" />
          <view class="ot-notes__action" @click="copyText(current.content)">
            <view class="i-carbon-copy" />复制全文
          </view>
          <view class="ot-notes__action" @click="exportMarkdown">
            <!-- #ifdef H5 -->
            <view class="i-carbon-download" />导出 .md
            <!-- #endif -->
            <!-- #ifndef H5 -->
            <view class="i-carbon-document" />复制 Markdown
            <!-- #endif -->
          </view>
          <view class="ot-notes__action" :class="{ 'is-shared': current.shareCode }" @click="openShare">
            <view class="i-carbon-share" />{{ current.shareCode ? '已分享' : '分享' }}
          </view>
          <view v-if="current.id" class="ot-notes__action" @click="togglePin(current)">
            <view :class="current.pinned ? 'i-carbon-pin-filled' : 'i-carbon-pin'" />{{ current.pinned ? '取消置顶' : '置顶' }}
          </view>
          <view class="ot-notes__action is-danger" @click="remove(current.id)">
            <view class="i-carbon-trash-can" />删除
          </view>
        </view>
      </view>

      <view v-else-if="wide" class="ot-notes__main is-empty">
        <view class="i-carbon-notebook text-40px text-muted" />
        <text class="mt-2 text-13px text-muted">{{ opening ? '加载中…' : '选择左侧便签，或新建一条' }}</text>
      </view>
    </view>

    <view class="px-1 text-12px text-muted leading-20px">
      停止输入后自动保存，所有登录设备同步；内容在服务端加密存储。代码块写上语言（如 ```js）即可高亮，支持 JS / TS / Python / Go / Java / SQL / Shell 等 20 多种语言。<!-- #ifdef H5 -->Ctrl+S 立即保存，Tab 缩进。<!-- #endif -->
    </view>

    <wd-popup v-model="shareOpen" position="center" custom-style="border-radius: 16px; width: min(92vw, 420px);">
      <view v-if="current" class="ot-notes__share">
        <view class="flex items-center gap-2">
          <view class="i-carbon-share text-18px text-[var(--wot-color-theme)]" />
          <text class="flex-1 text-16px text-main font-600">分享便签</text>
          <view class="i-carbon-close cursor-pointer text-18px text-muted" @click="shareOpen = false" />
        </view>
        <text class="mt-2 block text-12px text-muted leading-18px">
          拿到链接的人无需登录即可只读查看，看到的始终是你的最新内容；取消分享后链接立即失效。
        </text>
        <view class="mt-4 flex items-center gap-3 text-13px text-sub">
          <text class="shrink-0">有效期</text>
          <ot-segmented v-model="shareTtl" :options="SHARE_TTLS" size="small" />
        </view>
        <template v-if="current.shareCode">
          <view class="ot-notes__share-link ot-mono" @click="copyText(shareLink(current.shareCode))">
            {{ shareLink(current.shareCode) || '（无法生成链接）' }}
          </view>
          <text class="mt-1.5 block text-12px text-muted">
            {{ current.shareExpiresAt ? `${dayjs(current.shareExpiresAt * 1000).format('YYYY-MM-DD HH:mm')} 失效` : '永久有效' }}
          </text>
          <view class="mt-4 flex flex-wrap gap-2">
            <wd-button size="small" icon="copy" @click="copyText(shareLink(current.shareCode))">
              复制链接
            </wd-button>
            <wd-button size="small" type="info" plain :loading="sharing" @click="doShare(false)">
              更新有效期
            </wd-button>
            <wd-button size="small" type="info" plain @click="shareQrOpen = !shareQrOpen">
              {{ shareQrOpen ? '收起二维码' : '二维码' }}
            </wd-button>
            <wd-button size="small" type="info" plain :loading="sharing" @click="doShare(true)">
              换新链接
            </wd-button>
            <wd-button size="small" type="error" plain :loading="sharing" @click="stopShare">
              取消分享
            </wd-button>
          </view>
        </template>
        <view v-if="current.shareCode && shareQrOpen" class="mt-4 flex flex-col items-center gap-2">
          <qr-view ref="shareQrView" :text="shareLink(current.shareCode)" :note="title" :size="180" />
          <text class="cursor-pointer text-13px text-[var(--wot-color-theme)]" @click="shareQrView?.save()">保存图片</text>
        </view>
        <wd-button v-else-if="!current.shareCode" block custom-class="mt-4" :loading="sharing" @click="doShare(false)">
          生成分享链接
        </wd-button>
      </view>
    </wd-popup>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-notes {
  display: flex;
  flex-direction: column;
  gap: 12px;

  &.is-wide {
    flex-direction: row;
    align-items: stretch;
    min-height: 560px;
  }
}

.ot-notes__side {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 14px;
  background: var(--ot-card);
  border: 1px solid var(--ot-border);

  .is-wide & {
    flex-shrink: 0;
    width: 260px;
    max-height: 75vh;
  }
}

.ot-notes__search {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  background: var(--ot-fill);
  color: var(--ot-text);
}

.ot-notes__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  min-height: 0;
}

.ot-notes__item {
  display: flex;
  flex-direction: column;
  padding: 10px;
  border-radius: 10px;
  cursor: pointer;
  border: 1px solid transparent;

  &:hover {
    background: var(--ot-fill);
  }

  &.is-active {
    background: rgba(245, 158, 11, 0.08);
    border-color: rgba(245, 158, 11, 0.4);
  }
}

.ot-notes__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  padding: 12px;
  border-radius: 14px;
  background: var(--ot-card);
  border: 1px solid var(--ot-border);

  &.is-empty {
    align-items: center;
    justify-content: center;
  }
}

.ot-notes__bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ot-notes__status {
  font-size: 12px;
  color: var(--ot-text-3);
  white-space: nowrap;

  &.is-pending {
    color: #d97706;
  }

  &.is-error {
    color: #dc2626;
  }
}

.ot-notes__banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: var(--ot-text-2);
  background: var(--ot-fill);

  &.is-warn {
    margin-top: 10px;
    color: #b45309;
    background: rgba(245, 158, 11, 0.12);
  }
}

.ot-notes__link {
  flex-shrink: 0;
  color: var(--wot-color-theme);
  font-weight: 600;
  cursor: pointer;

  &.is-muted {
    color: var(--ot-text-3);
  }
}

.ot-notes__tools {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  margin-top: 10px;
  padding: 4px;
  border-radius: 10px;
  background: var(--ot-fill);
}

.ot-notes__tool {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 30px;
  border-radius: 7px;
  font-size: 16px;
  color: var(--ot-text-2);
  cursor: pointer;

  &:hover {
    color: var(--wot-color-theme);
    background: var(--ot-card);
  }
}

.ot-notes__body {
  display: flex;
  flex: 1;
  gap: 12px;
  margin-top: 10px;
  min-height: 0;

  &.is-split > * {
    flex: 1;
    min-width: 0;
  }
}

.ot-notes__editor {
  display: flex;
  flex: 1;
  min-width: 0;
}

.ot-notes__textarea {
  box-sizing: border-box;
  width: 100%;
  height: 60vh;
  min-height: 320px;
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--ot-text);
  background: var(--ot-fill);
  border: 1px solid transparent;
  resize: none;

  &:focus {
    border-color: var(--wot-color-theme);
  }
}

.ot-notes__preview {
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  height: 60vh;
  min-height: 320px;
  padding: 4px 14px;
  border-radius: 10px;
  border: 1px solid var(--ot-border);

  .is-preview & {
    height: auto;
    min-height: 320px;
    max-height: none;
    border: none;
    padding: 4px 2px;
  }
}

.ot-notes__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--ot-text-3);
}

.ot-notes__share {
  padding: 18px;
}

.ot-notes__share-link {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 12px;
  word-break: break-all;
  color: var(--ot-text);
  background: var(--ot-fill);
  cursor: pointer;
}

.ot-notes__action {
  display: flex;
  align-items: center;
  gap: 3px;
  color: var(--ot-text-2);
  cursor: pointer;

  &:hover {
    color: var(--wot-color-theme);
  }

  &.is-danger:hover {
    color: #ef4444;
  }

  &.is-shared {
    color: var(--wot-color-theme);
  }
}

:deep(.ot-notes__placeholder) {
  color: var(--ot-text-3);
}
</style>
