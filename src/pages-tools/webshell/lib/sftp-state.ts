/**
 * 每个会话的 SFTP 状态（打开的 SFTP 通道、当前目录、传输任务），放在模块里，关闭文件面板后传输继续进行。
 */
import type { SftpEntry } from './ssh'
import { getConn } from './sessions'
import { joinPath, parseIdNames } from './util'

export interface Transfer {
  id: number
  kind: 'upload' | 'download'
  name: string
  path: string
  size: number
  done: number
  status: 'running' | 'done' | 'error' | 'cancelled'
  error: string
  startedAt: number
  speed: number
  cancel: boolean
}

export interface SftpState {
  fid: number
  generation: number
  cwd: string
  home: string
  users: Map<number, string>
  groups: Map<number, string>
  transfers: Transfer[]
}

const states = new Map<string, SftpState>()
const CHUNK = 256 * 1024
let tid = 0

export function sftpState(key: string) {
  let st = states.get(key)
  if (!st) {
    st = reactive({ fid: 0, generation: -1, cwd: '', home: '', users: new Map(), groups: new Map(), transfers: [] }) as SftpState
    states.set(key, st)
  }
  return st
}

export function dropSftpState(key: string) {
  states.delete(key)
}

/** 确保 SFTP 通道可用（重连后重新打开），返回 [ssh, fid] */
export async function ensureSftp(key: string, generation: number) {
  const conn = getConn(key)
  if (!conn)
    throw new Error('连接已断开')
  const st = sftpState(key)
  if (st.fid && st.generation === generation)
    return { ssh: conn.ssh, fid: st.fid }
  st.fid = await conn.ssh.sftpOpen(conn.id)
  st.generation = generation
  if (!st.home)
    st.home = await conn.ssh.sftpRealpath(st.fid, '.')
  if (!st.cwd)
    st.cwd = st.home
  // 读取用户名、组名（失败时只显示数字）
  conn.ssh.exec(conn.id, 'cat /etc/passwd; echo @@; cat /etc/group', { timeout: 8000 }).then((r) => {
    const [p, g = ''] = r.stdout.split('@@')
    st.users = parseIdNames(p)
    st.groups = parseIdNames(g)
  }).catch(() => {})
  return { ssh: conn.ssh, fid: st.fid }
}

function track(st: SftpState, t: Omit<Transfer, 'id' | 'done' | 'status' | 'error' | 'startedAt' | 'speed' | 'cancel'>) {
  const item = reactive<Transfer>({ ...t, id: ++tid, done: 0, status: 'running', error: '', startedAt: Date.now(), speed: 0, cancel: false })
  st.transfers.unshift(item)
  if (st.transfers.length > 50)
    st.transfers.splice(50)
  return item
}

function progress(t: Transfer, n: number) {
  t.done += n
  const sec = (Date.now() - t.startedAt) / 1000
  t.speed = sec > 0 ? t.done / sec : 0
}

/** 上传本地文件到 dir（同名覆盖） */
export async function uploadFile(key: string, generation: number, file: File, dir: string) {
  const { ssh, fid } = await ensureSftp(key, generation)
  const st = sftpState(key)
  const path = joinPath(dir, file.name)
  const t = track(st, { kind: 'upload', name: file.name, path, size: file.size })
  let hid = 0
  try {
    hid = await ssh.sftpOpenWrite(fid, path, false)
    for (let off = 0; off < file.size; off += CHUNK) {
      if (t.cancel)
        throw new Error('已取消')
      const buf = new Uint8Array(await file.slice(off, off + CHUNK).arrayBuffer())
      await ssh.sftpWrite(hid, buf)
      progress(t, buf.length)
    }
    await ssh.sftpCloseFile(hid)
    hid = 0
    t.status = 'done'
  }
  catch (e: any) {
    t.status = t.cancel ? 'cancelled' : 'error'
    t.error = e?.message || '上传失败'
    if (hid)
      await ssh.sftpCloseFile(hid).catch(() => {})
    // 取消或失败时删除不完整的文件
    if (t.cancel)
      await ssh.sftpRemove(fid, path, false).catch(() => {})
  }
  return t
}

/** 读取整个文件到内存（用于下载与编辑） */
export async function readWhole(key: string, generation: number, path: string, t?: Transfer, max = Infinity) {
  const { ssh, fid } = await ensureSftp(key, generation)
  const { id, size } = await ssh.sftpOpenRead(fid, path)
  if (size > max) {
    await ssh.sftpCloseFile(id)
    throw new Error('文件太大')
  }
  const parts: Uint8Array[] = []
  try {
    for (;;) {
      if (t?.cancel)
        throw new Error('已取消')
      const chunk = await ssh.sftpRead(id, 512 * 1024)
      if (!chunk)
        break
      parts.push(chunk)
      if (t)
        progress(t, chunk.length)
    }
  }
  finally {
    await ssh.sftpCloseFile(id).catch(() => {})
  }
  return new Blob(parts as BlobPart[])
}

/** 下载文件：大文件在支持的浏览器里直接写入磁盘，避免占用大量内存 */
export async function downloadFile(key: string, generation: number, entry: SftpEntry, dir: string) {
  const st = sftpState(key)
  const path = joinPath(dir, entry.name)
  const t = track(st, { kind: 'download', name: entry.name, path, size: entry.size })
  try {
    const picker = (window as any).showSaveFilePicker
    if (entry.size > 100 * 1024 * 1024 && picker) {
      const handle = await picker({ suggestedName: entry.name })
      const writable = await handle.createWritable()
      const { ssh, fid } = await ensureSftp(key, generation)
      const { id } = await ssh.sftpOpenRead(fid, path)
      try {
        for (;;) {
          if (t.cancel)
            throw new Error('已取消')
          const chunk = await ssh.sftpRead(id, 512 * 1024)
          if (!chunk)
            break
          await writable.write(chunk)
          progress(t, chunk.length)
        }
        await writable.close()
      }
      catch (e) {
        await writable.abort?.().catch(() => {})
        throw e
      }
      finally {
        await ssh.sftpCloseFile(id).catch(() => {})
      }
    }
    else {
      const blob = await readWhole(key, generation, path, t)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = entry.name
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    }
    t.status = 'done'
  }
  catch (e: any) {
    t.status = t.cancel || e?.name === 'AbortError' ? 'cancelled' : 'error'
    t.error = e?.name === 'AbortError' ? '已取消' : (e?.message || '下载失败')
  }
  return t
}
