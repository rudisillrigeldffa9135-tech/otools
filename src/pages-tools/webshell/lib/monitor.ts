/**
 * 服务器监控：和 FinalShell 一样，定时在服务器上执行一段只读脚本，读取 /proc 等信息后在浏览器里计算。
 * 只支持 Linux；脚本只用 POSIX sh 与常见命令，缺少的命令会被跳过。
 */

/** 每次采样执行的脚本 */
export const SAMPLE_SCRIPT = [
  'export LC_ALL=C',
  'echo @@time; date +%s',
  'echo @@load; cat /proc/loadavg',
  'echo @@uptime; cat /proc/uptime',
  'echo @@stat; grep "^cpu" /proc/stat',
  'echo @@mem; cat /proc/meminfo',
  'echo @@net; cat /proc/net/dev',
  'echo @@disk; df -kP 2>/dev/null',
  'echo @@diskio; cat /proc/diskstats 2>/dev/null',
  'echo @@ps; (ps -eo pid,user,pcpu,pmem,rss,etime,comm --sort=-pcpu 2>/dev/null || ps -eo pid,user,pcpu,pmem,rss,etime,comm 2>/dev/null) | head -n 41',
].join('; ')

/** 连接后执行一次，获取系统基本信息 */
export const INFO_SCRIPT = [
  'export LC_ALL=C',
  'echo @@hostname; hostname 2>/dev/null || cat /etc/hostname',
  'echo @@kernel; uname -srm',
  'echo @@os; (. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME")',
  'echo @@cpu; grep -m1 "model name" /proc/cpuinfo 2>/dev/null | cut -d: -f2',
  'echo @@cores; nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo',
  'echo @@ip; hostname -I 2>/dev/null',
  'echo @@user; whoami',
].join('; ')

export function sections(text: string) {
  const out: Record<string, string[]> = {}
  let cur = ''
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '')
    const m = line.match(/^@@(\w+)$/)
    if (m) {
      cur = m[1]
      out[cur] = []
    }
    else if (cur && line.trim()) {
      out[cur].push(line)
    }
  }
  return out
}

export interface ServerInfo {
  hostname: string
  kernel: string
  os: string
  cpu: string
  cores: number
  ips: string[]
  user: string
}

export function parseInfo(text: string): ServerInfo {
  const s = sections(text)
  const first = (k: string) => (s[k]?.[0] ?? '').trim()
  return {
    hostname: first('hostname'),
    kernel: first('kernel'),
    os: first('os'),
    cpu: first('cpu').replace(/\s+/g, ' '),
    cores: Number(first('cores')) || 0,
    ips: first('ip').split(/\s+/).filter(Boolean),
    user: first('user'),
  }
}

export interface CpuTimes {
  total: number
  idle: number
}

export interface Disk {
  fs: string
  mount: string
  /** 字节 */
  total: number
  used: number
  avail: number
}

export interface Proc {
  pid: number
  user: string
  cpu: number
  mem: number
  /** 字节 */
  rss: number
  elapsed: string
  command: string
}

export interface Sample {
  /** 秒，优先使用服务器时间 */
  time: number
  load: [number, number, number]
  procs: { running: number, total: number }
  uptime: number
  /** cpu[0] 为总计，其后为各核心 */
  cpu: CpuTimes[]
  mem: { total: number, available: number, buffers: number, cached: number, swapTotal: number, swapFree: number }
  net: Record<string, { rx: number, tx: number }>
  disks: Disk[]
  diskio: Record<string, { read: number, write: number }>
  ps: Proc[]
}

const PSEUDO_FS = /^(?:tmpfs|devtmpfs|udev|none|shm|overlay|efivarfs|run|cgroup|proc|sysfs)$/
const WHOLE_DISK = /^(?:[shv]d[a-z]+|xvd[a-z]+|nvme\d+n\d+|mmcblk\d+|dm-\d+)$/

export function parseSample(text: string, now = Date.now() / 1000): Sample {
  const s = sections(text)
  const time = Number(s.time?.[0]) || now

  const la = (s.load?.[0] ?? '').split(/\s+/)
  const [running, total] = (la[3] ?? '0/0').split('/').map(Number)

  const cpu: CpuTimes[] = (s.stat ?? []).map((line) => {
    const v = line.trim().split(/\s+/).slice(1, 9).map(Number)
    const sum = v.reduce((a, b) => a + (b || 0), 0)
    return { total: sum, idle: (v[3] || 0) + (v[4] || 0) }
  })

  const kv: Record<string, number> = {}
  for (const line of s.mem ?? []) {
    const m = line.match(/^(\w+(?:\(\w+\))?):\s+(\d+)/)
    if (m)
      kv[m[1]] = Number(m[2]) * 1024
  }
  const mem = {
    total: kv.MemTotal ?? 0,
    available: kv.MemAvailable ?? ((kv.MemFree ?? 0) + (kv.Buffers ?? 0) + (kv.Cached ?? 0)),
    buffers: kv.Buffers ?? 0,
    cached: kv.Cached ?? 0,
    swapTotal: kv.SwapTotal ?? 0,
    swapFree: kv.SwapFree ?? 0,
  }

  const net: Sample['net'] = {}
  for (const line of s.net ?? []) {
    const idx = line.indexOf(':')
    const name = line.slice(0, Math.max(0, idx)).trim()
    if (idx < 0 || !name || name.includes('|'))
      continue
    const v = line.slice(idx + 1).trim().split(/\s+/).map(Number)
    if (v.length >= 9)
      net[name] = { rx: v[0], tx: v[8] }
  }

  const disks: Disk[] = []
  for (const line of (s.disk ?? []).slice(1)) {
    const v = line.trim().split(/\s+/)
    if (v.length < 6)
      continue
    const fs = v[0]
    const mount = v.slice(5).join(' ')
    if (PSEUDO_FS.test(fs) || mount.startsWith('/snap/') || mount.startsWith('/sys') || mount.startsWith('/proc') || mount.startsWith('/dev') || mount.startsWith('/run'))
      continue
    const totalKb = Number(v[1])
    if (!totalKb)
      continue
    disks.push({ fs, mount, total: totalKb * 1024, used: Number(v[2]) * 1024, avail: Number(v[3]) * 1024 })
  }

  const diskio: Sample['diskio'] = {}
  for (const line of s.diskio ?? []) {
    const v = line.trim().split(/\s+/)
    if (v.length >= 10 && WHOLE_DISK.test(v[2]))
      diskio[v[2]] = { read: Number(v[5]) * 512, write: Number(v[9]) * 512 }
  }

  const ps: Proc[] = []
  for (const line of (s.ps ?? []).slice(1)) {
    const v = line.trim().split(/\s+/)
    if (v.length < 7 || !/^\d+$/.test(v[0]))
      continue
    ps.push({ pid: Number(v[0]), user: v[1], cpu: Number(v[2]) || 0, mem: Number(v[3]) || 0, rss: (Number(v[4]) || 0) * 1024, elapsed: v[5], command: v.slice(6).join(' ') })
  }

  return {
    time,
    load: [Number(la[0]) || 0, Number(la[1]) || 0, Number(la[2]) || 0],
    procs: { running: running || 0, total: total || 0 },
    uptime: Number((s.uptime?.[0] ?? '').split(/\s+/)[0]) || 0,
    cpu,
    mem,
    net,
    disks,
    diskio,
    ps,
  }
}

export interface Stats {
  /** 0~100 */
  cpu: number
  cores: number[]
  memUsed: number
  memPct: number
  swapUsed: number
  swapPct: number
  /** 字节 / 秒，排除 lo */
  rx: number
  tx: number
  netByIface: Record<string, { rx: number, tx: number }>
  read: number
  write: number
}

function pct(busy: number, total: number) {
  return total > 0 ? Math.max(0, Math.min(100, (busy / total) * 100)) : 0
}

function rate(cur: number, prev: number | undefined, dt: number) {
  // 计数器重置（如重启网卡）时不显示负数
  return prev === undefined || cur < prev || dt <= 0 ? 0 : (cur - prev) / dt
}

/** 用相邻两次采样计算使用率与速率；没有上一次采样时，CPU 与速率为 0 */
export function computeStats(cur: Sample, prev?: Sample): Stats {
  const dt = prev ? cur.time - prev.time : 0
  const cpuOf = (i: number) => {
    const a = cur.cpu[i]
    const b = prev?.cpu[i]
    if (!a || !b)
      return 0
    const dTotal = a.total - b.total
    return pct(dTotal - (a.idle - b.idle), dTotal)
  }
  const netByIface: Stats['netByIface'] = {}
  let rx = 0
  let tx = 0
  for (const [name, v] of Object.entries(cur.net)) {
    const p = prev?.net[name]
    const r = { rx: rate(v.rx, p?.rx, dt), tx: rate(v.tx, p?.tx, dt) }
    netByIface[name] = r
    if (name !== 'lo') {
      rx += r.rx
      tx += r.tx
    }
  }
  let read = 0
  let write = 0
  for (const [name, v] of Object.entries(cur.diskio)) {
    const p = prev?.diskio[name]
    // dm-* 是逻辑卷，与物理盘重复计数，只在没有物理盘时计入
    if (name.startsWith('dm-') && Object.keys(cur.diskio).some(n => !n.startsWith('dm-')))
      continue
    read += rate(v.read, p?.read, dt)
    write += rate(v.write, p?.write, dt)
  }
  const memUsed = cur.mem.total - cur.mem.available
  const swapUsed = cur.mem.swapTotal - cur.mem.swapFree
  return {
    cpu: cpuOf(0),
    cores: cur.cpu.slice(1).map((_, i) => cpuOf(i + 1)),
    memUsed,
    memPct: pct(memUsed, cur.mem.total),
    swapUsed,
    swapPct: pct(swapUsed, cur.mem.swapTotal),
    rx,
    tx,
    netByIface,
    read,
    write,
  }
}

export function formatBytes(n: number, digits = 1) {
  if (!Number.isFinite(n) || n <= 0)
    return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  const v = n / 1024 ** i
  return `${i === 0 ? v : v.toFixed(v >= 100 ? 0 : digits)} ${units[i]}`
}

export function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d)
    return `${d} 天 ${h} 小时`
  if (h)
    return `${h} 小时 ${m} 分`
  return `${m} 分钟`
}
