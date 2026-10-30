import { describe, expect, it } from 'vitest'
import { computeStats, formatBytes, formatUptime, parseInfo, parseSample } from './monitor'

function sample(t: number, cpu: string, cpu0: string, rx: number, tx: number, sectorsRead: number) {
  return `@@time
${t}
@@load
0.52 0.40 0.31 2/345 12345
@@uptime
356400.12 700000.00
@@stat
${cpu}
${cpu0}
@@mem
MemTotal:        2000000 kB
MemFree:          200000 kB
MemAvailable:     500000 kB
Buffers:           50000 kB
Cached:           400000 kB
SwapTotal:       1000000 kB
SwapFree:         750000 kB
@@net
Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 1000 10 0 0 0 0 0 0 1000 10 0 0 0 0 0 0
  eth0: ${rx} 100 0 0 0 0 0 0 ${tx} 90 0 0 0 0 0 0
@@disk
Filesystem     1024-blocks     Used Available Capacity Mounted on
/dev/vda1         41152736 20576368  18666956      53% /
tmpfs              1000000        0   1000000       0% /dev/shm
/dev/vdb1        103081248  1000000 102081248       1% /data disk
@@diskio
 253       0 vda 1000 0 ${sectorsRead} 500 2000 0 8000 900 0 1000 1400
 253       1 vda1 900 0 1800 400 1900 0 7800 800 0 900 1200
@@ps
    PID USER     %CPU %MEM   RSS     ELAPSED COMMAND
   1234 www-data 12.5  3.2 65536    01:02:03 nginx: worker process
      1 root      0.0  0.1  1024 10-01:00:00 systemd
`
}

describe('服务器监控解析', () => {
  const a = parseSample(sample(1000, 'cpu  100 0 100 700 100 0 0 0', 'cpu0 50 0 50 350 50 0 0 0', 10_000, 5_000, 2000))
  const b = parseSample(sample(1002, 'cpu  150 0 150 800 100 0 0 0', 'cpu0 100 0 50 400 50 0 0 0', 30_000, 9_000, 6000))

  it('解析各项', () => {
    expect(a.load).toEqual([0.52, 0.4, 0.31])
    expect(a.procs).toEqual({ running: 2, total: 345 })
    expect(a.uptime).toBeCloseTo(356400.12)
    expect(a.cpu).toHaveLength(2)
    expect(a.mem.total).toBe(2000000 * 1024)
    expect(a.mem.available).toBe(500000 * 1024)
    expect(Object.keys(a.net)).toEqual(['lo', 'eth0'])
    // 过滤 tmpfs，挂载点含空格
    expect(a.disks.map(d => d.mount)).toEqual(['/', '/data disk'])
    expect(a.disks[0].used).toBe(20576368 * 1024)
    // 只统计整盘，不统计分区
    expect(Object.keys(a.diskio)).toEqual(['vda'])
    expect(a.ps[0]).toMatchObject({ pid: 1234, user: 'www-data', cpu: 12.5, command: 'nginx: worker process', rss: 65536 * 1024 })
  })

  it('计算使用率与速率', () => {
    const s = computeStats(b, a)
    // 总计：总时间增加 200，空闲增加 100 => 50%
    expect(s.cpu).toBeCloseTo(50)
    // cpu0：总时间增加 100，空闲增加 50 => 50%
    expect(s.cores[0]).toBeCloseTo(50)
    expect(s.memPct).toBeCloseTo(75)
    expect(s.swapPct).toBeCloseTo(25)
    // 2 秒内收 20000、发 4000 字节，lo 不计入
    expect(s.rx).toBe(10_000)
    expect(s.tx).toBe(2_000)
    // 读 4000 扇区 * 512 / 2 秒
    expect(s.read).toBe(1_024_000)
  })

  it('没有上一次采样时速率为 0', () => {
    const s = computeStats(a)
    expect(s.cpu).toBe(0)
    expect(s.rx).toBe(0)
    expect(s.memPct).toBeCloseTo(75)
  })

  it('计数器回绕时不出现负数', () => {
    const s = computeStats(a, b)
    expect(s.rx).toBe(0)
  })

  it('系统信息', () => {
    const info = parseInfo(`@@hostname\nweb-01\n@@kernel\nLinux 5.15.0 x86_64\n@@os\nUbuntu 22.04.3 LTS\n@@cpu\n Intel(R) Xeon(R)   CPU\n@@cores\n4\n@@ip\n10.0.0.2 172.17.0.1 \n@@user\nroot\n`)
    expect(info).toEqual({ hostname: 'web-01', kernel: 'Linux 5.15.0 x86_64', os: 'Ubuntu 22.04.3 LTS', cpu: 'Intel(R) Xeon(R) CPU', cores: 4, ips: ['10.0.0.2', '172.17.0.1'], user: 'root' })
  })

  it('格式化', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB')
    expect(formatUptime(356400)).toBe('4 天 3 小时')
    expect(formatUptime(3700)).toBe('1 小时 1 分')
  })
})
