import { convertDialect, detectDialect, nextRuns, parseCron, presetFor } from './cron'

/** 本地时间，便于断言 */
function fmt(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

const FROM = new Date(2026, 9, 11, 10, 15, 30) // 2026-10-11 周日 10:15:30

function runs(expr: string, dialect: Parameters<typeof parseCron>[1], n = 3, from = FROM) {
  return nextRuns(parseCron(expr, dialect), n, from).map(fmt)
}

describe('detectDialect', () => {
  it.each([
    ['*/5 * * * *', 'linux'],
    ['@daily', 'linux'],
    ['0 0 12 * * ?', 'quartz'],
    ['0 0 12 * * MON-FRI', 'spring'],
    ['0 0 12 ? * 2 2026', 'quartz'],
  ])('%s → %s', (expr, d) => {
    expect(detectDialect(expr)).toBe(d)
  })
})

describe('nextRuns', () => {
  it('每 5 分钟', () => {
    expect(runs('*/5 * * * *', 'linux')).toEqual(['2026-10-11 10:20:00', '2026-10-11 10:25:00', '2026-10-11 10:30:00'])
  })

  it('工作日 9 点（跳过周末）', () => {
    expect(runs('0 9 * * 1-5', 'linux', 2)).toEqual(['2026-10-12 09:00:00', '2026-10-13 09:00:00'])
  })

  it('linux 中日与周同时限定时取并集', () => {
    // 每月 13 号或周五
    expect(runs('0 0 13 * 5', 'linux', 3)).toEqual(['2026-10-13 00:00:00', '2026-10-16 00:00:00', '2026-10-23 00:00:00'])
  })

  it('linux 周 7 等同周日', () => {
    expect(runs('0 8 * * 7', 'linux', 1)).toEqual(['2026-10-18 08:00:00'])
  })

  it('spring 秒级与名称', () => {
    expect(runs('*/20 * * * * *', 'spring')).toEqual(['2026-10-11 10:15:40', '2026-10-11 10:16:00', '2026-10-11 10:16:20'])
    expect(runs('0 30 9 * * MON-FRI', 'spring', 1)).toEqual(['2026-10-12 09:30:00'])
  })

  it('quartz 周 1=周日、L、#、W', () => {
    expect(runs('0 0 8 ? * 1', 'quartz', 1)).toEqual(['2026-10-18 08:00:00'])
    expect(runs('0 0 0 L * ?', 'quartz', 2)).toEqual(['2026-10-31 00:00:00', '2026-11-30 00:00:00'])
    // 每月第 2 个周一（quartz 中 2=周一）
    expect(runs('0 0 10 ? * 2#2', 'quartz', 2)).toEqual(['2026-10-12 10:00:00', '2026-11-09 10:00:00'])
    // 每月最后一个周五（6=周五）
    expect(runs('0 0 18 ? * 6L', 'quartz', 1)).toEqual(['2026-10-30 18:00:00'])
    // 2026-11-01 是周日，离它最近且不跨月的工作日是 11-02
    expect(runs('0 0 9 1W * ?', 'quartz', 1)).toEqual(['2026-11-02 09:00:00'])
    // 2027-08-15 是周日 → 周一 16 号
    expect(runs('0 0 9 15W 8 ? 2027', 'quartz', 1)).toEqual(['2027-08-16 09:00:00'])
  })

  it('quartz 年份字段', () => {
    expect(runs('0 0 0 1 1 ? 2028', 'quartz', 2)).toEqual(['2028-01-01 00:00:00'])
  })

  it('2 月 29 日只在闰年', () => {
    expect(runs('0 0 29 2 *', 'linux', 2)).toEqual(['2028-02-29 00:00:00', '2032-02-29 00:00:00'])
  })

  it('永远不会执行的日期返回空', () => {
    expect(runs('0 0 30 2 *', 'linux', 1)).toEqual([])
  })

  it('跨越边界的区间', () => {
    expect(runs('0 22-1 * * *', 'linux', 4)).toEqual(['2026-10-11 22:00:00', '2026-10-11 23:00:00', '2026-10-12 00:00:00', '2026-10-12 01:00:00'])
  })

  it('宏', () => {
    expect(runs('@monthly', 'linux', 1)).toEqual(['2026-11-01 00:00:00'])
    expect(runs('@weekly', 'quartz', 1)).toEqual(['2026-10-18 00:00:00'])
  })
})

describe('parseCron 错误', () => {
  it.each([
    ['* * * *', 'linux', '需要 5 个字段'],
    ['60 * * * *', 'linux', '超出范围'],
    ['*/0 * * * *', 'linux', '步长'],
    ['0 0 L * *', 'linux', '不支持'],
    ['0 0 12 * * *', 'quartz', '有且只有一个'],
    ['0 0 12 ? * ?', 'quartz', '有且只有一个'],
    ['0 0 * * FOO', 'linux', '无法识别'],
    ['@reboot', 'linux', '开机'],
  ] as const)('%s', (expr, dialect, msg) => {
    expect(() => parseCron(expr, dialect)).toThrow(msg)
  })
})

describe('description', () => {
  it.each([
    ['30 8 * * *', 'linux', '每天，08:30 执行'],
    ['0 9,18 * * 1-5', 'linux', '每周一 至 周五，09:00、18:00 执行'],
    ['*/5 * * * *', 'linux', '每天，每 5 分钟 执行'],
    ['0 * * * *', 'linux', '每天，每小时整点 执行'],
    ['0 0 1 * *', 'linux', '每月 1 号，00:00 执行'],
    ['0 0 0 L * ?', 'quartz', '每月最后一天，00:00 执行'],
    ['0 0 10 ? * 2#2', 'quartz', '每月第 2 个周一，10:00 执行'],
    ['0 */10 9-17 * * *', 'spring', '每天，9 点 至 17 点，每 10 分钟 执行'],
  ] as const)('%s', (expr, dialect, text) => {
    expect(parseCron(expr, dialect).description).toBe(text)
  })
})

describe('presetFor', () => {
  it('转换到各方言', () => {
    expect(presetFor('0 9 * * 1-5', 'spring')).toBe('0 0 9 * * 1-5')
    expect(presetFor('0 9 * * 1-5', 'quartz')).toBe('0 0 9 ? * 2-6')
    expect(presetFor('0 0 1 * *', 'quartz')).toBe('0 0 0 1 * ?')
  })
  it('转换结果都能解析', () => {
    for (const d of ['spring', 'quartz'] as const)
      expect(() => parseCron(presetFor('0,30 9-18 * * *', d), d)).not.toThrow()
  })
})

describe('convertDialect', () => {
  it.each([
    ['0 9 * * 1-5', 'linux', 'quartz', '0 0 9 ? * 2-6'],
    ['0 9 * * 0,6', 'linux', 'quartz', '0 0 9 ? * 1,7'],
    ['0 9 * * 7', 'linux', 'quartz', '0 0 9 ? * 1'],
    ['*/10 0 9 ? * 2#2', 'quartz', 'spring', '*/10 0 9 * * 1#2'],
    ['0 0 9 ? * 2-6/2', 'quartz', 'linux', '0 9 * * 1-5/2'],
    ['30 15 8 1 * ?', 'quartz', 'linux', '15 8 1 * *'],
    ['0 0 9 * * MON-FRI', 'spring', 'quartz', '0 0 9 ? * MON-FRI'],
    ['0 9 1 * *', 'linux', 'spring', '0 0 9 1 * *'],
  ] as const)('%s（%s → %s）', (expr, from, to, expected) => {
    const out = convertDialect(expr, from, to)
    expect(out).toBe(expected)
    expect(() => parseCron(out, to)).not.toThrow()
  })

  it('转换前后执行时间一致', () => {
    const linux = '0 9 * * 1-5'
    const a = nextRuns(parseCron(linux, 'linux'), 5, FROM).map(fmt)
    const b = nextRuns(parseCron(convertDialect(linux, 'linux', 'quartz'), 'quartz'), 5, FROM).map(fmt)
    expect(b).toEqual(a)
  })
})
