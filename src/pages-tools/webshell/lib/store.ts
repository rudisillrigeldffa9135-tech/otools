/**
 * WebShell 数据：主密码解锁、条目加解密、多设备同步（每 60 秒拉取一次，页面不可见时暂停）。
 * 所有内容在浏览器里加解密，服务端只保存密文。
 */
import type { IWebshellItem, IWebshellVault, WebshellKind } from '@/api/webshell'
import type { Group, Host, KnownHost, Settings, Snippet, SshKey } from './types'
import { createWebshellVault, deleteWebshellItem, getWebshellVault, listWebshellItems, putWebshellItem, resetWebshellVault, updateWebshellVault } from '@/api/webshell'
import { changeVaultPassword, createVault, decryptItem, encryptItem, forgetKey, recallKey, rememberKey, unlockVault } from './crypto'
import { DEFAULT_SETTINGS, SETTINGS_ID } from './types'
import { newId } from './util'

export type Phase = 'loading' | 'setup' | 'locked' | 'ready' | 'error'

interface KindMap {
  host: Host
  group: Group
  snippet: Snippet
  key: SshKey
  known_host: KnownHost
  settings: Settings
}

export const data = reactive({
  phase: 'loading' as Phase,
  error: '',
  hosts: [] as Host[],
  groups: [] as Group[],
  snippets: [] as Snippet[],
  keys: [] as SshKey[],
  knownHosts: [] as KnownHost[],
  settings: { ...DEFAULT_SETTINGS } as Settings,
  /** 无法解密的条目数（被篡改或用旧密钥加密） */
  broken: 0,
  syncing: false,
  lastSync: 0,
  remembered: false,
})

let userId = 0
let vault: IWebshellVault | null = null
let key: CryptoKey | null = null
/** 已解密的缓存：id => { rev, kind, value } */
const cache = new Map<string, { rev: number, kind: WebshellKind, value: any }>()

function applyCache() {
  const by = <K extends WebshellKind>(kind: K) => [...cache.values()].filter(c => c.kind === kind).map(c => c.value as KindMap[K])
  data.hosts = by('host').sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name, 'zh-CN'))
  data.groups = by('group').sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'zh-CN'))
  data.snippets = by('snippet').sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'zh-CN'))
  data.keys = by('key').sort((a, b) => a.createdAt - b.createdAt)
  data.knownHosts = by('known_host')
  data.settings = { ...DEFAULT_SETTINGS, ...(by('settings')[0] ?? {}), id: SETTINGS_ID }
}

async function decryptAll(items: IWebshellItem[]) {
  if (!key)
    return
  const seen = new Set<string>()
  let broken = 0
  for (const it of items) {
    seen.add(it.id)
    const c = cache.get(it.id)
    if (c && c.rev === it.rev)
      continue
    try {
      const value = await decryptItem(key, it.id, it.kind, it.data)
      cache.set(it.id, { rev: it.rev, kind: it.kind, value: { ...(value as object), id: it.id } })
    }
    catch {
      broken++
    }
  }
  for (const id of [...cache.keys()]) {
    if (!seen.has(id))
      cache.delete(id)
  }
  data.broken = broken
  applyCache()
}

export async function sync(silent = true) {
  if (!key || data.syncing)
    return
  data.syncing = true
  try {
    await decryptAll(await listWebshellItems())
    data.lastSync = Date.now()
  }
  catch (e) {
    if (!silent)
      throw e
  }
  finally {
    data.syncing = false
  }
}

async function enter(k: CryptoKey) {
  key = k
  cache.clear()
  await decryptAll(await listWebshellItems())
  data.lastSync = Date.now()
  data.phase = 'ready'
}

/** 进入页面时调用：判断是否已设置主密码、本设备是否记住了密钥 */
export async function init(uid: number) {
  userId = uid
  data.phase = 'loading'
  data.error = ''
  try {
    vault = await getWebshellVault()
    if (!vault) {
      data.phase = 'setup'
      return
    }
    const k = await recallKey(uid, vault.updatedAt)
    data.remembered = !!k
    if (k) {
      try {
        await enter(k)
        return
      }
      catch {}
    }
    data.phase = 'locked'
  }
  catch (e: any) {
    data.phase = 'error'
    data.error = e?.message || '加载失败'
  }
}

export async function setup(password: string, remember: boolean) {
  const { blob, key: k } = await createVault(password)
  const res = await createWebshellVault(blob.kdf, blob.wrappedKey)
  vault = { ...blob, updatedAt: res.updatedAt }
  await setRemember(remember, k)
  await enter(k)
}

export async function unlock(password: string, remember: boolean) {
  if (!vault)
    throw new Error('尚未设置主密码')
  const k = await unlockVault(vault, password)
  await setRemember(remember, k)
  await enter(k)
}

async function setRemember(remember: boolean, k: CryptoKey | null = key) {
  if (remember && k && vault)
    await rememberKey(userId, k, vault.updatedAt)
  else
    await forgetKey(userId)
  data.remembered = remember && !!k
}

export function toggleRemember(remember: boolean) {
  return setRemember(remember)
}

/** 锁定：清空内存里的密钥与明文；同时取消「在此设备上记住」 */
export async function lock() {
  key = null
  cache.clear()
  applyCache()
  await forgetKey(userId)
  data.remembered = false
  data.phase = vault ? 'locked' : 'setup'
}

export async function changePassword(oldPassword: string, newPassword: string) {
  if (!vault)
    throw new Error('尚未设置主密码')
  // 先拿最新的参数，避免用过期的数据覆盖其他设备的修改
  const latest = await getWebshellVault()
  if (!latest)
    throw new Error('主密码已被重置，请刷新页面')
  const blob = await changeVaultPassword(latest, oldPassword, newPassword)
  const res = await updateWebshellVault(blob.kdf, blob.wrappedKey, latest.updatedAt)
  vault = { ...blob, updatedAt: res.updatedAt }
  if (data.remembered && key)
    await rememberKey(userId, key, vault.updatedAt)
}

/** 忘记主密码时重置：删除全部 WebShell 数据 */
export async function resetAll() {
  await resetWebshellVault()
  await forgetKey(userId)
  key = null
  vault = null
  cache.clear()
  applyCache()
  data.phase = 'setup'
}

export class ConflictError extends Error {}

/** 保存条目（新建或更新）；多设备同时修改时刷新数据并抛出 ConflictError */
export async function save<K extends WebshellKind>(kind: K, value: KindMap[K]): Promise<KindMap[K]> {
  if (!key)
    throw new Error('已锁定，请先解锁')
  const id = value.id || newId()
  const item = { ...value, id }
  const rev = cache.get(id)?.rev ?? 0
  const enc = await encryptItem(key, id, kind, item)
  try {
    const res = await putWebshellItem(id, kind, enc, rev)
    cache.set(id, { rev: res.rev, kind, value: item })
    applyCache()
    return item
  }
  catch (e: any) {
    if (e?.statusCode === 409) {
      await sync()
      throw new ConflictError('这条数据已在其他设备上修改，已刷新为最新内容，请重新操作')
    }
    throw new Error(e?.message || '保存失败')
  }
}

export async function remove(id: string) {
  await deleteWebshellItem(id)
  cache.delete(id)
  applyCache()
}

/** 保存设置：设置只有一份，冲突时以最新的为基础再写一次 */
export async function saveSettings(patch: Partial<Settings>) {
  const next = { ...data.settings, ...patch, id: SETTINGS_ID }
  data.settings = next
  try {
    await save('settings', next)
  }
  catch (e) {
    if (!(e instanceof ConflictError))
      throw e
    await save('settings', { ...data.settings, ...patch, id: SETTINGS_ID })
  }
}

/** 记录连接次数与时间（失败不影响连接） */
export function markConnected(hostId: string) {
  const h = data.hosts.find(x => x.id === hostId)
  if (!h)
    return
  save('host', { ...h, lastConnectedAt: Math.floor(Date.now() / 1000), connectCount: (h.connectCount || 0) + 1 }).catch(() => {})
}

/* ---------------- 定时同步 ---------------- */

let timer: ReturnType<typeof setInterval> | undefined

function onVisible() {
  if (document.visibilityState === 'visible' && Date.now() - data.lastSync > 30_000)
    sync()
}

export function startAutoSync() {
  stopAutoSync()
  timer = setInterval(() => {
    if (document.visibilityState === 'visible')
      sync()
  }, 60_000)
  document.addEventListener('visibilitychange', onVisible)
}

export function stopAutoSync() {
  clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisible)
}
