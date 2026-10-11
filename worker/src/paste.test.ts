// @vitest-environment node
import { CODE_CHARS, CODE_LENGTH, normalizeCode, randomPasteCode } from './paste'

describe('文本快传取件码', () => {
  it('随机取件码长度固定，且只包含不易混淆的字符', () => {
    for (let i = 0; i < 200; i++) {
      const code = randomPasteCode()
      expect(code).toHaveLength(CODE_LENGTH)
      expect([...code].every(c => CODE_CHARS.includes(c))).toBe(true)
    }
    expect(CODE_CHARS).not.toMatch(/[01IO]/)
  })

  it('输入时忽略大小写与空格', () => {
    expect(normalizeCode(' abc 23k ')).toBe('ABC23K')
  })

  it('拒绝长度不对或含易混淆字符的取件码', () => {
    expect(() => normalizeCode('ABC')).toThrow(/取件码/)
    expect(() => normalizeCode('ABCDE0')).toThrow(/取件码/)
    expect(() => normalizeCode('ABCDEFG')).toThrow(/取件码/)
  })
})
