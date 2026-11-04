/**
 * H5 构建时生成 Cloudflare 静态资源的 _headers 文件，给页面加上安全响应头：
 * - Content-Security-Policy：只允许加载本站脚本（index.html 里的内联脚本按构建结果计算哈希放行），
 *   即使出现 XSS 也无法加载外部脚本、把登录凭证发往其他域名
 * - 禁止被其他网站用 iframe 嵌入（防点击劫持）、HSTS、nosniff、Referrer-Policy、Permissions-Policy
 * /api、/s、/r 由 Worker 处理，不经过 _headers（见 worker/src/lib.ts 等处的响应头）
 */
import type { Plugin } from 'vite'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** 取出 HTML 中所有内联 <script>（不带 src）的内容 */
export function inlineScripts(html: string) {
  const out: string[] = []
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (!/\ssrc\s*=/i.test(m[1]))
      out.push(m[2])
  }
  return out
}

export function buildCsp(scriptHashes: string[]) {
  return [
    `default-src 'self'`,
    // WebShell 的 SSH 客户端是 WebAssembly，需要 wasm-unsafe-eval（不放开 JS 的 eval）
    `script-src 'self' 'wasm-unsafe-eval' ${scriptHashes.map(h => `'sha256-${h}'`).join(' ')}`.trim(),
    // uni-app 与组件库大量使用行内样式
    `style-src 'self' 'unsafe-inline'`,
    // 便签 Markdown 可以引用外部图片
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `media-src 'self' data: blob:`,
    // 接口与 WebShell 的 WebSocket 都在本站
    `connect-src 'self'`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    `frame-src 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ')
}

export function buildHeaders(html: string) {
  const hashes = inlineScripts(html).map(s => createHash('sha256').update(s, 'utf8').digest('base64'))
  return `/*
  Content-Security-Policy: ${buildCsp(hashes)}
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Strict-Transport-Security: max-age=31536000
  Cross-Origin-Opener-Policy: same-origin
  Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()
`
}

export default function securityHeadersPlugin(): Plugin {
  let outDir = ''
  return {
    name: 'otools-security-headers',
    apply: 'build',
    enforce: 'post',
    // uni 在 writeBundle 之后还会改写 index.html，等全部写完再计算内联脚本的哈希
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const dir = outDir
      if (!dir || !fs.existsSync(path.join(dir, 'index.html')))
        return
      const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
      fs.writeFileSync(path.join(dir, '_headers'), buildHeaders(html))
    },
  }
}
