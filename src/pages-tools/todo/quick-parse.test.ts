import { cnToNumber, parseQuickAdd } from './quick-parse'

// 2026-10-26 是周一
const TODAY = '2026-10-26'
const p = (s: string, lists: string[] = []) => parseQuickAdd(s, TODAY, lists)

describe('parseQuickAdd', () => {
  it('提案里的例子', () => {
    const r = p('明天下午3点 交周报 !高 #工作', ['工作', '生活'])
    expect(r).toMatchObject({ title: '交周报', dueDate: '2026-10-27', dueTime: '15:00', priority: 3, listName: '工作', tags: [] })
  })

  it('没有同名清单时 # 作为标签', () => {
    expect(p('买牛奶 #超市 #周末')).toMatchObject({ title: '买牛奶', listName: null, tags: ['超市', '周末'] })
  })

  it('相对日期', () => {
    expect(p('今天 交电费').dueDate).toBe('2026-10-26')
    expect(p('后天交电费').dueDate).toBe('2026-10-28')
    expect(p('大后天交电费').dueDate).toBe('2026-10-29')
    expect(p('3天后复查').dueDate).toBe('2026-10-29')
    expect(p('十天后复查').dueDate).toBe('2026-11-05')
  })

  it('星期', () => {
    expect(p('周五 发版').dueDate).toBe('2026-10-30')
    expect(p('下周一 例会').dueDate).toBe('2026-11-02')
    // 今天周一，「周一」指今天
    expect(p('周一 例会').dueDate).toBe('2026-10-26')
    expect(p('星期天 爬山').dueDate).toBe('2026-11-01')
    expect(p('周末 大扫除').dueDate).toBe('2026-10-31')
  })

  it('具体日期，已过去的算明年', () => {
    expect(p('11月11日 抢购').dueDate).toBe('2026-11-11')
    expect(p('3月1日 交税').dueDate).toBe('2027-03-01')
    expect(p('2027-01-05 续费').dueDate).toBe('2027-01-05')
    expect(p('12/25 圣诞礼物').dueDate).toBe('2026-12-25')
    expect(p('下个月5号 还款').dueDate).toBe('2026-11-05')
    expect(p('30号 交房租').dueDate).toBe('2026-10-30')
    expect(p('十二月三十一日 总结').dueDate).toBe('2026-12-31')
  })

  it('时间', () => {
    expect(p('开会15:30').dueTime).toBe('15:30')
    expect(p('开会15:30').title).toBe('开会')
    expect(p('明天上午9点半 体检')).toMatchObject({ dueDate: '2026-10-27', dueTime: '09:30', title: '体检' })
    expect(p('晚上8点 跑步').dueTime).toBe('20:00')
    expect(p('今晚 跑步')).toMatchObject({ dueDate: '2026-10-26', dueTime: '20:00' })
    expect(p('今晚9点 跑步').dueTime).toBe('21:00')
    expect(p('中午12点 吃饭').dueTime).toBe('12:00')
    expect(p('下午三点二十分 面试').dueTime).toBe('15:20')
    // 不写上午下午时 1~6 点按下午
    expect(p('3点 开会').dueTime).toBe('15:00')
    expect(p('10点 开会').dueTime).toBe('10:00')
  })

  it('只写时间时日期为今天', () => {
    expect(p('5点 取快递')).toMatchObject({ dueDate: TODAY, dueTime: '17:00' })
  })

  it('不把普通词语当成时间', () => {
    expect(p('走快一点')).toMatchObject({ dueTime: null, title: '走快一点' })
    expect(p('复习重点 下午3点')).toMatchObject({ dueTime: '15:00', title: '复习重点' })
    expect(p('读书 第3章').dueDate).toBeNull()
  })

  it('优先级', () => {
    expect(p('写方案 !中').priority).toBe(2)
    expect(p('写方案 !低').priority).toBe(1)
    expect(p('写方案 !3').priority).toBe(3)
    expect(p('写方案 !!').priority).toBe(2)
    expect(p('写方案 ！高').priority).toBe(3)
    expect(p('写方案').priority).toBeNull()
  })

  it('重复', () => {
    expect(p('每天 背单词')).toMatchObject({ title: '背单词', repeat: { freq: 'day', interval: 1 } })
    expect(p('每3天 浇花').repeat).toEqual({ freq: 'day', interval: 3 })
    expect(p('每个工作日 打卡').repeat).toEqual({ freq: 'workday' })
    expect(p('每周一、三 健身')).toMatchObject({ title: '健身', repeat: { freq: 'week', weekdays: [1, 3] }, dueDate: '2026-10-26' })
    expect(p('每周 周报').repeat).toEqual({ freq: 'week', interval: 1 })
    expect(p('每月15号 还信用卡')).toMatchObject({ repeat: { freq: 'month', monthDay: 15 }, dueDate: '2026-11-15' })
    expect(p('每月最后一天 对账')).toMatchObject({ repeat: { freq: 'month', monthDay: -1 }, dueDate: '2026-10-31' })
    expect(p('每年 续保').repeat).toEqual({ freq: 'year', interval: 1 })
  })

  it('什么都没有时整句作为标题', () => {
    expect(p('  整理桌面  ')).toMatchObject({ title: '整理桌面', dueDate: null, dueTime: null, priority: null, repeat: null, tokens: [] })
  })
})

describe('cnToNumber', () => {
  it.each([['十', 10], ['十二', 12], ['二十', 20], ['二十三', 23], ['两', 2], ['7', 7]])('%s → %d', (s, n) => {
    expect(cnToNumber(s)).toBe(n)
  })
})
