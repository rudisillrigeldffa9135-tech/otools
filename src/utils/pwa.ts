/**
 * H5 的 PWA 安装支持（仅 H5 使用）：注册 Service Worker，并接管浏览器的安装提示，
 * 让「我的」页面可以放一个「安装到桌面」按钮。manifest 与 sw.js 由 vite-plugins/pwa.ts 生成。
 */
import { computed, ref } from 'vue'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const installEvent = ref<BeforeInstallPromptEvent | null>(null)
const installed = ref(false)

function detectStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true
}

/** iOS / iPadOS 的 Safari 不支持安装提示，只能手动「添加到主屏幕」 */
const isIos = typeof navigator !== 'undefined'
  && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

export const pwaState = {
  /** 浏览器支持一键安装（Chrome / Edge / 安卓等） */
  canPrompt: computed(() => !!installEvent.value && !installed.value),
  /** 需要手动添加到主屏幕（iOS Safari） */
  needManual: computed(() => isIos && !installed.value),
  /** 已经以安装后的应用方式打开 */
  installed: computed(() => installed.value),
}

export function setupPwa() {
  if (typeof window === 'undefined')
    return
  installed.value = detectStandalone()
  window.addEventListener('beforeinstallprompt', (e) => {
    // 不弹浏览器自带的安装横幅，改为在「我的」页面里手动安装
    e.preventDefault()
    installEvent.value = e as BeforeInstallPromptEvent
  })
  window.addEventListener('appinstalled', () => {
    installed.value = true
    installEvent.value = null
  })
  // 开发环境不注册，避免缓存干扰热更新
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const register = () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(e => console.warn('Service Worker 注册失败', e))
    // 页面加载完再注册，不和首屏抢带宽
    if (document.readyState === 'complete')
      register()
    else
      window.addEventListener('load', register, { once: true })
  }
}

/** 弹出浏览器的安装确认框，返回是否安装 */
export async function promptInstall() {
  const e = installEvent.value
  if (!e)
    return false
  await e.prompt()
  const { outcome } = await e.userChoice
  // 安装提示只能使用一次
  installEvent.value = null
  return outcome === 'accepted'
}
