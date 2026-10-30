import type { Plugin } from 'vite'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

/**
 * WebShell 的浏览器端 SSH 客户端：把 webshell-wasm/ 下的 Go 源码编译成 WebAssembly（仅 H5）。
 *
 * - 按源码内容计算哈希，编译结果缓存在 node_modules/.cache/webshell-wasm/<哈希>/，源码不变不会重复编译
 * - 文件名带哈希（static/webshell/ssh-<哈希>.wasm），PWA 缓存不会拿到旧版本
 * - wasm_exec.js 取自当前 Go 工具链（必须与编译用的 Go 版本一致）
 * - 页面通过全局常量 __WEBSHELL_ASSETS__ 拿到两个文件的地址
 * - 没有安装 Go 时只给出警告，其他工具照常构建，WebShell 页面会提示组件缺失；
 *   设置环境变量 WEBSHELL_WASM_REQUIRED=1（CI 中）时改为构建失败
 */
interface Options {
  /** 站点部署路径，对应 VITE_APP_PUBLIC_BASE */
  base: string
}

const SRC = 'webshell-wasm'

function sourceHash(root: string) {
  const dir = path.join(root, SRC)
  const h = createHash('sha256')
  for (const f of fs.readdirSync(dir).filter(f => /\.go$|^go\.(?:mod|sum)$/.test(f)).sort()) {
    h.update(f)
    h.update(fs.readFileSync(path.join(dir, f)))
  }
  return h.digest('hex').slice(0, 10)
}

function goEnv(name: string) {
  return execFileSync('go', ['env', name], { encoding: 'utf8' }).trim()
}

function build(root: string): { dir: string, wasm: string, exec: string } | string {
  let hash: string
  try {
    hash = sourceHash(root)
  }
  catch {
    return `找不到 ${SRC}/ 目录`
  }
  const dir = path.join(root, 'node_modules/.cache/webshell-wasm', hash)
  const wasm = `ssh-${hash}.wasm`
  const exec = `wasm_exec-${hash}.js`
  if (fs.existsSync(path.join(dir, wasm)) && fs.existsSync(path.join(dir, exec)))
    return { dir, wasm, exec }
  try {
    const goroot = goEnv('GOROOT')
    // Go 1.24 起 wasm_exec.js 在 lib/wasm，之前在 misc/wasm
    const execSrc = [path.join(goroot, 'lib/wasm/wasm_exec.js'), path.join(goroot, 'misc/wasm/wasm_exec.js')].find(p => fs.existsSync(p))
    if (!execSrc)
      return '当前 Go 工具链中找不到 wasm_exec.js'
    fs.mkdirSync(dir, { recursive: true })
    const tmp = path.join(dir, `${wasm}.tmp`)
    console.log(`[webshell-wasm] 编译 SSH 客户端（${hash}）…`)
    execFileSync('go', ['build', '-trimpath', '-ldflags=-s -w', '-o', tmp, '.'], {
      cwd: path.join(root, SRC),
      env: { ...process.env, GOOS: 'js', GOARCH: 'wasm' },
      stdio: 'inherit',
    })
    fs.renameSync(tmp, path.join(dir, wasm))
    fs.copyFileSync(execSrc, path.join(dir, exec))
    return { dir, wasm, exec }
  }
  catch (e) {
    return `编译失败（需要安装 Go，见 README「WebShell」）：${e instanceof Error ? e.message.split('\n')[0] : e}`
  }
}

export default function webshellWasmPlugin(options: Options): Plugin {
  const base = options.base.endsWith('/') ? options.base : `${options.base}/`
  let result: ReturnType<typeof build> = ''
  return {
    name: 'otools-webshell-wasm',
    config() {
      result = build(process.cwd())
      if (typeof result === 'string') {
        if (process.env.WEBSHELL_WASM_REQUIRED === '1')
          throw new Error(`[webshell-wasm] ${result}`)
        console.warn(`[webshell-wasm] ${result}；WebShell 将不可用`)
      }
      const assets = typeof result === 'string'
        ? { wasm: '', exec: '', error: result }
        : { wasm: `${base}static/webshell/${result.wasm}`, exec: `${base}static/webshell/${result.exec}`, error: '' }
      return { define: { __WEBSHELL_ASSETS__: JSON.stringify(assets) } }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (typeof result === 'string' || !req.url)
          return next()
        const name = req.url.split('?')[0].replace(`${base}static/webshell/`, '')
        if (name !== result.wasm && name !== result.exec)
          return next()
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript; charset=utf-8')
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        fs.createReadStream(path.join(result.dir, name)).pipe(res)
      })
    },
    generateBundle() {
      if (typeof result === 'string')
        return
      for (const name of [result.wasm, result.exec])
        this.emitFile({ type: 'asset', fileName: `static/webshell/${name}`, source: fs.readFileSync(path.join(result.dir, name)) })
    },
  }
}
