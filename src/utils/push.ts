/**
 * 浏览器推送（仅 H5）：申请通知权限、用服务端的 VAPID 公钥订阅、把订阅信息交给服务端。
 * 依赖 Service Worker（src/utils/pwa.ts 注册，仅生产环境）。
 */
import { getPushKey, subscribePush, unsubscribePush } from '@/api/notify'

export type PushStatus = 'unsupported' | 'insecure' | 'denied' | 'off' | 'on' | 'no-sw' | 'ios-install'

function b64urlToBytes(str: string) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(s + '='.repeat((4 - s.length % 4) % 4))
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true
}

async function registration() {
  if (!('serviceWorker' in navigator))
    return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

/** 当前状态 */
export async function pushStatus(): Promise<PushStatus> {
  if (typeof window === 'undefined')
    return 'unsupported'
  if (!window.isSecureContext)
    return 'insecure'
  // iOS 只有「添加到主屏幕」后打开才支持推送
  if (isIos() && !isStandalone())
    return 'ios-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    return 'unsupported'
  if (Notification.permission === 'denied')
    return 'denied'
  const reg = await registration()
  if (!reg)
    return 'no-sw'
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off'
}

/** 开启：申请权限并订阅 */
export async function enablePush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted')
    throw new Error(permission === 'denied' ? '你拒绝了通知权限，请在浏览器的网站设置里允许通知后重试' : '没有获得通知权限')
  const reg = await registration()
  if (!reg)
    throw new Error('后台服务还没准备好，请刷新页面后再试')
  const { publicKey } = await getPushKey()
  if (!publicKey)
    throw new Error('服务器尚未配置浏览器推送')
  let sub = await reg.pushManager.getSubscription()
  if (!sub)
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(publicKey) })
  const json = sub.toJSON()
  await subscribePush({ endpoint: sub.endpoint, keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth } })
}

/** 关闭：取消本浏览器的订阅 */
export async function disablePush() {
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub)
    return
  await unsubscribePush(sub.endpoint).catch(() => {})
  await sub.unsubscribe()
}

/**
 * 登录后同步一次：本浏览器已订阅但服务端可能已删除（换账号、清理失效订阅），重新登记到当前账号
 */
export async function syncPushSubscription() {
  try {
    const reg = await registration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub || Notification.permission !== 'granted')
      return
    const json = sub.toJSON()
    await subscribePush({ endpoint: sub.endpoint, keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth } })
  }
  catch {}
}
