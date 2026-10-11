// @vitest-environment node
import { parseTarget } from './shortlink'

const SELF = 'otools.example.workers.dev'

describe('parseTarget 短链目标校验', () => {
  it('保留完整的 http(s) 链接', () => {
    expect(parseTarget('https://example.com/a?b=1#c', SELF)).toBe('https://example.com/a?b=1#c')
    expect(parseTarget('http://example.com', SELF)).toBe('http://example.com/')
  })

  it('没写协议时补 https://，并去掉首尾空白', () => {
    expect(parseTarget('  example.com/path ', SELF)).toBe('https://example.com/path')
  })

  it('拒绝非 http(s) 协议', () => {
    expect(() => parseTarget('javascript://alert(1)', SELF)).toThrow(/http/)
    expect(() => parseTarget('ftp://example.com', SELF)).toThrow(/http/)
  })

  it('拒绝不像网址的输入', () => {
    expect(() => parseTarget('hello', SELF)).toThrow(/格式/)
    expect(() => parseTarget('', SELF)).toThrow(/不能为空/)
  })

  it('不能指向本站短链，但本站其他页面可以', () => {
    expect(() => parseTarget(`https://${SELF}/s/abc`, SELF)).toThrow(/本站/)
    expect(parseTarget(`https://${SELF}/#/pages/index/index`, SELF)).toBe(`https://${SELF}/#/pages/index/index`)
  })
})
