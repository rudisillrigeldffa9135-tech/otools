<script lang="ts" setup>
import type { IFileInfo, IFileSummary } from '@/api/files'
import { absoluteApiUrl, authHeader, deleteFile, FILE_TTLS, getFileInfo, listFiles, MAX_FILE_SIZE, MAX_MP_FILE_SIZE, uploadUrl } from '@/api/files'
import { isLoggedIn, LOGIN_PAGE } from '@/router/auth'
import { copyText, toast } from '@/utils/common'
import { getPageUrl } from '@/utils/site'
import QrPopup from '../qrcode/components/qr-popup.vue'

definePage({
  style: { navigationBarTitleText: '文件快传' },
})

const PAGE_PATH = '/pages-tools/filedrop/index'
const TTL_LABEL: Record<number, string> = { 3600: '1 小时', 86400: '1 天', 259200: '3 天', 604800: '7 天' }
const TTL_OPTIONS = FILE_TTLS.map(v => ({ value: v, label: TTL_LABEL[v] }))
let MAX_SIZE = MAX_FILE_SIZE
// #ifndef H5
MAX_SIZE = MAX_MP_FILE_SIZE
// #endif
const QUOTA = 1024 * 1024 * 1024

const loggedIn = ref(isLoggedIn())
const nowSec = ref(Math.floor(Date.now() / 1000))
function tick() {
  nowSec.value = Math.floor(Date.now() / 1000)
}

function formatBytes(n: number) {
  if (n < 1024)
    return `${n} B`
  if (n < 1024 * 1024)
    return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024)
    return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function remainText(expiresAt: number) {
  const s = expiresAt - nowSec.value
  if (s <= 0)
    return '已过期'
  if (s < 60)
    return '即将过期'
  if (s < 3600)
    return `${Math.floor(s / 60)} 分钟后过期`
  if (s < 86400)
    return `${Math.floor(s / 3600)} 小时后过期`
  return `${Math.floor(s / 86400)} 天后过期`
}

function prettyCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`
}

function linkOf(code: string) {
  return getPageUrl(`${PAGE_PATH}?code=${code}`)
}

/** 按扩展名 / 类型选图标 */
function iconOf(name: string, mime: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (mime.startsWith('image/'))
    return 'i-carbon-image'
  if (mime.startsWith('video/'))
    return 'i-carbon-video'
  if (mime.startsWith('audio/'))
    return 'i-carbon-music'
  if (mime === 'application/pdf' || ext === 'pdf')
    return 'i-carbon-document-pdf'
  if (['zip', 'rar', '7z', 'gz', 'tar', 'tgz', 'xz'].includes(ext))
    return 'i-carbon-zip'
  if (['txt', 'md', 'log', 'csv', 'json'].includes(ext))
    return 'i-carbon-txt'
  return 'i-carbon-document-blank'
}

/* ---------------- 分享二维码（在当前页弹窗展示） ---------------- */

const qrOpen = ref(false)
const qrText = ref('')
const qrNote = ref('')

function showQrcode(text: string, note: string) {
  if (!text)
    return toast('无法生成链接')
  qrText.value = text
  qrNote.value = note
  qrOpen.value = true
}

function toQrcode(code: string) {
  showQrcode(linkOf(code), `文件快传 取件码 ${prettyCode(code)}`)
}

/* ---------------- 取件 ---------------- */

const codeInput = ref('')
const normalizedCode = computed(() => codeInput.value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6))
const fetching = ref(false)
const fetched = ref<IFileInfo>()
const fetchError = ref('')
/** 下载链接的获取时间（毫秒），签名 10 分钟有效 */
let fetchedAt = 0
const downloading = ref(false)
const downloadProgress = ref(0)

async function fetchByCode(code = normalizedCode.value) {
  if (code.length !== 6)
    return toast('请输入 6 位取件码')
  fetching.value = true
  fetchError.value = ''
  fetched.value = undefined
  try {
    fetched.value = await getFileInfo(code)
    fetchedAt = Date.now()
    tick()
  }
  catch (e: any) {
    fetchError.value = e?.message || '提取失败'
  }
  finally {
    fetching.value = false
  }
}

function confirmDownload(info: IFileInfo) {
  if (!info.burnAfterRead || info.isOwner)
    return startDownload(info)
  uni.showModal({
    title: '阅后即焚',
    content: '这个文件只能下载一次，下载后立即销毁。请确认网络稳定后再下载。',
    confirmText: '下载',
    success: ({ confirm }) => confirm && startDownload(info),
  })
}

async function startDownload(info: IFileInfo) {
  // 签名链接 10 分钟有效，超时则重新获取
  let current = info
  if (Date.now() - fetchedAt > 9 * 60_000) {
    current = await getFileInfo(info.code)
    fetchedAt = Date.now()
    if (fetched.value?.code === current.code)
      fetched.value = current
  }
  const url = absoluteApiUrl(current.downloadPath)
  // #ifdef H5
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  afterDownload(current)
  // #endif
  // #ifndef H5
  downloadMp(current, url)
  // #endif
}

function afterDownload(info: IFileInfo) {
  if (info.burnAfterRead && !info.isOwner) {
    toast('已开始下载，文件将被销毁')
    fetched.value = undefined
  }
  if (loggedIn.value)
    loadList()
}

// #ifndef H5
const DOC_EXT = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf']

function downloadMp(info: IFileInfo, url: string) {
  downloading.value = true
  downloadProgress.value = 0
  const task = uni.downloadFile({
    url,
    success: (res) => {
      if (res.statusCode !== 200)
        return toast(res.statusCode === 404 ? '文件已被销毁或过期' : `下载失败（${res.statusCode}）`)
      const ext = info.name.split('.').pop()?.toLowerCase() || ''
      if (info.mime.startsWith('image/')) {
        uni.previewImage({ urls: [res.tempFilePath] })
      }
      else if (DOC_EXT.includes(ext)) {
        uni.openDocument({ filePath: res.tempFilePath, fileType: ext as any, showMenu: true })
      }
      else {
        uni.showModal({
          title: '已下载',
          content: '小程序无法直接保存这种类型的文件，可以复制下载链接，在电脑或手机浏览器中打开下载。',
          confirmText: '复制链接',
          success: ({ confirm }) => confirm && copyText(linkOf(info.code)),
        })
      }
      afterDownload(info)
    },
    fail: () => toast('下载失败，请检查网络'),
    complete: () => (downloading.value = false),
  })
  task.onProgressUpdate(p => (downloadProgress.value = p.progress))
}
// #endif

/* ---------------- 上传 ---------------- */

const ttl = ref<number>(86400)
const burn = ref(false)

interface UploadItem {
  id: number
  name: string
  size: number
  progress: number
  status: 'waiting' | 'uploading' | 'done' | 'error'
  error?: string
  result?: IFileSummary
  /** H5 为 File，小程序为临时路径 */
  file?: File
  path?: string
}
const uploads = ref<UploadItem[]>([])
let seq = 0
const uploading = computed(() => uploads.value.some(u => u.status === 'waiting' || u.status === 'uploading'))

function addFiles(files: { name: string, size: number, file?: File, path?: string }[]) {
  if (!loggedIn.value)
    return toLogin()
  for (const f of files.slice(0, 10)) {
    const item: UploadItem = { id: ++seq, name: f.name, size: f.size, progress: 0, status: 'waiting', file: f.file, path: f.path }
    if (!f.size) {
      item.status = 'error'
      item.error = '空文件'
    }
    else if (f.size > MAX_SIZE) {
      item.status = 'error'
      item.error = `超过 ${formatBytes(MAX_SIZE)} 上限`
    }
    uploads.value.unshift(item)
  }
  if (files.length > 10)
    toast('一次最多选择 10 个文件')
  runQueue()
}

let running = false
async function runQueue() {
  if (running)
    return
  running = true
  try {
    let next: UploadItem | undefined
    // eslint-disable-next-line no-cond-assign
    while ((next = uploads.value.find(u => u.status === 'waiting'))) {
      const item = next
      item.status = 'uploading'
      try {
        item.result = await uploadOne(item, p => (item.progress = p))
        item.status = 'done'
        item.progress = 1
      }
      catch (e: any) {
        item.status = 'error'
        item.error = e?.message || '上传失败'
      }
    }
  }
  finally {
    running = false
  }
  tick()
  loadList()
}

function uploadOne(item: UploadItem, onProgress: (p: number) => void): Promise<IFileSummary> {
  const query = { expiresIn: String(ttl.value), burnAfterRead: String(burn.value) }
  // #ifdef H5
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', uploadUrl(query))
    for (const [k, v] of Object.entries(authHeader()))
      xhr.setRequestHeader(k, v)
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(item.name))
    xhr.setRequestHeader('Content-Type', item.file!.type || 'application/octet-stream')
    xhr.upload.onprogress = e => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText)
        if (xhr.status === 200 && body.code === 200)
          resolve(body.data)
        else
          reject(new Error(body.message || `上传失败（${xhr.status}）`))
      }
      catch {
        reject(new Error(xhr.status === 413 ? '文件太大' : `上传失败（${xhr.status}）`))
      }
    }
    xhr.onerror = () => reject(new Error('网络错误，上传失败'))
    xhr.send(item.file!)
  })
  // #endif
  // #ifndef H5
  return new Promise((resolve, reject) => {
    const task = uni.uploadFile({
      url: `/files?expiresIn=${query.expiresIn}&burnAfterRead=${query.burnAfterRead}`,
      filePath: item.path!,
      name: 'file',
      formData: { ...query, name: item.name },
      success: (res) => {
        try {
          const body = JSON.parse(res.data as string)
          if (res.statusCode === 200 && body.code === 200)
            resolve(body.data)
          else
            reject(new Error(body.message || `上传失败（${res.statusCode}）`))
        }
        catch {
          reject(new Error(`上传失败（${res.statusCode}）`))
        }
      },
      fail: () => reject(new Error('网络错误，上传失败')),
    })
    task.onProgressUpdate(p => onProgress(p.progress / 100))
  })
  // #endif
}

function retry(item: UploadItem) {
  item.status = 'waiting'
  item.error = undefined
  item.progress = 0
  runQueue()
}

// #ifdef H5
function pickFilesH5() {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.onchange = () => {
    addFiles(Array.from(input.files || []).map(file => ({ name: file.name, size: file.size, file })))
  }
  input.click()
}

const dragging = ref(false)
let dragDepth = 0
const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files')
function onPaste(e: ClipboardEvent) {
  const files = Array.from(e.clipboardData?.files || [])
  if (files.length) {
    e.preventDefault()
    addFiles(files.map(file => ({ name: file.name || `粘贴的文件.${(file.type.split('/')[1] || 'bin')}`, size: file.size, file })))
  }
}
function onDragEnter(e: DragEvent) {
  if (!hasFiles(e))
    return
  e.preventDefault()
  dragDepth++
  dragging.value = true
}
function onDragOver(e: DragEvent) {
  if (hasFiles(e)) {
    e.preventDefault()
    e.dataTransfer!.dropEffect = 'copy'
  }
}
function onDragLeave(e: DragEvent) {
  if (!hasFiles(e))
    return
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth)
    dragging.value = false
}
function onDrop(e: DragEvent) {
  if (!hasFiles(e))
    return
  e.preventDefault()
  dragDepth = 0
  dragging.value = false
  addFiles(Array.from(e.dataTransfer?.files || []).map(file => ({ name: file.name, size: file.size, file })))
}
const listeners = [['paste', onPaste], ['dragenter', onDragEnter], ['dragover', onDragOver], ['dragleave', onDragLeave], ['drop', onDrop]] as [string, EventListener][]
function bindListeners(bind: boolean) {
  for (const [type, fn] of listeners)
    bind ? document.addEventListener(type, fn) : document.removeEventListener(type, fn)
  if (!bind) {
    dragDepth = 0
    dragging.value = false
  }
}
function beforeUnload(e: BeforeUnloadEvent) {
  if (uploading.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}
// #endif

// #ifndef H5
function pickMessageFiles() {
  uni.chooseMessageFile({
    count: 10,
    type: 'all',
    success: res => addFiles(res.tempFiles.map(f => ({ name: f.name, size: f.size, path: f.path }))),
  })
}
function pickMedia() {
  uni.chooseMedia({
    count: 9,
    mediaType: ['image', 'video'],
    sizeType: ['original'],
    success: res => addFiles(res.tempFiles.map((f, i) => ({ name: f.tempFilePath.split('/').pop() || `media-${i + 1}`, size: f.size, path: f.tempFilePath }))),
  })
}
// #endif

function pickFiles() {
  if (!loggedIn.value)
    return toLogin()
  // #ifdef H5
  pickFilesH5()
  // #endif
  // #ifndef H5
  pickMessageFiles()
  // #endif
}

/* ---------------- 我的文件 ---------------- */

const list = ref<IFileSummary[]>([])
const listLoading = ref(false)
const usage = computed(() => list.value.reduce((s, f) => s + f.size, 0))

async function loadList() {
  if (!loggedIn.value)
    return
  listLoading.value = true
  try {
    list.value = await listFiles()
  }
  catch {}
  finally {
    listLoading.value = false
  }
}

async function ownerDownload(item: IFileSummary) {
  try {
    const info = await getFileInfo(item.code)
    fetchedAt = Date.now()
    startDownload(info)
  }
  catch (e: any) {
    toast(e?.message || '获取下载链接失败')
  }
}

function remove(item: IFileSummary) {
  uni.showModal({
    title: '删除文件',
    content: `确定删除「${item.name}」吗？删除后取件码立即失效。`,
    confirmColor: '#ef4444',
    success: async ({ confirm }) => {
      if (!confirm)
        return
      await deleteFile(item.code)
      list.value = list.value.filter(f => f.code !== item.code)
      uploads.value = uploads.value.filter(u => u.result?.code !== item.code)
      toast('已删除', 'success')
    },
  })
}

function toLogin() {
  const code = normalizedCode.value
  const back = code.length === 6 ? `${PAGE_PATH}?code=${code}` : PAGE_PATH
  uni.navigateTo({ url: `${LOGIN_PAGE}?redirect=${encodeURIComponent(back)}` })
}

let ticker: ReturnType<typeof setInterval> | undefined
onLoad((query) => {
  const code = String(query?.code || '').replace(/[^a-z0-9]/gi, '').toUpperCase()
  if (code.length === 6) {
    codeInput.value = code
    fetchByCode(code)
  }
})
onShow(() => {
  loggedIn.value = isLoggedIn()
  loadList()
  ticker = setInterval(tick, 30_000)
  // #ifdef H5
  bindListeners(true)
  window.addEventListener('beforeunload', beforeUnload)
  // #endif
})
function cleanup() {
  clearInterval(ticker)
  // #ifdef H5
  bindListeners(false)
  window.removeEventListener('beforeunload', beforeUnload)
  // #endif
}
onHide(cleanup)
onUnload(cleanup)
</script>

<template>
  <ot-tool-layout>
    <!-- 取件 -->
    <ot-panel title="取件">
      <view class="flex items-center gap-2">
        <view class="ot-fd__code-input">
          <view class="i-carbon-password shrink-0 text-16px text-muted" />
          <input
            v-model="codeInput" class="ot-mono min-w-0 flex-1 text-16px tracking-widest uppercase"
            placeholder="输入 6 位取件码" :maxlength="8" confirm-type="done" @confirm="fetchByCode()"
          >
        </view>
        <wd-button :loading="fetching" :disabled="normalizedCode.length !== 6" @click="fetchByCode()">
          提取
        </wd-button>
      </view>
      <view v-if="fetchError" class="ot-fd__msg is-error">
        <view class="i-carbon-warning-filled shrink-0" />
        <text>{{ fetchError }}</text>
      </view>
      <view v-if="fetched" class="ot-fd__card">
        <view :class="iconOf(fetched.name, fetched.mime)" class="shrink-0 text-36px text-[#14b8a6]" />
        <view class="min-w-0 flex-1">
          <text class="block break-all text-15px text-main font-600">{{ fetched.name }}</text>
          <text class="mt-1 block text-12px text-muted">
            {{ formatBytes(fetched.size) }} · {{ remainText(fetched.expiresAt) }}{{ fetched.isOwner ? ' · 我上传的' : '' }}
          </text>
          <view v-if="fetched.burnAfterRead" class="ot-fd__msg is-warn mt-2!">
            <view class="i-carbon-fire shrink-0" />
            <text>阅后即焚：{{ fetched.isOwner ? '你自己下载不会触发销毁' : '下载一次后立即销毁' }}</text>
          </view>
        </view>
        <wd-button :loading="downloading" @click="confirmDownload(fetched)">
          {{ downloading ? `${downloadProgress}%` : '下载' }}
        </wd-button>
      </view>
    </ot-panel>

    <!-- 未登录 -->
    <ot-panel v-if="!loggedIn">
      <view class="flex flex-wrap items-center gap-3">
        <view class="i-carbon-locked shrink-0 text-20px text-muted" />
        <text class="min-w-0 flex-1 text-13px text-sub leading-20px">无需登录即可凭取件码下载。登录后可以上传文件，并管理自己上传的文件。</text>
        <wd-button size="small" @click="toLogin">
          登录
        </wd-button>
      </view>
    </ot-panel>

    <template v-else>
      <!-- 上传 -->
      <ot-panel title="发送文件">
        <view class="ot-fd__drop" @click="pickFiles">
          <view class="i-carbon-cloud-upload text-36px text-[#14b8a6]" />
          <!-- #ifdef H5 -->
          <text class="mt-2 text-15px text-main font-600">选择文件上传</text>
          <text class="mt-1 text-12px text-muted">也可以把文件拖到页面上，或直接粘贴（Ctrl+V）；单个文件最大 100 MB</text>
          <!-- #endif -->
          <!-- #ifndef H5 -->
          <text class="mt-2 text-15px text-main font-600">从聊天记录选择文件</text>
          <text class="mt-1 text-12px text-muted">单个文件最大 50 MB</text>
          <!-- #endif -->
        </view>
        <!-- #ifndef H5 -->
        <wd-button plain block custom-class="mt-3" @click="pickMedia">
          从相册选择图片 / 视频
        </wd-button>
        <!-- #endif -->
        <view class="mt-4 flex flex-col gap-3 text-13px text-sub">
          <view class="flex items-center gap-3">
            <text class="w-60px shrink-0">有效期</text>
            <ot-segmented v-model="ttl" :options="TTL_OPTIONS" size="small" />
          </view>
          <view class="flex items-center gap-3">
            <text class="w-60px shrink-0">阅后即焚</text>
            <wd-switch v-model="burn" size="20px" />
            <text class="text-12px text-muted">他人下载一次后立即删除</text>
          </view>
        </view>

        <view v-for="u in uploads" :key="u.id" class="ot-fd__upload">
          <view class="flex items-center gap-2">
            <view :class="iconOf(u.name, '')" class="shrink-0 text-20px text-muted" />
            <text class="min-w-0 flex-1 truncate text-13px text-main">{{ u.name }}</text>
            <text class="shrink-0 text-12px text-muted">{{ formatBytes(u.size) }}</text>
          </view>
          <view v-if="u.status === 'uploading' || u.status === 'waiting'" class="ot-fd__progress">
            <view class="ot-fd__progress-bar" :style="{ width: `${Math.round(u.progress * 100)}%` }" />
          </view>
          <view v-if="u.status === 'error'" class="mt-1.5 flex items-center gap-2 text-12px text-red-500">
            <text class="flex-1">{{ u.error }}</text>
            <text v-if="u.file || u.path" class="cursor-pointer font-600" @click="retry(u)">重试</text>
          </view>
          <view v-if="u.result" class="mt-2 flex flex-wrap items-center gap-2">
            <text class="ot-mono ot-fd__code" @click="copyText(u.result.code)">{{ prettyCode(u.result.code) }}</text>
            <text class="flex-1 text-12px text-muted">{{ remainText(u.result.expiresAt) }}{{ u.result.burnAfterRead ? ' · 阅后即焚' : '' }}</text>
            <wd-button size="small" type="info" plain :disabled="!linkOf(u.result.code)" @click="copyText(linkOf(u.result.code))">
              复制链接
            </wd-button>
            <wd-button size="small" type="info" plain @click="toQrcode(u.result.code)">
              二维码
            </wd-button>
          </view>
        </view>
      </ot-panel>

      <!-- 我的文件 -->
      <ot-panel :title="`我的文件 · ${list.length}`">
        <template #extra>
          <text class="text-12px text-muted">{{ formatBytes(usage) }} / 1 GB</text>
          <view class="i-carbon-renew cursor-pointer text-17px text-muted" :class="{ 'animate-spin': listLoading }" @click="loadList" />
        </template>
        <view class="ot-fd__quota">
          <view class="ot-fd__quota-bar" :style="{ width: `${Math.min(100, usage / QUOTA * 100)}%` }" />
        </view>
        <view v-if="!list.length" class="py-6 text-center text-13px text-muted">
          {{ listLoading ? '加载中…' : '还没有上传文件' }}
        </view>
        <view v-for="f in list" :key="f.code" class="ot-fd__item">
          <view class="flex items-start gap-2">
            <view :class="iconOf(f.name, f.mime)" class="mt-0.5 shrink-0 text-22px text-[#14b8a6]" />
            <view class="min-w-0 flex-1">
              <text class="block break-all text-14px text-main">{{ f.name }}</text>
              <view class="mt-1 flex flex-wrap gap-x-3 text-12px text-muted">
                <text>{{ formatBytes(f.size) }}</text>
                <text>{{ remainText(f.expiresAt) }}</text>
                <text v-if="f.downloads">被下载 {{ f.downloads }} 次</text>
                <text v-if="f.burnAfterRead" class="text-orange-500">阅后即焚</text>
              </view>
            </view>
            <text class="ot-mono ot-fd__code" @click="copyText(f.code)">{{ prettyCode(f.code) }}</text>
          </view>
          <view class="ot-fd__actions">
            <view class="ot-fd__action" @click="copyText(linkOf(f.code))">
              <view class="i-carbon-link" />复制链接
            </view>
            <view class="ot-fd__action" @click="toQrcode(f.code)">
              <view class="i-carbon-qr-code" />二维码
            </view>
            <view class="ot-fd__action" @click="ownerDownload(f)">
              <view class="i-carbon-download" />下载
            </view>
            <view class="ot-fd__action is-danger" @click="remove(f)">
              <view class="i-carbon-trash-can" />删除
            </view>
          </view>
        </view>
      </ot-panel>
    </template>

    <view class="px-1 text-12px text-muted leading-20px">
      文件存放在 Cloudflare R2，到期后自动删除（每 15 分钟清理一次）。拿到取件码或链接的人无需登录即可下载，请只发给信任的人。每人最多同时保留 50 个文件、共 1 GB。
    </view>

    <!-- #ifdef H5 -->
    <view v-if="dragging" class="ot-fd__mask">
      <view class="ot-fd__mask-inner">
        <view class="i-carbon-cloud-upload text-40px" />
        <text class="text-16px font-500">松开即可上传</text>
      </view>
    </view>
    <!-- #endif -->
    <qr-popup v-model="qrOpen" :text="qrText" :note="qrNote" />
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-fd__code-input {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 12px;
  border-radius: 10px;
  background: var(--ot-fill);
  color: var(--ot-text);
}

.ot-fd__msg {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 13px;

  &.is-error {
    color: #dc2626;
    background: rgba(239, 68, 68, 0.08);
  }

  &.is-warn {
    color: #b45309;
    background: rgba(245, 158, 11, 0.12);
  }
}

.ot-fd__card {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid var(--ot-border);
}

.ot-fd__drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 26px 16px;
  border-radius: 12px;
  border: 1.5px dashed var(--ot-border);
  background: var(--ot-fill);
  cursor: pointer;
  text-align: center;

  &:hover {
    border-color: #14b8a6;
  }
}

.ot-fd__upload {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--ot-fill);
}

.ot-fd__progress,
.ot-fd__quota {
  height: 6px;
  margin-top: 8px;
  border-radius: 3px;
  background: var(--ot-border);
  overflow: hidden;
}

.ot-fd__quota {
  margin: 0 0 10px;
  height: 4px;
}

.ot-fd__progress-bar,
.ot-fd__quota-bar {
  height: 100%;
  background: #14b8a6;
  transition: width 0.2s;
}

.ot-fd__code {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 1px;
  color: #0d9488;
  background: rgba(20, 184, 166, 0.1);
  cursor: pointer;
}

.ot-fd__item {
  padding: 12px 0;
  border-top: 1px solid var(--ot-border);

  &:first-of-type {
    border-top: none;
  }
}

.ot-fd__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-top: 8px;
  padding-left: 30px;
}

.ot-fd__action {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: var(--ot-text-2);
  cursor: pointer;

  &:hover {
    color: var(--wot-color-theme);
  }

  &.is-danger:hover {
    color: #ef4444;
  }
}

/* #ifdef H5 */
.ot-fd__mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  padding: 16px;
  background: color-mix(in srgb, var(--ot-bg) 75%, transparent);
  backdrop-filter: blur(2px);
  pointer-events: none;
}

.ot-fd__mask-inner {
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 2px dashed #14b8a6;
  border-radius: 16px;
  color: #14b8a6;
}
/* #endif */
</style>
