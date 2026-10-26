import type { Plugin } from 'vite'

/**
 * H5 的 PWA 支持：生成 manifest.webmanifest 与 Service Worker（sw.js），放在站点根目录。
 *
 * - 图标在 src/static/pwa/（由 icon.svg 导出），随 static 目录一起发布到 /static/pwa/
 * - sw.js 必须放在根目录，才能接管整个站点；注册代码见 src/utils/pwa.ts（仅生产环境注册）
 * - 缓存策略：页面导航走网络优先（保证总能拿到最新版本，离线时回退到缓存的首页），
 *   带 hash 的构建产物缓存优先；/api、/s（短链）、/r（快传纯文本）一律不缓存
 */
interface PwaOptions {
  /** 站点部署路径，对应 VITE_APP_PUBLIC_BASE */
  base: string
  name: string
  shortName?: string
  description?: string
  themeColor: string
  backgroundColor: string
}

function createManifest(o: PwaOptions) {
  const icon = (file: string, size: number, purpose = 'any') => ({
    src: `static/pwa/${file}`,
    sizes: `${size}x${size}`,
    type: 'image/png',
    purpose,
  })
  return {
    id: o.base,
    name: o.name,
    short_name: o.shortName || o.name,
    description: o.description,
    lang: 'zh-CN',
    start_url: o.base,
    scope: o.base,
    display: 'standalone',
    orientation: 'any',
    theme_color: o.themeColor,
    background_color: o.backgroundColor,
    icons: [
      icon('icon-192.png', 192),
      icon('icon-512.png', 512),
      icon('icon-maskable-512.png', 512, 'maskable'),
    ],
  }
}

function createServiceWorker(o: PwaOptions, version: string) {
  return `/* OTools Service Worker，由 vite-plugins/pwa.ts 生成 */
const CACHE = 'otools-${version}'
const BASE = ${JSON.stringify(o.base)}
const SHELL = [BASE, BASE + 'manifest.webmanifest', BASE + 'static/pwa/icon-192.png']
/** 不经过缓存的路径：接口、短链跳转、快传纯文本 */
const BYPASS = ['api/', 's/', 'r/'].map(p => BASE + p)

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('otools-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// 浏览器推送：显示系统通知；点击后打开（或切换到）对应页面
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  }
  catch {}
  const title = data.title || 'OTools 提醒'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    tag: data.tag,
    renotify: !!data.tag,
    icon: BASE + 'static/pwa/icon-192.png',
    badge: BASE + 'static/pwa/icon-192.png',
    data: { url: data.url || BASE },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || BASE
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const win = list.find(c => new URL(c.url).origin === self.location.origin)
      if (win)
        return win.focus().then(() => win.navigate ? win.navigate(url) : undefined)
      return self.clients.openWindow(url)
    }),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET')
    return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || BYPASS.some(p => url.pathname.startsWith(p)))
    return

  // 页面导航：网络优先，离线时回退到缓存的首页（hash 路由，所有页面共用同一个 HTML）
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then(cache => cache.put(BASE, copy))
          }
          return res
        })
        .catch(() => caches.match(BASE).then(res => res || Response.error())),
    )
    return
  }

  // 带 hash 的构建产物内容不变：缓存优先；其他静态文件：先用缓存，同时后台更新
  const immutable = url.pathname.startsWith(BASE + 'assets/')
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req)
      const network = fetch(req).then((res) => {
        if (res.ok && res.type === 'basic')
          cache.put(req, res.clone())
        return res
      })
      if (cached) {
        if (!immutable)
          event.waitUntil(network.catch(() => {}))
        return cached
      }
      return network
    }),
  )
})
`
}

export default function pwaPlugin(options: PwaOptions): Plugin {
  const manifest = JSON.stringify(createManifest(options), null, 2)
  return {
    name: 'otools-pwa',
    // 开发环境也提供 manifest，便于调试；Service Worker 只在生产环境注册
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== `${options.base}manifest.webmanifest`)
          return next()
        res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
        res.end(manifest)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest })
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: createServiceWorker(options, Date.now().toString(36)) })
    },
  }
}
