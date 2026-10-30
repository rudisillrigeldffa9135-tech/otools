/** WebShell 的纯函数工具：SSH 配置导入、快捷命令变量、远程路径、权限、Shell 转义 */

/* ---------------- 导入 ~/.ssh/config ---------------- */

export interface ImportedHost {
  alias: string
  host: string
  port: number
  username: string
  /** IdentityFile 的文件名（浏览器读不到本机文件，只用来提示用户导入对应私钥） */
  identityFile: string
  /** ProxyJump 指向的别名（只取第一跳） */
  proxyJump: string
}

/** 解析 OpenSSH 客户端配置；跳过含通配符的 Host 与 Match 块，Host * 中的默认值会应用到其他主机 */
export function parseSshConfig(text: string): ImportedHost[] {
  interface Block { patterns: string[], opts: Record<string, string> }
  const blocks: Block[] = []
  let cur: Block | null = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line)
      continue
    // 「Key Value」或「Key=Value」
    const name = line.match(/^\w+/)?.[0]
    if (!name)
      continue
    let rest = line.slice(name.length).trim()
    if (rest.startsWith('='))
      rest = rest.slice(1).trim()
    if (!rest)
      continue
    const key = name.toLowerCase()
    const value = rest.replace(/^"(.*)"$/, '$1')
    if (key === 'host') {
      cur = { patterns: value.split(/\s+/), opts: {} }
      blocks.push(cur)
    }
    else if (key === 'match') {
      cur = null
    }
    else if (cur && !(key in cur.opts)) {
      // 与 OpenSSH 一致：同一选项以第一次出现的为准
      cur.opts[key] = value
    }
  }
  const defaults = blocks.filter(b => b.patterns.includes('*')).reduce<Record<string, string>>((acc, b) => ({ ...b.opts, ...acc }), {})
  const out: ImportedHost[] = []
  for (const b of blocks) {
    for (const alias of b.patterns) {
      if (/[*?!]/.test(alias))
        continue
      const o = { ...defaults, ...b.opts }
      out.push({
        alias,
        host: o.hostname || alias,
        port: Number(o.port) || 22,
        username: o.user || '',
        identityFile: (o.identityfile || '').split(/[\\/]/).pop() || '',
        proxyJump: o.proxyjump && o.proxyjump.toLowerCase() !== 'none' ? parseHostInput(o.proxyjump.split(',')[0]).host : '',
      })
    }
  }
  return out
}

/* ---------------- 地址解析（含 IPv6） ---------------- */

/**
 * 解析用户输入的地址：host、user@host、host:port、[IPv6]:port、user@IPv6、ssh://…
 * 不带方括号的 IPv6（含两个及以上冒号）整体视为地址，不拆端口。返回的 host 不带方括号
 */
export function parseHostInput(input: string): { host: string, username?: string, port?: number } {
  let s = input.trim().replace(/^ssh:\/\//i, '').replace(/\/+$/, '')
  let username: string | undefined
  const at = s.lastIndexOf('@')
  if (at > 0) {
    username = s.slice(0, at)
    s = s.slice(at + 1)
  }
  let port: number | undefined
  if (s.startsWith('[')) {
    const end = s.indexOf(']')
    if (end > 0) {
      const rest = s.slice(end + 1)
      if (/^:\d+$/.test(rest))
        port = Number(rest.slice(1))
      s = s.slice(1, end)
    }
  }
  else if ((s.match(/:/g) ?? []).length === 1) {
    const [h, p] = s.split(':')
    if (/^\d+$/.test(p)) {
      s = h
      port = Number(p)
    }
  }
  return { host: s, username, port }
}

/** 显示用：IPv6 带端口时加方括号 */
export function formatHostPort(host: string, port: number) {
  if (!port || port === 22)
    return host
  return host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`
}

/* ---------------- 快捷命令变量 ---------------- */

export interface SnippetVar {
  name: string
  default: string
}

const VAR_RE = /\{\{([^{}:]+)(?::([^{}]*))?\}\}/g

/** 提取 {{变量}} 与 {{变量:默认值}}，同名只保留第一个 */
export function snippetVars(command: string): SnippetVar[] {
  const seen = new Map<string, SnippetVar>()
  for (const m of command.matchAll(VAR_RE)) {
    const name = m[1].trim()
    if (name && !seen.has(name))
      seen.set(name, { name, default: m[2] ?? '' })
  }
  return [...seen.values()]
}

export function fillSnippet(command: string, values: Record<string, string>) {
  return command.replace(VAR_RE, (_, name: string, def?: string) => values[name.trim()] ?? def ?? '')
}

/* ---------------- 远程路径 ---------------- */

export function joinPath(dir: string, name: string) {
  if (name.startsWith('/'))
    return normalizePath(name)
  return normalizePath(`${dir.replace(/\/+$/, '')}/${name}`)
}

export function normalizePath(p: string) {
  const parts: string[] = []
  for (const seg of p.split('/')) {
    if (!seg || seg === '.')
      continue
    if (seg === '..')
      parts.pop()
    else
      parts.push(seg)
  }
  return `/${parts.join('/')}`
}

export function parentPath(p: string) {
  const n = normalizePath(p)
  return n === '/' ? '/' : n.slice(0, n.lastIndexOf('/')) || '/'
}

export function baseName(p: string) {
  const n = normalizePath(p)
  return n === '/' ? '/' : n.slice(n.lastIndexOf('/') + 1)
}

/** 面包屑：/a/b => [{ name: '/', path: '/' }, { name: 'a', path: '/a' }, { name: 'b', path: '/a/b' }] */
export function breadcrumbs(p: string) {
  const out = [{ name: '/', path: '/' }]
  let acc = ''
  for (const seg of normalizePath(p).split('/').filter(Boolean)) {
    acc += `/${seg}`
    out.push({ name: seg, path: acc })
  }
  return out
}

/* ---------------- 权限 ---------------- */

/** 0o755 => 'rwxr-xr-x' */
export function modeToString(mode: number) {
  const chars = 'rwxrwxrwx'
  let s = ''
  for (let i = 0; i < 9; i++)
    s += mode & (1 << (8 - i)) ? chars[i] : '-'
  return s
}

/** '755' 或 '0755' => 0o755；格式不对返回 null */
export function parseOctalMode(text: string) {
  const t = text.trim()
  return /^0?[0-7]{3}$/.test(t) ? Number.parseInt(t, 8) : null
}

/* ---------------- 其他 ---------------- */

/** 用单引号包住，作为 Shell 参数安全传递 */
export function shellQuote(s: string) {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/** 解析 /etc/passwd 或 /etc/group：uid / gid => 名称 */
export function parseIdNames(text: string) {
  const map = new Map<number, string>()
  for (const line of text.split('\n')) {
    const v = line.split(':')
    if (v.length >= 3 && /^\d+$/.test(v[2]))
      map.set(Number(v[2]), v[0])
  }
  return map
}

/** 文件是否适合在线编辑：按扩展名与大小判断 */
export function isTextLike(name: string, size: number) {
  if (size > 2 * 1024 * 1024)
    return false
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
  const binary = /^(?:png|jpe?g|gif|webp|ico|bmp|zip|gz|tgz|bz2|xz|7z|rar|tar|jar|war|so|o|a|exe|dll|bin|iso|img|mp[34]|mkv|avi|mov|flac|wav|pdf|docx?|xlsx?|pptx?|woff2?|ttf|otf|class|pyc|db|sqlite)$/
  return !binary.test(ext)
}

/** 粗略判断字节是否为文本（含 NUL 视为二进制） */
export function looksBinary(bytes: Uint8Array) {
  const n = Math.min(bytes.length, 8000)
  for (let i = 0; i < n; i++) {
    if (bytes[i] === 0)
      return true
  }
  return false
}

export function newId() {
  return crypto.randomUUID()
}
