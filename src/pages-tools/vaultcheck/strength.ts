/**
 * 密码强度评估（轻量版，纯函数）。
 * Worker 端用它在服务器内评估，密码不需要发到前端；规则参考常见的熵估算并对常见模式降权。
 */

export type StrengthLevel = 0 | 1 | 2 | 3 | 4

export const LEVEL_LABEL = ['极弱', '弱', '一般', '强', '很强'] as const

export interface Strength {
  level: StrengthLevel
  /** 估算的有效熵（比特） */
  bits: number
  /** 中文原因，按严重程度排列 */
  reasons: string[]
}

/** 常见弱密码（含中文用户常用的数字组合），比较时忽略大小写 */
const COMMON = new Set([
  '123456',
  '123456789',
  '12345678',
  '1234567',
  '12345',
  '1234567890',
  '111111',
  '000000',
  '666666',
  '888888',
  '123123',
  '654321',
  '112233',
  '121212',
  '147258',
  '147258369',
  '159357',
  '5201314',
  '1314520',
  '520520',
  'woaini',
  'woaini1314',
  'iloveyou',
  'password',
  'passw0rd',
  'p@ssw0rd',
  'qwerty',
  'qwertyuiop',
  'qwe123',
  'qweasd',
  'qweasdzxc',
  'asdfgh',
  'asdfghjkl',
  'zxcvbnm',
  '1qaz2wsx',
  '1q2w3e4r',
  '1q2w3e',
  'q1w2e3r4',
  'abc123',
  'abcd1234',
  'a123456',
  'aa123456',
  'qq123456',
  'admin',
  'admin123',
  'administrator',
  'root',
  'toor',
  'letmein',
  'welcome',
  'monkey',
  'dragon',
  'master',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'shadow',
  'superman',
  'trustno1',
  'hello',
  'hello123',
  'test',
  'test123',
  'guest',
  'changeme',
  'default',
  'secret',
  'login',
  'user',
  'pass',
  'iloveu',
  'wang123',
  'zhang123',
  'li123456',
])

const KEYBOARD_ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'qazwsxedcrfvtgbyhnujmikolp']

/** 统计长度 ≥ 3 的连续序列（abc、321、qwe）与重复（aaa）所占的字符数 */
function patternChars(pw: string) {
  const s = pw.toLowerCase()
  let covered = 0
  let i = 0
  while (i < s.length) {
    let j = i + 1
    // 重复字符
    while (j < s.length && s[j] === s[i])
      j++
    if (j - i >= 3) {
      covered += j - i - 1
      i = j
      continue
    }
    // 递增 / 递减序列（字母或数字）
    j = i + 1
    const step = s.charCodeAt(i + 1) - s.charCodeAt(i)
    if (step === 1 || step === -1) {
      while (j < s.length && s.charCodeAt(j) - s.charCodeAt(j - 1) === step)
        j++
      if (j - i >= 3) {
        covered += j - i - 1
        i = j
        continue
      }
    }
    // 键盘连续按键
    let matched = 0
    for (const row of KEYBOARD_ROWS) {
      for (let len = Math.min(row.length, s.length - i); len >= 4; len--) {
        if (row.includes(s.slice(i, i + len)) || row.split('').reverse().join('').includes(s.slice(i, i + len))) {
          matched = Math.max(matched, len)
          break
        }
      }
    }
    if (matched) {
      covered += matched - 1
      i += matched
      continue
    }
    i++
  }
  return covered
}

/** 像日期（19900101、2023-05-01）或手机号 */
function looksPersonal(pw: string) {
  return /^(?:19|20)\d{2}[-/.]?(?:0[1-9]|1[0-2])[-/.]?(?:0[1-9]|[12]\d|3[01])$/.test(pw) || /^1[3-9]\d{9}$/.test(pw)
}

export function evaluatePassword(pw: string): Strength {
  if (!pw)
    return { level: 0, bits: 0, reasons: ['没有设置密码'] }
  const reasons: string[] = []
  const lower = pw.toLowerCase()
  // 常见密码，或常见密码后面加数字 / 符号（password123!）
  const core = lower.replace(/[\d!@#$%^&*._-]+$/, '')
  if (COMMON.has(lower) || (core.length >= 4 && COMMON.has(core)))
    return { level: 0, bits: 0, reasons: ['属于常见密码，很容易被猜中'] }
  if (looksPersonal(pw))
    return { level: 0, bits: 10, reasons: ['看起来是日期或手机号，容易被猜中'] }

  let pool = 0
  if (/[a-z]/.test(pw))
    pool += 26
  if (/[A-Z]/.test(pw))
    pool += 26
  if (/\d/.test(pw))
    pool += 10
  if (/[^a-z0-9]/i.test(pw))
    pool += /[^\x20-\x7E]/.test(pw) ? 100 : 33
  const chars = Array.from(pw).length
  const effective = Math.max(1, chars - patternChars(pw))
  // 重复使用同一字符集合（如 abab）也降权：按不同字符数封顶
  const distinct = new Set(pw).size
  const bits = Math.round(Math.min(effective, distinct * 2) * Math.log2(pool))

  if (chars < 8)
    reasons.push('长度不足 8 位')
  if (/^\d+$/.test(pw))
    reasons.push('只包含数字')
  else if (/^[a-z]+$/i.test(pw))
    reasons.push('只包含字母')
  if (effective < chars)
    reasons.push('包含连续或重复的字符')
  if (distinct <= chars / 3)
    reasons.push('重复字符过多')

  let level: StrengthLevel = bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4
  // 只用一类字符（纯小写、纯数字等）的短密码容易被字典攻击，即使看起来随机
  const singleClass = /^(?:[a-z]+|[A-Z]+|\d+)$/.test(pw)
  if (chars < 8)
    level = Math.min(level, 1) as StrengthLevel
  else if (singleClass)
    level = Math.min(level, chars < 12 ? 1 : 2) as StrengthLevel
  else if (chars < 12 && level > 3)
    level = 3
  return { level, bits, reasons }
}
