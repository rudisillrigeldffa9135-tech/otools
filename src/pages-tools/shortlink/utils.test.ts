import { expiresAtOf, linkStatus, matchLink, validateCode, validateTarget } from './utils'

const NOW = 1_800_000_000
const DAY = 86400

describe('expiresAtOf', () => {
  it('天数换算为时间戳，0 为永久，keep 为不修改', () => {
    expect(expiresAtOf(0, NOW)).toBe(0)
    expect(expiresAtOf(7, NOW)).toBe(NOW + 7 * DAY)
    expect(expiresAtOf('keep', NOW)).toBeUndefined()
  })
})

describe('linkStatus', () => {
  it('停用优先于过期', () => {
    expect(linkStatus({ disabled: true, expiresAt: NOW - 1 }, NOW).status).toBe('disabled')
  })

  it('过期、即将过期与有效', () => {
    expect(linkStatus({ disabled: false, expiresAt: NOW }, NOW).status).toBe('expired')
    expect(linkStatus({ disabled: false, expiresAt: NOW + 2 * DAY + 5 }, NOW)).toEqual({ status: 'expiring', text: '2 天后过期' })
    expect(linkStatus({ disabled: false, expiresAt: NOW + 5 * 3600 }, NOW).text).toBe('5 小时后过期')
    expect(linkStatus({ disabled: false, expiresAt: NOW + 30 }, NOW).text).toBe('1 分钟后过期')
    expect(linkStatus({ disabled: false, expiresAt: NOW + 10 * DAY }, NOW).status).toBe('active')
    expect(linkStatus({ disabled: false, expiresAt: 0 }, NOW).status).toBe('active')
  })
})

describe('validateCode', () => {
  it('留空合法，格式错误给出提示', () => {
    expect(validateCode('')).toBe('')
    expect(validateCode('my-link_1')).toBe('')
    expect(validateCode('ab')).not.toBe('')
    expect(validateCode('中文')).not.toBe('')
    expect(validateCode('a/b')).not.toBe('')
  })
})

describe('validateTarget', () => {
  it('接受带或不带协议的网址', () => {
    expect(validateTarget('https://example.com/a')).toBe('')
    expect(validateTarget('example.com')).toBe('')
    expect(validateTarget('localhost:3000')).toBe('')
  })

  it('拒绝空值、非 http 协议与不像网址的输入', () => {
    expect(validateTarget(' ')).toMatch(/请输入/)
    expect(validateTarget('ftp://example.com')).toMatch(/http/)
    expect(validateTarget('hello')).toMatch(/格式/)
  })
})

describe('matchLink', () => {
  it('匹配短码、目标、备注与创建者', () => {
    const link = { code: 'Abc123', url: 'https://example.com/promo', title: '双十一活动', owner: 'alice' }
    expect(matchLink(link, 'abc')).toBe(true)
    expect(matchLink(link, 'promo')).toBe(true)
    expect(matchLink(link, '活动')).toBe(true)
    expect(matchLink(link, 'ALICE')).toBe(true)
    expect(matchLink(link, 'zzz')).toBe(false)
  })
})
