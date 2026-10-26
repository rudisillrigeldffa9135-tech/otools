<script lang="ts" setup>
import type { INote, INoteFolder, INoteListItem, IShareMeta, ShareTtl } from '@/api/notes'
import type { OutlineItem } from './markdown'
import dayjs from 'dayjs'
import { createNote, deleteNote, getNote, listFolders, listNotes, shareNote, unshareNote, updateNote } from '@/api/notes'
import { copyText, toast } from '@/utils/common'
import { userKey } from '@/utils/user-storage'
import { createTodo } from '@/api/todo'
import { getPageUrl } from '@/utils/site'
import QrView from '../qrcode/components/qr-view.vue'
import MdView from './components/md-view.vue'
import NoteFolders from './components/note-folders.vue'
import NoteHistory from './components/note-history.vue'
import NoteOutline from './components/note-outline.vue'
// #ifdef H5
import H5Textarea from './components/h5-textarea'
import { createScrollSync } from './scroll-sync'
// #endif
import { countText, extractOutline } from './markdown'
import { derivePreview, deriveTitle, extractTasks } from './note-text'

definePage({
  style: { navigationBarTitleText: 'Markdown 便签' },
})

const MAX_LENGTH = 100_000
/** 停止输入多久后自动保存 */
const SAVE_DELAY = 800
const DRAFT_KEY = 'ot-notes-draft'
/** 按用户记住的界面偏好 */
const FOLDER_KEY = 'ot-notes-folder'
const OUTLINE_KEY = 'ot-notes-outline'
const SYNC_KEY = 'ot-notes-scroll-sync'

function readPref<T>(key: string, fallback: T): T {
  try {
    const v = uni.getStorageSync(userKey(key))
    return v === '' || v === undefined || v === null ? fallback : v as T
  }
  catch {
    return fallback
  }
}
function writePref(key: string, value: unknown) {
  try {
    uni.setStorageSync(userKey(key), value)
  }
  catch {}
}

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
  folderId: number | null
  updatedAt?: number
  shareCode?: string | null
  shareExpiresAt?: number
  shareLocked?: boolean
  /** 分享访问密码，只有自己能看到 */
  sharePassword?: string | null
}

function toCurrent(note: INote): Current {
  return {
    id: note.id,
    content: note.content,
    version: note.version,
    pinned: note.pinned,
    folderId: note.folderId,
    updatedAt: note.updatedAt,
    shareCode: note.shareCode,
    shareExpiresAt: note.shareExpiresAt,
    shareLocked: note.shareLocked,
    sharePassword: note.sharePassword,
  }
}

const current = ref<Current>()

/* ---------------- 文件夹 ---------------- */

type FolderFilter = 'all' | 'none' | number
const folders = ref<INoteFolder[]>([])
const activeFolder = ref<FolderFilter>(readPref<FolderFilter>(FOLDER_KEY, 'all'))
watch(activeFolder, v => writePref(FOLDER_KEY, v))

const folderCounts = computed(() => {
  const counts: Record<string, number> = { all: list.value.length, none: 0 }
  for (const n of list.value) {
    const key = n.folderId ?? 'none'
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
})

function folderName(id?: number | null) {
  return id ? folders.value.find(f => f.id === id)?.name ?? '' : ''
}

async function loadFolders() {
  try {
    folders.value = await listFolders()
  }
  catch {}
  const a = activeFolder.value
  if (typeof a === 'number' && !folders.value.some(f => f.id === a))
    activeFolder.value = 'all'
}

/** 文件夹删除后，其中的便签变成未分类 */
function onFolderDeleted(id: number) {
  for (const n of list.value) {
    if (n.folderId === id)
      n.folderId = null
  }
  if (current.value?.folderId === id)
    current.value.folderId = null
}

const filtered = computed(() => {
  const a = activeFolder.value
  const inFolder = a === 'all' ? list.value : list.value.filter(n => (a === 'none' ? !n.folderId : n.folderId === a))
  const kw = keyword.value.trim().toLowerCase()
  if (!kw)
    return inFolder
  return inFolder.filter(n => `${n.title} ${n.preview}`.toLowerCase().includes(kw))
})
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

/**
 * 输入框显示的文字。只在「外部」替换内容时（打开便签、工具栏插入、恢复草稿等）更新，
 * 打字时不写回：uni 的 textarea 会把输入事件节流 100ms、把 value 变化延迟 100ms 写回，
 * 打字快或用输入法组字时，旧值会覆盖刚输入的内容，光标跳到末尾；小程序 setData 回写也有同样问题。
 */
const editorValue = ref('')
function setEditorText(text: string) {
  if (editorValue.value !== text) {
    editorValue.value = text
    return
  }
  // 值没变时 Vue 不会更新输入框，而输入框里可能已经是打字后的内容，先改一下再改回来强制刷新
  editorValue.value = `${text} `
  nextTick(() => (editorValue.value = text))
}
// 切换便签（current 整个替换）时载入新内容
watch(() => current.value, c => setEditorText(c?.content ?? ''))
// 从「预览」切回编辑时输入框会重新创建，先同步成最新内容
watch(mode, () => (editorValue.value = current.value?.content ?? ''))

/** 预览与统计稍微延后，长文档打字时不卡 */
const previewSource = ref('')
let previewTimer: ReturnType<typeof setTimeout> | undefined
watch(() => current.value?.content ?? '', (v, old) => {
  clearTimeout(previewTimer)
  // 打开 / 切换便签时立即显示
  if (!old || Math.abs(v.length - old.length) > 200)
    previewSource.value = v
  else
    previewTimer = setTimeout(() => (previewSource.value = v), 150)
}, { immediate: true })

const stats = computed(() => countText(previewSource.value))
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
let draftTimer: ReturnType<typeof setTimeout> | undefined
function scheduleDraft() {
  clearTimeout(draftTimer)
  draftTimer = setTimeout(writeDraft, 400)
}
function writeDraft() {
  clearTimeout(draftTimer)
  const c = current.value
  if (!c)
    return
  try {
    uni.setStorageSync(userKey(DRAFT_KEY), { id: c.id, content: c.content, version: c.version, at: Date.now() } satisfies Draft)
  }
  catch {}
}
function clearDraft() {
  clearTimeout(draftTimer)
  try {
    uni.removeStorageSync(userKey(DRAFT_KEY))
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
      : await createNote(content, c.folderId, { hideErrorToast: true })
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

function applyInput(value: string, cursorAt?: number | null) {
  const c = current.value
  if (!c)
    return
  c.content = value
  cursor.value = cursorAt ?? value.length
  editSeq++
  dirty.value = true
  scheduleDraft()
  scheduleSave()
}

// #ifdef H5
/** H5 直接用原生 textarea：输入事件不节流，也不会被回写打断输入法 */
function onNativeInput(e: Event) {
  const el = e.target as HTMLTextAreaElement
  applyInput(el.value, el.selectionEnd)
}
// #endif

// #ifndef H5
function onMpInput(e: any) {
  applyInput(e.detail.value, e.detail.cursor)
}
// #endif

function onEditorBlur() {
  editorFocus.value = false
  if (dirty.value)
    writeDraft()
  save()
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
    current.value = toCurrent(note)
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
  // 正在看某个文件夹时，新便签直接放进这个文件夹
  current.value = { content, pinned: false, folderId: typeof activeFolder.value === 'number' ? activeFolder.value : null }
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
  current.value = toCurrent(note)
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

/** 访问密码 */
const sharePwdOn = ref(false)
const sharePwdInput = ref('')
const PWD_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'

function randomSharePassword() {
  // 小程序没有 crypto，退回 Math.random（分享密码只防随手打开，错误次数另有限流）
  const bytes = typeof crypto !== 'undefined' && crypto.getRandomValues
    ? crypto.getRandomValues(new Uint8Array(6))
    : Uint8Array.from({ length: 6 }, () => Math.floor(Math.random() * 256))
  sharePwdInput.value = Array.from(bytes, b => PWD_CHARS[b % PWD_CHARS.length]).join('')
}
// 打开密码开关时自动生成一个
watch(sharePwdOn, (v) => {
  if (v && !sharePwdInput.value)
    randomSharePassword()
})

/** 密码设置改了但还没保存 */
const shareDirty = computed(() => !!current.value?.shareCode && (sharePwdOn.value ? sharePwdInput.value.trim() : '') !== (current.value?.sharePassword || ''))

/** 复制给别人的内容：链接，有密码时附上密码 */
function shareText() {
  const c = current.value
  const link = shareLink(c?.shareCode)
  return c?.sharePassword ? `${link}\n访问密码：${c.sharePassword}` : link
}

async function openShare() {
  // 分享的是服务器上的版本，先把未保存的修改存掉
  await flush()
  if (!current.value?.id)
    return toast('先输入内容，保存后才能分享')
  sharePwdOn.value = !!current.value.sharePassword
  sharePwdInput.value = current.value.sharePassword || ''
  shareOpen.value = true
}

function applyShare(meta: IShareMeta) {
  if (current.value?.id === meta.id) {
    current.value.shareCode = meta.shareCode
    current.value.shareExpiresAt = meta.shareExpiresAt
    current.value.shareLocked = meta.shareLocked
    current.value.sharePassword = meta.sharePassword
  }
  const item = list.value.find(n => n.id === meta.id)
  if (item) {
    item.shareCode = meta.shareCode
    item.shareExpiresAt = meta.shareExpiresAt
    item.shareLocked = meta.shareLocked
  }
}

/** 开启分享或保存有效期 / 密码设置；renew 为 true 时换一个新链接 */
async function doShare(renew = false) {
  const c = current.value
  if (!c?.id)
    return
  let password = ''
  if (sharePwdOn.value) {
    password = sharePwdInput.value.trim()
    if (!password)
      return toast('请填写访问密码，或关闭「访问密码」')
    if (/\s/.test(password))
      return toast('访问密码不能包含空格')
  }
  sharing.value = true
  try {
    const meta = await shareNote(c.id, shareTtl.value, renew, password)
    applyShare(meta)
    copyText(shareText())
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

/* ---------------- 移动到文件夹 ---------------- */

const moveOpen = ref(false)

async function moveTo(folderId: number | null) {
  const c = current.value
  moveOpen.value = false
  if (!c || c.folderId === folderId)
    return
  if (c.id) {
    try {
      await updateNote(c.id, { folderId })
    }
    catch {
      return
    }
    const item = list.value.find(n => n.id === c.id)
    if (item)
      item.folderId = folderId
  }
  c.folderId = folderId
  toast(`已移到「${folderName(folderId) || '未分类'}」`)
}

/* ---------------- 历史版本 ---------------- */

const historyOpen = ref(false)

async function openHistory() {
  // 历史是服务器上的版本，先把未保存的修改存掉
  await flush()
  if (!current.value?.id)
    return toast('便签还没有保存过')
  historyOpen.value = true
}

function onRestored(note: INote) {
  resetState()
  clearDraft()
  current.value = toCurrent(note)
  const item = list.value.find(n => n.id === note.id)
  if (item)
    Object.assign(item, { size: note.size, version: note.version, updatedAt: note.updatedAt, title: note.title, preview: derivePreview(note.content) })
  sortList()
}

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

/** 把便签里未完成的任务（- [ ] xxx）添加到待办的收集箱 */
function tasksToTodos() {
  const c = current.value
  const tasks = extractTasks(c?.content ?? '')
  if (!tasks.length)
    return toast('没有找到未完成的任务（以 - [ ] 开头的行）')
  uni.showModal({
    title: '转为待办',
    content: `找到 ${tasks.length} 个未完成的任务，添加到待办的「收集箱」？`,
    success: async ({ confirm }) => {
      if (!confirm)
        return
      const source = `来自便签「${deriveTitle(c?.content ?? '') || '无标题'}」`
      let ok = 0
      for (const title of tasks) {
        try {
          await createTodo({ title, note: source })
          ok++
        }
        catch {
          break
        }
      }
      toast(ok === tasks.length ? `已添加 ${ok} 个待办` : `添加了 ${ok} 个，其余失败`, ok ? 'success' : 'none')
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

/* ---------------- 全屏编辑 ---------------- */

const fullscreen = ref(false)

function toggleFullscreen(on = !fullscreen.value) {
  fullscreen.value = on
  // #ifdef H5
  // 同时请求浏览器全屏（隐藏地址栏等）；不支持或被拒绝时仍是铺满页面的编辑区
  try {
    if (on && !document.fullscreenElement)
      document.documentElement.requestFullscreen?.()?.catch(() => {})
    else if (!on && document.fullscreenElement)
      document.exitFullscreen?.()?.catch(() => {})
  }
  catch {}
  document.body.style.overflow = on ? 'hidden' : ''
  // #endif
}

// #ifdef H5
/** 按 Esc 退出浏览器全屏时，同步退出全屏编辑 */
function onFullscreenChange() {
  if (!document.fullscreenElement && fullscreen.value)
    toggleFullscreen(false)
}
// #endif

watch(() => current.value, (c) => {
  if (!c && fullscreen.value)
    toggleFullscreen(false)
})

/* ---------------- 分栏滚动同步（H5） ---------------- */

const scrollSync = ref<boolean>(readPref(SYNC_KEY, true))
watch(scrollSync, v => writePref(SYNC_KEY, v))

// #ifdef H5
const sync = createScrollSync({
  editor: () => editorEl(),
  preview: () => document.querySelector<HTMLElement>('.ot-notes__preview'),
  text: () => current.value?.content ?? '',
  enabled: () => scrollSync.value && mode.value === 'split',
  onScroll: updateActiveHeading,
})
// #endif

/* ---------------- 大纲 ---------------- */

const outline = computed<OutlineItem[]>(() => extractOutline(previewSource.value))
/** 宽屏：大纲作为一栏显示（记住开关）；窄屏：弹出层 */
const showOutline = ref<boolean>(readPref(OUTLINE_KEY, false))
const outlinePopup = ref(false)
const activeHeading = ref(-1)
watch(showOutline, v => writePref(OUTLINE_KEY, v))

function toggleOutline() {
  if (wide.value || fullscreen.value)
    showOutline.value = !showOutline.value
  else
    outlinePopup.value = true
}

function updateActiveHeading() {
  // #ifdef H5
  const line = sync.topLine()
  let idx = -1
  for (let i = 0; i < outline.value.length; i++) {
    if (outline.value[i].line <= line + 0.5)
      idx = i
    else
      break
  }
  activeHeading.value = idx
  // #endif
}

function lineOffset(text: string, line: number) {
  let pos = 0
  for (let i = 0; i < line; i++) {
    const next = text.indexOf('\n', pos)
    if (next === -1)
      return text.length
    pos = next + 1
  }
  return pos
}

function jumpTo(item: OutlineItem) {
  outlinePopup.value = false
  activeHeading.value = outline.value.indexOf(item)
  // #ifdef H5
  nextTick(() => sync.scrollToLine(item.line))
  // #endif
  // #ifndef H5
  // 小程序：把光标放到标题所在行，输入框会滚动到光标处
  if (mode.value === 'preview')
    mode.value = 'edit'
  const pos = lineOffset(current.value?.content ?? '', item.line)
  selStart.value = pos
  selEnd.value = pos
  editorFocus.value = false
  nextTick(() => (editorFocus.value = true))
  // #endif
}

// #ifdef H5
// 编辑区 / 预览区重新创建后重新绑定
watch([mode, () => current.value, fullscreen, showOutline, wide], () => nextTick(() => {
  sync.bind()
  updateActiveHeading()
}))
// 预览重新渲染后，锚点位置需要重新测量
watch(previewSource, () => nextTick(() => {
  sync.invalidate()
  updateActiveHeading()
}))
// #endif

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
  setEditorText(c.content)
  scheduleDraft()
  scheduleSave()
  nextTick(() => {
    // #ifdef H5
    const t = editorEl()
    if (t) {
      if (t.value !== c.content)
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
  if (e.key === 'Escape' && fullscreen.value) {
    e.preventDefault()
    toggleFullscreen(false)
    return
  }
  if (e.key === 'Tab' && target.tagName === 'TEXTAREA' && target.closest('.ot-notes__editor')) {
    e.preventDefault()
    insert('  ')
  }
}
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value) {
    writeDraft()
    e.preventDefault()
    e.returnValue = ''
  }
}
function onResize() {
  sync.invalidate()
  wide.value = window.innerWidth >= 768
  if (!wide.value && mode.value === 'split')
    mode.value = 'edit'
}
// #endif

/* ---------------- 生命周期 ---------------- */

onLoad(async (query) => {
  try {
    const draft = uni.getStorageSync(userKey(DRAFT_KEY)) as Draft | ''
    if (draft && draft.content)
      pendingDraft.value = draft
  }
  catch {}
  await Promise.all([loadList(), loadFolders()])
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
      setEditorText(d.content)
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
  document.addEventListener('fullscreenchange', onFullscreenChange)
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('resize', onResize)
  // #endif
})
function unbind() {
  // #ifdef H5
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('resize', onResize)
  // #endif
}
onHide(() => {
  unbind()
  if (dirty.value)
    writeDraft()
  flush()
})
onUnload(() => {
  unbind()
  // #ifdef H5
  sync.unbind()
  // #endif
  if (fullscreen.value)
    toggleFullscreen(false)
  if (dirty.value)
    writeDraft()
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
        <note-folders v-model="activeFolder" v-model:folders="folders" :counts="folderCounts" @deleted="onFolderDeleted" />
        <view class="ot-notes__list">
          <view v-if="!filtered.length" class="py-8 text-center text-13px text-muted">
            {{ listLoading ? '加载中…' : keyword ? '没有匹配的便签' : activeFolder === 'all' ? '还没有便签，点「新建」写第一条' : '这里还没有便签，点「新建」会直接放进来' }}
          </view>
          <view
            v-for="n in filtered" :key="n.id" class="ot-notes__item"
            :class="{ 'is-active': current?.id === n.id }" @click="openNote(n.id)"
          >
            <view class="flex items-center gap-1.5">
              <view v-if="n.pinned" class="i-carbon-pin-filled shrink-0 text-12px text-amber-500" />
              <view v-if="n.shareCode" :class="n.shareLocked ? 'i-carbon-locked' : 'i-carbon-share'" class="shrink-0 text-12px text-[var(--wot-color-theme)]" />
              <text class="min-w-0 flex-1 truncate text-14px text-main font-600">{{ n.title || '无标题' }}</text>
            </view>
            <text v-if="n.preview" class="ot-ellipsis-2 mt-1 text-12px text-sub leading-18px">{{ n.preview }}</text>
            <view class="mt-1 flex items-center gap-1.5 text-11px text-muted">
              <text>{{ formatTime(n.updatedAt) }} · {{ n.size }} 字</text>
              <text v-if="activeFolder === 'all' && n.folderId" class="ot-notes__folder-tag">{{ folderName(n.folderId) }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 编辑器 -->
      <view v-if="current" class="ot-notes__main" :class="{ 'is-fullscreen': fullscreen }">
        <view class="ot-notes__bar">
          <view v-if="!wide && !fullscreen" class="i-carbon-arrow-left cursor-pointer p-1 text-18px text-sub" @click="backToList" />
          <text v-if="fullscreen" class="ot-notes__fs-title">{{ title }}</text>
          <ot-segmented v-model="mode" :options="modeOptions" size="small" />
          <view class="flex-1" />
          <text class="ot-notes__status" :class="{ 'is-error': saveError || conflict, 'is-pending': dirty && !saveError && !conflict }">
            {{ statusText }}
          </text>
          <view v-if="saveError" class="ot-notes__link text-12px" @click="save()">
            重试
          </view>
          <view
            class="ot-notes__icon-btn" :class="{ 'is-on': showOutline && (wide || fullscreen) }" title="大纲"
            @click="toggleOutline"
          >
            <view class="i-carbon-list-dropdown" />
          </view>
          <!-- #ifdef H5 -->
          <view
            v-if="mode === 'split'" class="ot-notes__icon-btn" :class="{ 'is-on': scrollSync }"
            :title="scrollSync ? '滚动同步：开（点击关闭）' : '滚动同步：关（点击开启）'" @click="scrollSync = !scrollSync"
          >
            <view :class="scrollSync ? 'i-carbon-link' : 'i-carbon-unlink'" />
          </view>
          <!-- #endif -->
          <view
            class="ot-notes__icon-btn" :title="fullscreen ? '退出全屏（Esc）' : '全屏编辑'"
            @click="toggleFullscreen()"
          >
            <view :class="fullscreen ? 'i-carbon-minimize' : 'i-carbon-maximize'" />
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
          <scroll-view v-if="showOutline && (wide || fullscreen)" scroll-y class="ot-notes__outline">
            <note-outline :items="outline" :active="activeHeading" @jump="jumpTo" />
          </scroll-view>
          <view v-if="mode !== 'preview'" class="ot-notes__editor">
            <!-- #ifdef H5 -->
            <h5-textarea
              class="ot-notes__textarea ot-mono"
              :value="editorValue"
              placeholder="支持 Markdown：# 标题、**粗体**、- 列表、- [ ] 待办、```代码块``` …&#10;输入后自动保存"
              @input="onNativeInput"
              @blur="onEditorBlur"
            />
            <!-- #endif -->
            <!-- #ifndef H5 -->
            <textarea
              class="ot-notes__textarea ot-mono"
              :value="editorValue"
              :maxlength="-1"
              :focus="editorFocus"
              :selection-start="selStart"
              :selection-end="selEnd"
              :show-confirm-bar="false"
              :adjust-position="false"
              :disable-default-padding="true"
              placeholder="支持 Markdown：# 标题、**粗体**、- 列表、- [ ] 待办、```代码块``` …&#10;输入后自动保存"
              placeholder-class="ot-notes__placeholder"
              @input="onMpInput"
              @blur="onEditorBlur"
            />
            <!-- #endif -->
          </view>
          <!-- #ifdef H5 -->
          <!-- H5 用普通容器，便于滚动同步直接读写滚动位置 -->
          <view v-if="mode !== 'edit'" class="ot-notes__preview is-native">
            <md-view v-if="previewSource.trim()" :source="previewSource" />
            <view v-else class="py-10 text-center text-13px text-muted">
              预览区：在左侧输入 Markdown
            </view>
          </view>
          <!-- #endif -->
          <!-- #ifndef H5 -->
          <scroll-view v-if="mode !== 'edit'" scroll-y class="ot-notes__preview">
            <md-view v-if="previewSource.trim()" :source="previewSource" />
            <view v-else class="py-10 text-center text-13px text-muted">
              预览区：在左侧输入 Markdown
            </view>
          </scroll-view>
          <!-- #endif -->
        </view>

        <view v-show="!fullscreen" class="ot-notes__foot">
          <text>{{ stats.words }} 字 · {{ stats.lines }} 行</text>
          <view class="flex-1" />
          <view class="ot-notes__action" @click="copyText(current.content)">
            <view class="i-carbon-copy" />复制全文
          </view>
          <view class="ot-notes__action" @click="tasksToTodos">
            <view class="i-carbon-task-add" />转为待办
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
            <view :class="current.shareCode && current.shareLocked ? 'i-carbon-locked' : 'i-carbon-share'" />{{ current.shareCode ? '已分享' : '分享' }}
          </view>
          <view class="ot-notes__action" @click="moveOpen = true">
            <view class="i-carbon-folder-move-to" />{{ folderName(current.folderId) || '移动' }}
          </view>
          <view v-if="current.id" class="ot-notes__action" @click="openHistory">
            <view class="i-carbon-recently-viewed" />历史
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
          <text class="w-56px shrink-0">有效期</text>
          <ot-segmented v-model="shareTtl" :options="SHARE_TTLS" size="small" />
        </view>
        <view class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-13px text-sub">
          <text class="w-56px shrink-0">访问密码</text>
          <wd-switch v-model="sharePwdOn" size="20px" />
          <template v-if="sharePwdOn">
            <view class="ot-notes__pwd">
              <input v-model="sharePwdInput" class="ot-mono min-w-0 flex-1 text-14px" placeholder="设置密码" :maxlength="32">
            </view>
            <text class="ot-notes__link text-12px" @click="randomSharePassword">随机</text>
          </template>
          <text v-else class="text-12px text-muted">不设密码，拿到链接即可查看</text>
        </view>
        <text v-if="shareDirty" class="mt-2 block text-12px text-amber-600">
          修改后点「保存设置」生效
        </text>
        <template v-if="current.shareCode">
          <view class="ot-notes__share-link ot-mono" @click="copyText(shareText())">
            {{ shareLink(current.shareCode) || '（无法生成链接）' }}
          </view>
          <text class="mt-1.5 block text-12px text-muted">
            {{ current.shareExpiresAt ? `${dayjs(current.shareExpiresAt * 1000).format('YYYY-MM-DD HH:mm')} 失效` : '永久有效' }}{{ current.sharePassword ? ` · 访问密码 ${current.sharePassword}` : ' · 无密码' }}
          </text>
          <view class="mt-4 flex flex-wrap gap-2">
            <wd-button size="small" icon="copy" @click="copyText(shareText())">
              {{ current.sharePassword ? '复制链接和密码' : '复制链接' }}
            </wd-button>
            <wd-button size="small" type="info" plain :loading="sharing" @click="doShare(false)">
              保存设置
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

    <!-- 移动到文件夹 -->
    <wd-popup v-model="moveOpen" position="center" custom-style="border-radius: 16px; width: min(92vw, 360px);">
      <view v-if="current" class="ot-notes__move">
        <view class="mb-2 flex items-center gap-2">
          <view class="i-carbon-folder-move-to text-18px text-[var(--wot-color-theme)]" />
          <text class="flex-1 text-16px text-main font-600">移动到</text>
          <view class="i-carbon-close cursor-pointer text-18px text-muted" @click="moveOpen = false" />
        </view>
        <view class="ot-notes__move-item" :class="{ 'is-active': !current.folderId }" @click="moveTo(null)">
          <view class="i-carbon-document" />未分类
        </view>
        <view
          v-for="fd in folders" :key="fd.id" class="ot-notes__move-item"
          :class="{ 'is-active': current.folderId === fd.id }" @click="moveTo(fd.id)"
        >
          <view class="i-carbon-folder" />{{ fd.name }}
        </view>
        <text v-if="!folders.length" class="mt-2 block text-12px text-muted">还没有文件夹，可以在便签列表上方的 <text class="i-carbon-folder-add" /> 中新建</text>
      </view>
    </wd-popup>

    <!-- 窄屏的大纲 -->
    <wd-popup v-model="outlinePopup" position="bottom" custom-style="border-radius: 16px 16px 0 0; max-height: 70vh;">
      <view class="ot-notes__outline-popup">
        <view class="mb-2 flex items-center gap-2">
          <view class="i-carbon-list-dropdown text-18px text-[var(--wot-color-theme)]" />
          <text class="flex-1 text-16px text-main font-600">大纲</text>
          <view class="i-carbon-close cursor-pointer text-18px text-muted" @click="outlinePopup = false" />
        </view>
        <scroll-view scroll-y style="max-height: 56vh">
          <note-outline :items="outline" :active="activeHeading" @jump="jumpTo" />
        </scroll-view>
      </view>
    </wd-popup>

    <note-history v-model="historyOpen" :note-id="current?.id" :current-content="current?.content ?? ''" :wide="wide" @restored="onRestored" />
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

  // 全屏编辑：铺满整个窗口，编辑区 / 预览区占满剩余高度
  &.is-fullscreen {
    position: fixed;
    inset: 0;
    z-index: 900;
    padding: 12px max(16px, calc((100vw - 1400px) / 2)) 16px;
    padding-top: calc(12px + env(safe-area-inset-top));
    padding-bottom: calc(16px + env(safe-area-inset-bottom));
    border: none;
    border-radius: 0;

    .ot-notes__body {
      flex: 1;
      min-height: 0;
    }

    .ot-notes__textarea,
    .ot-notes__preview {
      height: 100%;
      min-height: 0;
      font-size: 15px;
    }

    .is-preview .ot-notes__preview {
      height: 100%;
      overflow-y: auto;
    }
  }
}

.ot-notes__fs-title {
  min-width: 0;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
  color: var(--ot-text);
}

.ot-notes__outline {
  box-sizing: border-box;
  flex: 0 0 190px;
  height: 60vh;
  min-height: 320px;
  padding: 6px;
  border-radius: 10px;
  border: 1px solid var(--ot-border);

  .is-fullscreen & {
    height: 100%;
    min-height: 0;
  }
}

.ot-notes__outline-popup {
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.ot-notes__folder-tag {
  overflow: hidden;
  max-width: 90px;
  padding: 0 6px;
  border-radius: 4px;
  white-space: nowrap;
  text-overflow: ellipsis;
  background: var(--ot-fill);
}

.ot-notes__pwd {
  display: flex;
  align-items: center;
  width: 130px;
  height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--ot-text);
  background: var(--ot-fill);
}

.ot-notes__move {
  padding: 18px;
}

.ot-notes__move-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--ot-text);
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
  }

  &.is-active {
    color: var(--wot-color-theme);
    background: rgba(79, 110, 247, 0.08);
    font-weight: 600;
  }
}

.ot-notes__icon-btn {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  font-size: 17px;
  color: var(--ot-text-2);
  cursor: pointer;

  &:hover {
    color: var(--wot-color-theme);
    background: var(--ot-fill);
  }

  &.is-on {
    color: var(--wot-color-theme);
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
  outline: none;
  resize: none;

  &:focus {
    border-color: var(--wot-color-theme);
  }

  &::placeholder {
    color: var(--ot-text-3);
  }
}

.ot-notes__preview {
  box-sizing: border-box;

  &.is-native {
    overflow-y: auto;
  }

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
