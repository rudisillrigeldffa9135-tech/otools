import type { Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

/**
 * 工具元信息虚拟模块 `virtual:tool-metas`
 *
 * 为什么不直接 import.meta.glob('src/pages-tools/* /meta.ts')？
 * meta.ts 位于小程序分包 pages-tools 目录下，被打包后仍会留在分包里，
 * 而首页（主包）在启动时无法同步 require 分包文件，真机上会直接报错。
 * 这里在构建期读取各个 meta.ts 中的对象字面量，内联到主包的虚拟模块里。
 *
 * 约束：meta.ts 中 defineTool({...}) 的参数必须是纯字面量（不能引用变量）。
 */
const VIRTUAL_ID = 'virtual:tool-metas'
const RESOLVED_ID = `\0${VIRTUAL_ID}`

function getToolsDir() {
  return path.resolve(process.cwd(), 'src/pages-tools')
}

function readMeta(file: string) {
  const code = fs.readFileSync(file, 'utf8')
  const start = code.indexOf('defineTool(')
  const end = code.lastIndexOf(')')
  if (start < 0 || end < start)
    throw new Error(`[tool-metas] ${file} 中未找到 defineTool({...})`)
  const literal = code.slice(start + 'defineTool('.length, end)
  try {
    // eslint-disable-next-line no-new-func
    return new Function(`return (${literal})`)()
  }
  catch (e: any) {
    throw new Error(`[tool-metas] 解析 ${file} 失败（defineTool 的参数必须是纯字面量）：${e.message}`)
  }
}

function collectMetas() {
  const dir = getToolsDir()
  if (!fs.existsSync(dir))
    return []
  return fs.readdirSync(dir)
    .filter(name => fs.existsSync(path.join(dir, name, 'meta.ts')))
    .map((name) => {
      const meta = readMeta(path.join(dir, name, 'meta.ts'))
      if (meta.id !== name)
        throw new Error(`[tool-metas] 工具 id "${meta.id}" 必须与目录名 "${name}" 一致`)
      return meta
    })
}

export default function toolMetasPlugin(): Plugin {
  return {
    name: 'tool-metas',
    enforce: 'pre',
    resolveId(id) {
      if (id === VIRTUAL_ID)
        return RESOLVED_ID
    },
    load(id) {
      if (id !== RESOLVED_ID)
        return
      // 让构建 / dev 监听这些文件，修改后重新生成
      const dir = getToolsDir()
      if (fs.existsSync(dir)) {
        for (const name of fs.readdirSync(dir)) {
          const file = path.join(dir, name, 'meta.ts')
          if (fs.existsSync(file))
            this.addWatchFile(file)
        }
      }
      return `export default ${JSON.stringify(collectMetas(), null, 2)}`
    },
    configureServer(server) {
      const reload = (file: string) => {
        if (!/[\\/]pages-tools[\\/][^\\/]+[\\/]meta\.ts$/.test(file))
          return
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (mod) {
          server.moduleGraph.invalidateModule(mod)
          server.ws.send({ type: 'full-reload' })
        }
      }
      server.watcher.on('add', reload)
      server.watcher.on('change', reload)
      server.watcher.on('unlink', reload)
    },
  }
}
