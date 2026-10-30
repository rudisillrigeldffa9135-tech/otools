<script lang="ts" setup>
// 文件管理（SFTP，仅 H5）：浏览目录、上传下载、在线编辑、重命名、权限、删除
import type { Session } from '../lib/sessions'
import type { SftpEntry } from '../lib/ssh'
import dayjs from 'dayjs'
import { copyText, toast } from '@/utils/common'
import { formatBytes } from '../lib/monitor'
import { downloadFile, ensureSftp, readWhole, sftpState, uploadFile } from '../lib/sftp-state'
import { breadcrumbs, isTextLike, joinPath, looksBinary, modeToString, parentPath, parseOctalMode } from '../lib/util'
import WsEditor from './ws-editor.vue'

const props = defineProps<{ session: Session }>()
const emit = defineEmits<{ cd: [path: string], close: [] }>()

const s = props.session
const st = sftpState(s.key)
const entries = ref<SftpEntry[]>([])
const loading = ref(false)
const error = ref('')
const showHidden = ref(false)
const sortBy = ref<'name' | 'size' | 'mtime'>('name')
const sortDesc = ref(false)
const editingPath = ref(false)
const pathInput = ref('')
const selected = ref(new Set<string>())
const dragOver = ref(false)
const showTransfers = ref(false)
const editor = ref<{ path: string, text: string } | null>(null)

const connected = computed(() => s.status === 'connected')

const list = computed(() => {
  const arr = entries.value.filter(e => showHidden.value || !e.name.startsWith('.'))
  const dir = (e: SftpEntry) => (e.isDir ? 0 : 1)
  const cmp = (a: SftpEntry, b: SftpEntry) => {
    const v = sortBy.value === 'name' ? a.name.localeCompare(b.name, 'zh-CN', { numeric: true }) : sortBy.value === 'size' ? a.size - b.size : a.mtime - b.mtime
    return sortDesc.value ? -v : v
  }
  return arr.sort((a, b) => dir(a) - dir(b) || cmp(a, b))
})

const crumbs = computed(() => breadcrumbs(st.cwd || '/'))
const running = computed(() => st.transfers.filter(t => t.status === 'running').length)

async function load(path = st.cwd) {
  if (!connected.value)
    return
  loading.value = true
  error.value = ''
  try {
    const { ssh, fid } = await ensureSftp(s.key, s.generation)
    const target = path || st.home
    entries.value = await ssh.sftpList(fid, target)
    st.cwd = target
    selected.value = new Set()
  }
  catch (e: any) {
    error.value = e?.message || '读取目录失败'
    if (!entries.value.length && path !== st.home && st.home)
      toast(error.value)
  }
  finally {
    loading.value = false
  }
}

watch(() => [s.generation, s.status], () => {
  if (connected.value)
    load()
}, { immediate: true })

function open(e: SftpEntry) {
  if (e.isDir)
    load(joinPath(st.cwd, e.name))
  else
    fileMenu(e)
}

function toggleSort(k: typeof sortBy.value) {
  if (sortBy.value === k)
    sortDesc.value = !sortDesc.value
  else
    sortBy.value = k
}

function startEditPath() {
  pathInput.value = st.cwd
  editingPath.value = true
}

function goPath() {
  editingPath.value = false
  const p = pathInput.value.trim()
  if (p && p !== st.cwd)
    load(p.startsWith('/') ? p : joinPath(st.cwd, p))
}

function toggle(e: SftpEntry) {
  const set = new Set(selected.value)
  if (set.has(e.name))
    set.delete(e.name)
  else
    set.add(e.name)
  selected.value = set
}

/* ---------------- 上传 ---------------- */

async function upload(files: File[]) {
  if (!files.length || !connected.value)
    return
  const names = new Set(entries.value.map(e => e.name))
  const dup = files.filter(f => names.has(f.name))
  if (dup.length) {
    const ok = await new Promise<boolean>(resolve => uni.showModal({
      title: '覆盖文件',
      content: `「${dup.map(f => f.name).slice(0, 3).join('」「')}」${dup.length > 3 ? ` 等 ${dup.length} 个文件` : ''}已存在，是否覆盖？`,
      success: r => resolve(r.confirm),
    }))
    if (!ok)
      return
  }
  showTransfers.value = true
  const dir = st.cwd
  for (const f of files) {
    const t = await uploadFile(s.key, s.generation, f, dir)
    if (t.status === 'error')
      toast(`${f.name}：${t.error}`)
  }
  if (st.cwd === dir)
    load()
}

function pickFiles() {
  const el = document.createElement('input')
  el.type = 'file'
  el.multiple = true
  el.onchange = () => upload(Array.from(el.files ?? []))
  el.click()
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  const files = Array.from(e.dataTransfer?.files ?? []).filter(f => f.size > 0 || f.type)
  if (!files.length) {
    toast('只支持上传文件，不支持文件夹')
    return
  }
  upload(files)
}

/* ---------------- 文件操作 ---------------- */

function ask(title: string, content: string) {
  return new Promise<boolean>(resolve => uni.showModal({ title, content, success: r => resolve(r.confirm) }))
}

function promptText(title: string, value: string, placeholder = '') {
  return new Promise<string | null>(resolve => uni.showModal({
    title,
    editable: true,
    content: value,
    placeholderText: placeholder,
    success: r => resolve(r.confirm ? (r.content ?? '').trim() : null),
  }))
}

async function run(fn: (ssh: Awaited<ReturnType<typeof ensureSftp>>['ssh'], fid: number) => Promise<unknown>, okText = '') {
  try {
    const { ssh, fid } = await ensureSftp(s.key, s.generation)
    await fn(ssh, fid)
    if (okText)
      toast(okText, 'success')
    load()
  }
  catch (e: any) {
    toast(e?.message || '操作失败')
  }
}

async function mkdir() {
  const name = await promptText('新建文件夹', '', '文件夹名称')
  if (name)
    run((ssh, fid) => ssh.sftpMkdir(fid, joinPath(st.cwd, name), false))
}

async function touch() {
  const name = await promptText('新建文件', '', '文件名')
  if (!name)
    return
  run(async (ssh, fid) => {
    const path = joinPath(st.cwd, name)
    if (entries.value.some(e => e.name === name))
      throw new Error('已存在同名文件')
    const h = await ssh.sftpOpenWrite(fid, path, false)
    await ssh.sftpCloseFile(h)
  })
}

async function rename(e: SftpEntry) {
  const name = await promptText('重命名', e.name)
  if (name && name !== e.name)
    run((ssh, fid) => ssh.sftpRename(fid, joinPath(st.cwd, e.name), joinPath(st.cwd, name)))
}

async function chmod(e: SftpEntry) {
  const v = await promptText(`修改权限：${e.name}`, (e.mode & 0o777).toString(8).padStart(3, '0'), '如 755、644')
  if (v === null)
    return
  const mode = parseOctalMode(v)
  if (mode === null)
    return toast('请输入 3 位八进制权限，如 755')
  run((ssh, fid) => ssh.sftpChmod(fid, joinPath(st.cwd, e.name), mode), `已改为 ${modeToString(mode)}`)
}

async function remove(names: string[]) {
  const items = entries.value.filter(e => names.includes(e.name))
  if (!items.length)
    return
  const dirs = items.filter(e => e.isDir && !e.isLink).length
  const ok = await ask('删除', `确定删除「${items.slice(0, 3).map(e => e.name).join('」「')}」${items.length > 3 ? ` 等 ${items.length} 项` : ''}？${dirs ? '文件夹会连同其中的内容一起删除，' : ''}删除后无法恢复。`)
  if (!ok)
    return
  run(async (ssh, fid) => {
    for (const e of items)
      await ssh.sftpRemove(fid, joinPath(st.cwd, e.name), e.isDir && !e.isLink)
  }, '已删除')
}

async function download(names: string[]) {
  const items = entries.value.filter(e => names.includes(e.name))
  if (items.some(e => e.isDir))
    toast('暂不支持下载文件夹，可在终端中先打包（如 tar czf）')
  showTransfers.value = true
  for (const e of items.filter(x => !x.isDir)) {
    const t = await downloadFile(s.key, s.generation, e, st.cwd)
    if (t.status === 'error')
      toast(`${e.name}：${t.error}`)
  }
}

async function edit(e: SftpEntry) {
  const path = joinPath(st.cwd, e.name)
  try {
    const blob = await readWhole(s.key, s.generation, path, undefined, 2 * 1024 * 1024)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    if (looksBinary(bytes))
      return toast('这是二进制文件，不能在线编辑')
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    }
    catch {
      return toast('文件不是 UTF-8 编码，暂不支持在线编辑')
    }
    editor.value = { path, text }
  }
  catch (err: any) {
    toast(err?.message === '文件太大' ? '超过 2 MB 的文件请下载后编辑' : (err?.message || '读取失败'))
  }
}

async function saveEditor(text: string) {
  if (!editor.value)
    return
  const { path } = editor.value
  try {
    const { ssh, fid } = await ensureSftp(s.key, s.generation)
    const h = await ssh.sftpOpenWrite(fid, path, false)
    const bytes = new TextEncoder().encode(text)
    for (let i = 0; i < bytes.length; i += 256 * 1024)
      await ssh.sftpWrite(h, bytes.subarray(i, i + 256 * 1024))
    await ssh.sftpCloseFile(h)
    editor.value = { path, text }
    toast('已保存', 'success')
    load()
  }
  catch (e: any) {
    toast(e?.message || '保存失败')
  }
}

function fileMenu(e: SftpEntry) {
  const path = joinPath(st.cwd, e.name)
  const items: [string, () => void][] = [
    ...(!e.isDir && isTextLike(e.name, e.size) ? [['编辑', () => edit(e)] as [string, () => void]] : []),
    ...(!e.isDir ? [['下载', () => download([e.name])] as [string, () => void]] : []),
    ...(e.isDir ? [['在终端中打开', () => emit('cd', path)] as [string, () => void]] : []),
    ['重命名', () => rename(e)],
    ['修改权限', () => chmod(e)],
    ['复制路径', () => copyText(path)],
    ['删除', () => remove([e.name])],
  ]
  uni.showActionSheet({ itemList: items.map(i => i[0]), success: ({ tapIndex }) => items[tapIndex]?.[1]() })
}

function ownerOf(e: SftpEntry) {
  if (e.uid === undefined)
    return ''
  return `${st.users.get(e.uid) ?? e.uid}:${st.groups.get(e.gid ?? -1) ?? e.gid}`
}

function iconOf(e: SftpEntry) {
  if (e.isDir)
    return e.isLink ? 'i-carbon-folder-shared text-amber-500' : 'i-carbon-folder text-amber-500'
  if (e.isLink)
    return 'i-carbon-link text-sky-500'
  if (/\.(?:zip|gz|tgz|bz2|xz|7z|rar|tar)$/i.test(e.name))
    return 'i-carbon-zip text-purple-500'
  if (/\.(?:png|jpe?g|gif|webp|svg|ico|bmp)$/i.test(e.name))
    return 'i-carbon-image text-pink-500'
  if (/\.(?:sh|py|js|ts|go|rb|php|java|c|cpp|rs|lua|pl)$/i.test(e.name))
    return 'i-carbon-code text-green-600'
  if (/\.log$/i.test(e.name))
    return 'i-carbon-catalog text-muted'
  return 'i-carbon-document text-muted'
}

function cancelTransfer(id: number) {
  const t = st.transfers.find(x => x.id === id)
  if (t)
    t.cancel = true
}

function clearTransfers() {
  st.transfers.splice(0, st.transfers.length, ...st.transfers.filter(t => t.status === 'running'))
}
</script>

<template>
  <view
    class="ot-sf" :class="{ 'is-drag': dragOver }"
    @dragover.prevent="dragOver = true" @dragleave.prevent="dragOver = false" @drop.prevent="onDrop"
  >
    <view class="ot-sf__head">
      <text class="flex-1 text-13px text-main font-600">文件</text>
      <view class="ot-sf__btn" title="上级目录" @click="load(parentPath(st.cwd))">
        <view class="i-carbon-arrow-up" />
      </view>
      <view class="ot-sf__btn" title="主目录" @click="load(st.home)">
        <view class="i-carbon-home" />
      </view>
      <view class="ot-sf__btn" title="刷新" @click="load()">
        <view class="i-carbon-renew" :class="{ 'animate-spin': loading }" />
      </view>
      <view class="ot-sf__btn" title="新建文件夹" @click="mkdir">
        <view class="i-carbon-folder-add" />
      </view>
      <view class="ot-sf__btn" title="新建文件" @click="touch">
        <view class="i-carbon-document-add" />
      </view>
      <view class="ot-sf__btn" title="上传文件（也可以把文件拖到这里）" @click="pickFiles">
        <view class="i-carbon-upload" />
      </view>
      <view class="ot-sf__btn" :class="{ 'is-on': showHidden }" title="显示隐藏文件" @click="showHidden = !showHidden">
        <view class="i-carbon-view" />
      </view>
      <view class="ot-sf__btn" title="关闭" @click="emit('close')">
        <view class="i-carbon-close" />
      </view>
    </view>

    <view class="ot-sf__path">
      <input v-if="editingPath" v-model="pathInput" class="ot-mono min-w-0 flex-1 text-12px" :focus="true" confirm-type="done" @confirm="goPath()" @blur="goPath()">
      <view v-else class="ot-sf__crumbs" title="点击空白处输入路径" @click.self="startEditPath">
        <template v-for="(b, i) in crumbs" :key="b.path">
          <text v-if="i > 1" class="text-muted">/</text>
          <text class="ot-sf__crumb" @click="load(b.path)">{{ b.name }}</text>
        </template>
      </view>
      <view class="ot-sf__btn" title="在终端中打开当前目录" @click="emit('cd', st.cwd)">
        <view class="i-carbon-terminal" />
      </view>
    </view>

    <view v-if="selected.size" class="ot-sf__selbar">
      <text class="flex-1">已选 {{ selected.size }} 项</text>
      <text class="ot-sf__link" @click="download([...selected])">下载</text>
      <text class="ot-sf__link text-red-500" @click="remove([...selected])">删除</text>
      <text class="ot-sf__link" @click="selected = new Set()">取消</text>
    </view>

    <view class="ot-sf__cols">
      <text class="flex-1 cursor-pointer" @click="toggleSort('name')">名称{{ sortBy === 'name' ? (sortDesc ? ' ↓' : ' ↑') : '' }}</text>
      <text class="w-64px cursor-pointer text-right" @click="toggleSort('size')">大小{{ sortBy === 'size' ? (sortDesc ? ' ↓' : ' ↑') : '' }}</text>
      <text class="w-92px cursor-pointer text-right" @click="toggleSort('mtime')">修改时间{{ sortBy === 'mtime' ? (sortDesc ? ' ↓' : ' ↑') : '' }}</text>
    </view>

    <scroll-view scroll-y class="ot-sf__list">
      <view v-if="!connected" class="ot-sf__empty">
        连接断开，重连后可浏览文件
      </view>
      <view v-else-if="error && !entries.length" class="ot-sf__empty">
        {{ error }}
      </view>
      <view v-else-if="!loading && !list.length" class="ot-sf__empty">
        空目录{{ entries.length ? '（有隐藏文件）' : '' }}
      </view>
      <view
        v-for="e in list" :key="e.name" class="ot-sf__row" :class="{ 'is-sel': selected.has(e.name) }"
        @click="open(e)"
      >
        <view class="ot-sf__check" @click.stop="toggle(e)">
          <view :class="selected.has(e.name) ? 'i-carbon-checkbox-checked text-[var(--wot-color-theme)]' : 'i-carbon-checkbox'" />
        </view>
        <view :class="iconOf(e)" class="shrink-0 text-16px" />
        <view class="min-w-0 flex-1">
          <view class="truncate text-13px text-main" :title="e.linkTarget ? `${e.name} -> ${e.linkTarget}` : e.name">
            {{ e.name }}
          </view>
          <view class="ot-mono truncate text-10px text-muted">
            {{ e.perm }} {{ ownerOf(e) }}
          </view>
        </view>
        <text class="w-64px shrink-0 text-right text-11px text-muted">{{ e.isDir ? '' : formatBytes(e.size) }}</text>
        <text class="w-92px shrink-0 text-right text-11px text-muted">{{ dayjs(e.mtime * 1000).format('YY-MM-DD HH:mm') }}</text>
        <view class="ot-sf__more i-carbon-overflow-menu-vertical" @click.stop="fileMenu(e)" />
      </view>
    </scroll-view>

    <view v-if="st.transfers.length" class="ot-sf__tr">
      <view class="ot-sf__tr-head" @click="showTransfers = !showTransfers">
        <view :class="showTransfers ? 'i-carbon-chevron-down' : 'i-carbon-chevron-up'" />
        <text class="flex-1">传输{{ running ? `（进行中 ${running}）` : '' }}</text>
        <text class="ot-sf__link" @click.stop="clearTransfers">清除已完成</text>
      </view>
      <scroll-view v-if="showTransfers" scroll-y class="max-h-160px">
        <view v-for="t in st.transfers" :key="t.id" class="ot-sf__tr-item">
          <view :class="t.kind === 'upload' ? 'i-carbon-upload' : 'i-carbon-download'" class="shrink-0 text-14px text-muted" />
          <view class="min-w-0 flex-1">
            <view class="flex items-center gap-2">
              <text class="min-w-0 flex-1 truncate text-12px text-main">{{ t.name }}</text>
              <text class="shrink-0 text-11px" :class="t.status === 'error' ? 'text-red-500' : 'text-muted'">
                {{ t.status === 'running' ? `${formatBytes(t.done)} / ${formatBytes(t.size)} · ${formatBytes(t.speed)}/s` : t.status === 'done' ? '完成' : t.error }}
              </text>
            </view>
            <view class="ot-sf__bar">
              <view class="ot-sf__bar-in" :class="`is-${t.status}`" :style="{ width: `${t.size ? Math.min(100, (t.done / t.size) * 100) : t.status === 'done' ? 100 : 0}%` }" />
            </view>
          </view>
          <view v-if="t.status === 'running'" class="i-carbon-close shrink-0 cursor-pointer text-14px text-muted" title="取消" @click="cancelTransfer(t.id)" />
        </view>
      </scroll-view>
    </view>

    <view v-if="dragOver" class="ot-sf__drop">
      <view class="i-carbon-upload text-32px" />
      <text class="mt-2">松开上传到 {{ st.cwd }}</text>
    </view>

    <ws-editor v-if="editor" :path="editor.path" :text="editor.text" @save="saveEditor" @close="editor = null" />
  </view>
</template>

<style lang="scss" scoped>
.ot-sf {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  font-size: 13px;
  color: var(--ot-text);
}

.ot-sf__head,
.ot-sf__path {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
}

.ot-sf__head {
  padding-left: 12px;
  border-bottom: 1px solid var(--ot-border);
}

.ot-sf__btn {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  font-size: 15px;
  color: var(--ot-text-2);
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
  }

  &.is-on {
    color: var(--wot-color-theme);
  }
}

.ot-sf__path {
  gap: 6px;
  margin: 6px 8px 0;
  padding: 0 4px 0 10px;
  min-height: 32px;
  border-radius: 8px;
  background: var(--ot-fill);
}

.ot-sf__crumbs {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  min-width: 0;
  min-height: 28px;
  cursor: text;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
}

.ot-sf__crumb {
  padding: 2px 1px;
  cursor: pointer;

  &:hover {
    color: var(--wot-color-theme);
  }
}

.ot-sf__selbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 6px 8px 0;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  background: color-mix(in srgb, var(--wot-color-theme) 10%, transparent);
}

.ot-sf__link {
  font-size: 12px;
  color: var(--wot-color-theme);
  cursor: pointer;
}

.ot-sf__cols {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  padding: 8px 40px 4px 58px;
  font-size: 11px;
  color: var(--ot-text-3);
  user-select: none;
}

.ot-sf__list {
  flex: 1;
  min-height: 0;
}

.ot-sf__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 2px 8px;
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
  }

  &.is-sel {
    background: color-mix(in srgb, var(--wot-color-theme) 8%, transparent);
  }
}

.ot-sf__check {
  flex-shrink: 0;
  padding: 4px;
  font-size: 15px;
  color: var(--ot-text-3);
}

.ot-sf__more {
  flex-shrink: 0;
  padding: 4px;
  font-size: 15px;
  color: var(--ot-text-3);
}

.ot-sf__empty {
  padding: 32px 16px;
  text-align: center;
  font-size: 12px;
  color: var(--ot-text-3);
}

.ot-sf__tr {
  flex-shrink: 0;
  border-top: 1px solid var(--ot-border);
}

.ot-sf__tr-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
}

.ot-sf__tr-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px 8px;
}

.ot-sf__bar {
  height: 3px;
  margin-top: 4px;
  border-radius: 2px;
  overflow: hidden;
  background: var(--ot-fill);
}

.ot-sf__bar-in {
  height: 100%;
  background: var(--wot-color-theme);
  transition: width 0.2s;

  &.is-done {
    background: #22c55e;
  }

  &.is-error,
  &.is-cancelled {
    background: #ef4444;
  }
}

.ot-sf__drop {
  position: absolute;
  inset: 6px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--wot-color-theme);
  border-radius: 12px;
  font-size: 13px;
  color: var(--wot-color-theme);
  background: color-mix(in srgb, var(--ot-card) 90%, transparent);
  pointer-events: none;
}
</style>
