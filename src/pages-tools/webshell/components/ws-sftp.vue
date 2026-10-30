<script lang="ts" setup>
// 文件管理（仿 FinalShell，仅 H5）：左侧目录树、右侧文件表格；双击打开、右键菜单、拖拽上传、多选
import type { MenuItem } from '../lib/menu'
import type { Session } from '../lib/sessions'
import type { SftpEntry } from '../lib/ssh'
import dayjs from 'dayjs'
import { copyText, toast } from '@/utils/common'
import { openMenu } from '../lib/menu'
import { formatBytes } from '../lib/monitor'
import { getConn } from '../lib/sessions'
import { downloadFile, ensureSftp, readWhole, sftpState, uploadFile } from '../lib/sftp-state'
import { isTextLike, joinPath, looksBinary, modeToString, normalizePath, parentPath, parseOctalMode, shellQuote } from '../lib/util'
import WsEditor from './ws-editor.vue'

const props = defineProps<{ session: Session, wide: boolean }>()
const emit = defineEmits<{ cd: [path: string] }>()

const s = props.session
const st = sftpState(s.key)
const entries = ref<SftpEntry[]>([])
const loading = ref(false)
const error = ref('')
const showHidden = ref(false)
const sortBy = ref<'name' | 'size' | 'type' | 'mtime' | 'perm' | 'owner'>('name')
const sortDesc = ref(false)
const pathInput = ref('')
const selected = ref(new Set<string>())
const anchor = ref('')
const dragOver = ref(false)
const showTransfers = ref(false)
const editor = ref<{ path: string, text: string } | null>(null)
const recentDirs = ref<string[]>([])

const connected = computed(() => s.status === 'connected')

/* ---------------- 目录树 ---------------- */

interface TreeNode {
  path: string
  name: string
  children: TreeNode[] | null
  open: boolean
  loading: boolean
}

const root = reactive<TreeNode>({ path: '/', name: '/', children: null, open: true, loading: false })

async function loadChildren(node: TreeNode) {
  if (node.loading)
    return
  node.loading = true
  try {
    const { ssh, fid } = await ensureSftp(s.key, s.generation)
    const list = await ssh.sftpList(fid, node.path)
    const old = new Map((node.children ?? []).map(c => [c.path, c]))
    node.children = list
      .filter(e => e.isDir && (showHidden.value || !e.name.startsWith('.')))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))
      .map((e) => {
        const p = joinPath(node.path, e.name)
        return old.get(p) ?? { path: p, name: e.name, children: null, open: false, loading: false }
      })
  }
  catch {
    node.children = []
  }
  finally {
    node.loading = false
  }
}

/** 展开到当前目录 */
async function revealInTree(path: string) {
  let node: TreeNode = root
  if (!node.children)
    await loadChildren(node)
  node.open = true
  for (const seg of normalizePath(path).split('/').filter(Boolean)) {
    const next: TreeNode | undefined = node.children?.find(c => c.name === seg)
    if (!next)
      return
    next.open = true
    if (!next.children)
      await loadChildren(next)
    node = next
  }
}

function toggleNode(n: TreeNode) {
  n.open = !n.open
  if (n.open && !n.children)
    loadChildren(n)
}

const treeRows = computed(() => {
  const out: { node: TreeNode, depth: number }[] = []
  const walk = (n: TreeNode, depth: number) => {
    out.push({ node: n, depth })
    if (n.open)
      n.children?.forEach(c => walk(c, depth + 1))
  }
  walk(root, 0)
  return out
})

/* ---------------- 文件列表 ---------------- */

function typeOf(e: SftpEntry) {
  if (e.isDir)
    return e.isLink ? '文件夹链接' : '文件夹'
  if (e.isLink)
    return '链接'
  const ext = e.name.includes('.') && !e.name.startsWith('.') ? e.name.slice(e.name.lastIndexOf('.') + 1) : ''
  return ext && ext.length <= 8 ? `${ext.toUpperCase()} 文件` : '文件'
}

function ownerOf(e: SftpEntry) {
  if (e.uid === undefined)
    return ''
  return `${st.users.get(e.uid) ?? e.uid}/${st.groups.get(e.gid ?? -1) ?? e.gid}`
}

const list = computed(() => {
  const arr = entries.value.filter(e => showHidden.value || !e.name.startsWith('.'))
  const key = (e: SftpEntry): string | number => {
    switch (sortBy.value) {
      case 'size': return e.size
      case 'mtime': return e.mtime
      case 'type': return typeOf(e)
      case 'perm': return e.perm
      case 'owner': return ownerOf(e)
      default: return e.name
    }
  }
  const cmp = (a: SftpEntry, b: SftpEntry) => {
    const x = key(a)
    const y = key(b)
    const v = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'zh-CN', { numeric: true })
    return sortDesc.value ? -v : v
  }
  return arr.sort((a, b) => Number(b.isDir) - Number(a.isDir) || cmp(a, b))
})

const running = computed(() => st.transfers.filter(t => t.status === 'running').length)

async function load(path = st.cwd) {
  if (!connected.value)
    return
  loading.value = true
  error.value = ''
  try {
    const { ssh, fid } = await ensureSftp(s.key, s.generation)
    const target = normalizePath(path || st.home)
    entries.value = await ssh.sftpList(fid, target)
    if (st.cwd !== target || !recentDirs.value.length) {
      st.cwd = target
      recentDirs.value = [target, ...recentDirs.value.filter(d => d !== target)].slice(0, 15)
    }
    pathInput.value = target
    selected.value = new Set()
    revealInTree(target)
  }
  catch (e: any) {
    error.value = e?.message || '读取目录失败'
    pathInput.value = st.cwd
    toast(error.value)
  }
  finally {
    loading.value = false
  }
}

watch(() => [s.generation, s.status], () => {
  if (connected.value) {
    root.children = null
    load()
  }
}, { immediate: true })

watch(showHidden, () => {
  root.children = null
  revealInTree(st.cwd)
})

function sort(k: typeof sortBy.value) {
  if (sortBy.value === k) {
    sortDesc.value = !sortDesc.value
  }
  else {
    sortBy.value = k
    sortDesc.value = false
  }
}

function goPath() {
  const p = pathInput.value.trim()
  if (p)
    load(p.startsWith('/') ? p : joinPath(st.cwd, p))
}

/** 单击选中；Ctrl 多选；Shift 连选 */
function select(e: SftpEntry, ev?: MouseEvent) {
  const set = new Set(ev?.ctrlKey || ev?.metaKey ? selected.value : [])
  if (ev?.shiftKey && anchor.value) {
    const names = list.value.map(x => x.name)
    const [a, b] = [names.indexOf(anchor.value), names.indexOf(e.name)].sort((x, y) => x - y)
    names.slice(a, b + 1).forEach(n => set.add(n))
  }
  else if ((ev?.ctrlKey || ev?.metaKey) && set.has(e.name)) {
    set.delete(e.name)
  }
  else {
    set.add(e.name)
    anchor.value = e.name
  }
  selected.value = set
}

/* ---------------- 上传 ---------------- */

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

async function upload(files: File[]) {
  if (!files.length || !connected.value)
    return
  const names = new Set(entries.value.map(e => e.name))
  const dup = files.filter(f => names.has(f.name))
  if (dup.length) {
    const ok = await ask('覆盖文件', `「${dup.map(f => f.name).slice(0, 3).join('」「')}」${dup.length > 3 ? ` 等 ${dup.length} 个文件` : ''}已存在，是否覆盖？`)
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
  if (!files.length)
    return toast('只支持上传文件，不支持文件夹')
  upload(files)
}

/* ---------------- 文件操作 ---------------- */

async function run(fn: (ssh: Awaited<ReturnType<typeof ensureSftp>>['ssh'], fid: number) => Promise<unknown>, okText = '') {
  try {
    const { ssh, fid } = await ensureSftp(s.key, s.generation)
    await fn(ssh, fid)
    if (okText)
      toast(okText, 'success')
    load()
    const node = treeRows.value.find(r => r.node.path === st.cwd)?.node
    if (node)
      loadChildren(node)
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
  if (entries.value.some(e => e.name === name))
    return toast('已存在同名文件')
  run(async (ssh, fid) => {
    const h = await ssh.sftpOpenWrite(fid, joinPath(st.cwd, name), false)
    await ssh.sftpCloseFile(h)
  })
}

async function rename(e: SftpEntry) {
  const name = await promptText('重命名', e.name)
  if (name && name !== e.name)
    run((ssh, fid) => ssh.sftpRename(fid, joinPath(st.cwd, e.name), joinPath(st.cwd, name)))
}

async function chmod(e: SftpEntry) {
  const v = await promptText(`文件权限：${e.name}（当前 ${e.perm}）`, (e.mode & 0o777).toString(8).padStart(3, '0'), '如 755、644')
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

/** 快速删除：在服务器上执行 rm -rf，大目录比逐个文件删除快得多 */
async function quickRemove(names: string[]) {
  const ok = await ask('快速删除', `将在服务器上执行 rm -rf 删除「${names.slice(0, 3).join('」「')}」${names.length > 3 ? ` 等 ${names.length} 项` : ''}，无法恢复。确定吗？`)
  const conn = getConn(s.key)
  if (!ok || !conn)
    return
  const cmd = `rm -rf -- ${names.map(n => shellQuote(joinPath(st.cwd, n))).join(' ')}`
  run(async () => {
    const r = await conn.ssh.exec(conn.id, cmd, { timeout: 120000 })
    if (r.code !== 0)
      throw new Error(r.stderr.trim() || '删除失败')
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

/** 双击：文件夹进入；文本文件编辑；其他下载 */
function open(e: SftpEntry) {
  if (e.isDir)
    load(joinPath(st.cwd, e.name))
  else if (isTextLike(e.name, e.size))
    edit(e)
  else
    download([e.name])
}

/* ---------------- 右键菜单 ---------------- */

function blankItems(): MenuItem[] {
  return [
    { label: '刷新', icon: 'i-carbon-renew', hint: 'F5', action: () => load() },
    { label: '上传文件…', icon: 'i-carbon-upload', divider: true, action: pickFiles },
    { label: '新建文件夹', icon: 'i-carbon-folder-add', divider: true, action: mkdir },
    { label: '新建文件', icon: 'i-carbon-document-add', action: touch },
    { label: showHidden.value ? '不显示隐藏文件' : '显示隐藏文件', icon: 'i-carbon-view', divider: true, action: () => (showHidden.value = !showHidden.value) },
    { label: '复制当前路径', icon: 'i-carbon-copy', action: () => copyText(st.cwd) },
    { label: '在终端中打开', icon: 'i-carbon-terminal', action: () => emit('cd', st.cwd) },
  ]
}

function rowMenu(ev: MouseEvent, e: SftpEntry) {
  if (!selected.value.has(e.name))
    select(e)
  const names = [...selected.value]
  const multi = names.length > 1
  const path = joinPath(st.cwd, e.name)
  openMenu(ev, [
    { label: e.isDir ? '打开' : '编辑', icon: e.isDir ? 'i-carbon-folder-open' : 'i-carbon-edit', disabled: multi || (!e.isDir && !isTextLike(e.name, e.size)), action: () => open(e) },
    { label: multi ? `下载 ${names.length} 个文件` : '下载', icon: 'i-carbon-download', disabled: !multi && e.isDir, action: () => download(names) },
    { label: '上传文件…', icon: 'i-carbon-upload', action: pickFiles },
    { label: '刷新', icon: 'i-carbon-renew', divider: true, action: () => load() },
    { label: '新建文件夹', icon: 'i-carbon-folder-add', action: mkdir },
    { label: '新建文件', icon: 'i-carbon-document-add', action: touch },
    { label: '重命名', icon: 'i-carbon-text-creation', divider: true, disabled: multi, action: () => rename(e) },
    { label: '删除', icon: 'i-carbon-trash-can', hint: 'Delete', danger: true, action: () => remove(names) },
    { label: '快速删除（rm -rf）', icon: 'i-carbon-trash-can', danger: true, action: () => quickRemove(names) },
    { label: '复制路径', icon: 'i-carbon-copy', divider: true, disabled: multi, action: () => copyText(path) },
    { label: '文件权限', icon: 'i-carbon-locked', disabled: multi, action: () => chmod(e) },
    { label: '在终端中打开', icon: 'i-carbon-terminal', disabled: multi || !e.isDir, action: () => emit('cd', path) },
  ])
}

function treeMenu(ev: MouseEvent, n: TreeNode) {
  openMenu(ev, [
    { label: '打开', icon: 'i-carbon-folder-open', action: () => load(n.path) },
    { label: '刷新', icon: 'i-carbon-renew', action: () => loadChildren(n) },
    { label: '复制路径', icon: 'i-carbon-copy', divider: true, action: () => copyText(n.path) },
    { label: '在终端中打开', icon: 'i-carbon-terminal', action: () => emit('cd', n.path) },
  ])
}

function historyMenu(ev: MouseEvent) {
  const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  openMenu({ clientX: rect.left, clientY: rect.bottom + 2 }, [
    { label: `主目录（${st.home}）`, icon: 'i-carbon-home', action: () => load(st.home) },
    ...recentDirs.value.filter(d => d !== st.cwd).map((d, i) => ({ label: d, icon: 'i-carbon-folder', divider: i === 0, action: () => load(d) })),
  ])
}

function onKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA')
    return
  if (e.key === 'F5') {
    e.preventDefault()
    load()
  }
  else if (e.key === 'Delete' && selected.value.size) {
    remove([...selected.value])
  }
  else if (e.key === 'Backspace') {
    load(parentPath(st.cwd))
  }
}

function cancelTransfer(id: number) {
  const t = st.transfers.find(x => x.id === id)
  if (t)
    t.cancel = true
}

function clearTransfers() {
  st.transfers.splice(0, st.transfers.length, ...st.transfers.filter(t => t.status === 'running'))
}

function iconOf(e: SftpEntry) {
  if (e.isDir)
    return 'i-carbon-folder text-amber-500'
  if (e.isLink)
    return 'i-carbon-link text-sky-500'
  if (/\.(?:zip|gz|tgz|bz2|xz|7z|rar|tar)$/i.test(e.name))
    return 'i-carbon-zip text-purple-500'
  if (/\.(?:png|jpe?g|gif|webp|svg|ico|bmp)$/i.test(e.name))
    return 'i-carbon-image text-pink-500'
  if (/\.(?:sh|py|js|ts|go|rb|php|java|c|cpp|rs|lua|pl)$/i.test(e.name))
    return 'i-carbon-code text-green-600'
  return 'i-carbon-document text-muted'
}

const COLS = [
  { key: 'name', label: '文件名' },
  { key: 'size', label: '大小' },
  { key: 'type', label: '类型' },
  { key: 'mtime', label: '修改时间' },
  { key: 'perm', label: '权限' },
  { key: 'owner', label: '用户/用户组' },
] as const
const cols = computed(() => props.wide ? COLS : COLS.filter(c => c.key === 'name' || c.key === 'size' || c.key === 'mtime'))
</script>

<template>
  <div class="ws-fm" tabindex="0" @keydown="onKey">
    <!-- 工具栏 -->
    <div class="ws-fm__bar">
      <span class="ws-fm__btn i-carbon-renew" :class="{ 'animate-spin': loading }" title="刷新（F5）" @click="load()" />
      <span class="ws-fm__btn i-carbon-arrow-up" title="上级目录（Backspace）" @click="load(parentPath(st.cwd))" />
      <span class="ws-fm__btn i-carbon-home" title="主目录" @click="load(st.home)" />
      <input v-model="pathInput" class="ws-fm__path" spellcheck="false" @keydown.enter="goPath">
      <span class="ws-fm__btn is-text" @click="historyMenu">历史 ▾</span>
      <span class="ws-fm__sep" />
      <span class="ws-fm__btn i-carbon-upload" title="上传（也可以把文件拖到列表里）" @click="pickFiles" />
      <span class="ws-fm__btn i-carbon-download" title="下载选中的文件" :class="{ 'is-disabled': !selected.size }" @click="selected.size && download([...selected])" />
      <span class="ws-fm__btn i-carbon-folder-add" title="新建文件夹" @click="mkdir" />
      <span class="ws-fm__btn i-carbon-view" :class="{ 'is-on': showHidden }" title="显示隐藏文件" @click="showHidden = !showHidden" />
      <span class="ws-fm__btn i-carbon-terminal" title="在终端中打开当前目录" @click="emit('cd', st.cwd)" />
    </div>

    <div class="ws-fm__body">
      <!-- 目录树 -->
      <div v-if="wide" class="ws-fm__tree">
        <div
          v-for="{ node, depth } in treeRows" :key="node.path" class="ws-fm__node" :class="{ 'is-cur': node.path === st.cwd }"
          :style="{ paddingLeft: `${depth * 14 + 4}px` }" :title="node.path"
          @click="load(node.path)" @contextmenu="treeMenu($event, node)"
        >
          <span class="ws-fm__twist" :class="node.loading ? 'i-carbon-renew animate-spin' : node.open ? 'i-carbon-caret-down' : 'i-carbon-caret-right'" @click.stop="toggleNode(node)" />
          <span :class="node.open ? 'i-carbon-folder-open' : 'i-carbon-folder'" class="ws-fm__ficon shrink-0" />
          <span class="truncate">{{ node.name }}</span>
        </div>
      </div>

      <!-- 文件表格 -->
      <div
        class="ws-fm__table" :class="{ 'is-drag': dragOver }"
        @dragover.prevent="dragOver = true" @dragleave.prevent="dragOver = false" @drop.prevent="onDrop"
      >
        <div class="ws-fm__head">
          <span v-for="c in cols" :key="c.key" class="ws-fm__th" :class="`is-${c.key}`" @click="sort(c.key)">{{ c.label }}{{ sortBy === c.key ? (sortDesc ? ' ▼' : ' ▲') : '' }}</span>
        </div>
        <div class="ws-fm__rows" @contextmenu.self="openMenu($event, blankItems())" @click.self="selected = new Set()">
          <div v-if="!connected" class="ws-fm__empty">
            连接断开，重连后可浏览文件
          </div>
          <div v-else-if="!loading && !list.length" class="ws-fm__empty" @contextmenu="openMenu($event, blankItems())">
            {{ error || (entries.length ? '空目录（有隐藏文件）' : '空目录') }}
          </div>
          <div
            v-for="e in list" :key="e.name" class="ws-fm__tr" :class="{ 'is-sel': selected.has(e.name) }"
            :title="e.linkTarget ? `${e.name} -> ${e.linkTarget}` : e.name"
            @click="select(e, $event)" @dblclick="open(e)" @contextmenu="rowMenu($event, e)"
          >
            <span class="ws-fm__td is-name">
              <span :class="iconOf(e)" class="shrink-0" />
              <span class="truncate">{{ e.name }}</span>
            </span>
            <span class="ws-fm__td is-size">{{ e.isDir ? '' : formatBytes(e.size) }}</span>
            <span v-if="wide" class="ws-fm__td is-type">{{ typeOf(e) }}</span>
            <span class="ws-fm__td is-mtime">{{ dayjs(e.mtime * 1000).format(wide ? 'YYYY/MM/DD HH:mm' : 'MM/DD HH:mm') }}</span>
            <span v-if="wide" class="ws-fm__td is-perm">{{ e.perm }}</span>
            <span v-if="wide" class="ws-fm__td is-owner">{{ ownerOf(e) }}</span>
          </div>
        </div>
        <div v-if="dragOver" class="ws-fm__drop">
          松开上传到 {{ st.cwd }}
        </div>
      </div>
    </div>

    <!-- 传输 -->
    <div v-if="st.transfers.length" class="ws-fm__tr-wrap">
      <div class="ws-fm__tr-head" @click="showTransfers = !showTransfers">
        <span :class="showTransfers ? 'i-carbon-caret-down' : 'i-carbon-caret-right'" />
        <span class="flex-1">传输{{ running ? `（进行中 ${running}）` : '' }}</span>
        <span class="ws-fm__link" @click.stop="clearTransfers">清除已完成</span>
      </div>
      <div v-if="showTransfers" class="ws-fm__tr-list">
        <div v-for="t in st.transfers" :key="t.id" class="ws-fm__tr-item">
          <span :class="t.kind === 'upload' ? 'i-carbon-upload' : 'i-carbon-download'" class="shrink-0" />
          <span class="min-w-0 flex-1 truncate" :title="t.path">{{ t.name }}</span>
          <div class="ws-fm__pbar">
            <div class="ws-fm__pin" :class="`is-${t.status}`" :style="{ width: `${t.size ? Math.min(100, (t.done / t.size) * 100) : t.status === 'done' ? 100 : 0}%` }" />
          </div>
          <span class="w-170px shrink-0 text-right" :class="{ 'text-red-500': t.status === 'error' }">
            {{ t.status === 'running' ? `${formatBytes(t.done)}/${formatBytes(t.size)} ${formatBytes(t.speed)}/s` : t.status === 'done' ? '完成' : t.error }}
          </span>
          <span v-if="t.status === 'running'" class="i-carbon-close shrink-0 cursor-pointer" title="取消" @click="cancelTransfer(t.id)" />
        </div>
      </div>
    </div>

    <ws-editor v-if="editor" :path="editor.path" :text="editor.text" @save="saveEditor" @close="editor = null" />
  </div>
</template>

<style lang="scss" scoped>
.ws-fm {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  font-size: 12px;
  color: var(--ot-text);
  outline: none;
}

.ws-fm__bar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
  height: 30px;
  padding: 0 4px;
  border-bottom: 1px solid var(--ot-border);
}

.ws-fm__btn {
  flex-shrink: 0;
  width: 24px;
  height: 22px;
  padding: 3px;
  box-sizing: border-box;
  border-radius: 3px;
  font-size: 15px;
  color: var(--ot-text-2);
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
  }

  &.is-on {
    color: var(--wot-color-theme);
  }

  &.is-disabled {
    opacity: 0.35;
  }

  &.is-text {
    width: auto;
    padding: 0 6px;
    font-size: 12px;
    line-height: 22px;
  }
}

.ws-fm__path {
  flex: 1;
  min-width: 0;
  height: 22px;
  padding: 0 6px;
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

.ws-fm__sep {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: var(--ot-border);
}

.ws-fm__body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.ws-fm__tree {
  flex-shrink: 0;
  width: 200px;
  padding: 2px 0;
  overflow: auto;
  border-right: 1px solid var(--ot-border);
  scrollbar-width: thin;
}

.ws-fm__node {
  display: flex;
  align-items: center;
  gap: 3px;
  height: 22px;
  padding-right: 6px;
  white-space: nowrap;
  cursor: default;

  &:hover {
    background: var(--ot-fill);
  }

  &.is-cur {
    color: #fff;
    background: var(--wot-color-theme);
  }
}

.ws-fm__ficon {
  color: #f59e0b;

  .is-cur & {
    color: #fff;
  }
}

.ws-fm__twist {
  flex-shrink: 0;
  font-size: 12px;
  opacity: 0.7;
}

.ws-fm__table {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;

  &.is-drag {
    outline: 2px dashed var(--wot-color-theme);
    outline-offset: -3px;
  }
}

.ws-fm__head {
  display: flex;
  flex-shrink: 0;
  height: 22px;
  border-bottom: 1px solid var(--ot-border);
  background: var(--ot-fill);
  user-select: none;
}

.ws-fm__th {
  box-sizing: border-box;
  padding: 0 6px;
  line-height: 22px;
  border-right: 1px solid var(--ot-border);
  color: var(--ot-text-2);
  white-space: nowrap;
  cursor: default;
}

.ws-fm__rows {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
}

.ws-fm__tr {
  display: flex;
  height: 22px;
  line-height: 22px;
  cursor: default;
  user-select: none;

  &:hover {
    background: var(--ot-fill);
  }

  &.is-sel {
    color: #fff;
    background: var(--wot-color-theme);

    [class*='text-'] {
      color: #fff !important;
    }
  }
}

.ws-fm__td {
  box-sizing: border-box;
  padding: 0 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.is-name {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 5px;
  min-width: 140px;
}

.is-size {
  flex-shrink: 0;
  width: 76px;
  text-align: right;
}

.is-type {
  flex-shrink: 0;
  width: 84px;
}

.is-mtime {
  flex-shrink: 0;
  width: 122px;
}

.is-perm {
  flex-shrink: 0;
  width: 88px;
}

.is-owner {
  flex-shrink: 0;
  width: 104px;
}

.ws-fm__td.is-mtime,
.ws-fm__td.is-perm {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 11px;
}

.ws-fm__empty {
  padding: 24px 0;
  text-align: center;
  color: var(--ot-text-3);
}

.ws-fm__drop {
  position: absolute;
  bottom: 8px;
  left: 50%;
  padding: 4px 12px;
  border-radius: 4px;
  color: #fff;
  background: var(--wot-color-theme);
  transform: translateX(-50%);
  pointer-events: none;
}

.ws-fm__tr-wrap {
  flex-shrink: 0;
  border-top: 1px solid var(--ot-border);
}

.ws-fm__tr-head {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 6px;
  background: var(--ot-fill);
  cursor: default;
}

.ws-fm__link {
  color: var(--wot-color-theme);
  cursor: pointer;
}

.ws-fm__tr-list {
  max-height: 110px;
  overflow: auto;
}

.ws-fm__tr-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 22px;
  padding: 0 8px;
}

.ws-fm__pbar {
  width: 120px;
  height: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--ot-fill);
}

.ws-fm__pin {
  height: 100%;
  background: var(--wot-color-theme);

  &.is-done {
    background: #22c55e;
  }

  &.is-error,
  &.is-cancelled {
    background: #ef4444;
  }
}
</style>
