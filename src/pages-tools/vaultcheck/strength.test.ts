import { evaluatePassword } from './strength'

describe('evaluatePassword', () => {
  it.each([
    ['123456', 0],
    ['Password123!', 0],
    ['woaini1314', 0],
    ['19900101', 0],
    ['13800138000', 0],
    ['abc', 0],
    ['aaaaaaaaaaaa', 0],
    ['qwertyuiopasdf', 0],
    ['sunflower', 1],
    ['Tr0ub4dor&3', 3],
    ['correct horse battery staple', 4],
    ['xK9#mP2$vL7@nQ4!', 4],
  ])('%s → %d', (pw, level) => {
    expect(evaluatePassword(pw).level).toBe(level)
  })

  it('空密码', () => {
    expect(evaluatePassword('')).toEqual({ level: 0, bits: 0, reasons: ['没有设置密码'] })
  })

  it('给出原因', () => {
    expect(evaluatePassword('abcdefg').reasons).toEqual(expect.arrayContaining(['长度不足 8 位', '只包含字母', '包含连续或重复的字符']))
    expect(evaluatePassword('20240512').reasons[0]).toContain('日期')
  })

  it('随机生成的长密码至少为「强」', () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
    for (let n = 0; n < 50; n++) {
      const pw = Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
      expect(evaluatePassword(pw).level).toBeGreaterThanOrEqual(3)
    }
  })
})
