// @vitest-environment node
import type { Env } from './lib'
import { contentDisposition, sanitizeName, signDownload, verifyDownload } from './files'

const env = { VAULT_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))) } as Env

describe('sanitizeName', () => {
  it.each([
    ['report.pdf', 'report.pdf'],
    ['C:\\Users\\a\\合同 v2.docx', '合同 v2.docx'],
    ['../../etc/passwd', 'passwd'],
    ['a\u0000b\u001Fc.txt', 'abc.txt'],
    ['', 'file'],
    ['..', 'file'],
  ])('%j → %s', (raw, name) => {
    expect(sanitizeName(raw)).toBe(name)
  })

  it('过长时保留扩展名', () => {
    const name = sanitizeName(`${'很长'.repeat(150)}.tar.gz`)
    expect(name.length).toBe(200)
    expect(name.endsWith('.gz')).toBe(true)
  })
})

describe('contentDisposition', () => {
  it('中文文件名使用 UTF-8 编码，并提供 ASCII 兜底', () => {
    expect(contentDisposition('季度报表 "终版".xlsx')).toBe(
      'attachment; filename="____ ____.xlsx"; filename*=UTF-8\'\'%E5%AD%A3%E5%BA%A6%E6%8A%A5%E8%A1%A8%20%22%E7%BB%88%E7%89%88%22.xlsx',
    )
  })
})

describe('下载签名', () => {
  it('签名可以验证，并带上是否为本人', async () => {
    const t = 1_800_000_000
    const token = await signDownload(env, 'ABC23K', true, t)
    expect(await verifyDownload(env, 'ABC23K', token, t + 60)).toEqual({ owner: true })
    const other = await signDownload(env, 'ABC23K', false, t)
    expect(await verifyDownload(env, 'ABC23K', other, t)).toEqual({ owner: false })
  })

  it('过期、换取件码、篡改身份都会失败', async () => {
    const t = 1_800_000_000
    const token = await signDownload(env, 'ABC23K', false, t)
    expect(await verifyDownload(env, 'ABC23K', token, t + 601)).toBeNull()
    expect(await verifyDownload(env, 'XYZ23K', token, t)).toBeNull()
    expect(await verifyDownload(env, 'ABC23K', token.replace('.0.', '.1.'), t)).toBeNull()
    expect(await verifyDownload(env, 'ABC23K', 'garbage', t)).toBeNull()
  })
})
