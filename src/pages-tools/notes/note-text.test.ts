import { derivePreview, deriveTitle } from './note-text'

describe('deriveTitle', () => {
  it.each([
    ['# 周会记录\n\n内容', '周会记录'],
    ['\n\n  ## **重点** 事项', '重点 事项'],
    ['- [x] 买牛奶\n- [ ] 交房租', '买牛奶'],
    ['> 引用的话', '引用的话'],
    ['```js\nconsole.log(1)\n```', 'console.log(1)'],
    ['[OTools](https://example.com) 链接', 'OTools 链接'],
    ['', ''],
  ])('%j → %s', (content, title) => {
    expect(deriveTitle(content)).toBe(title)
  })

  it('过长时截断', () => {
    expect(deriveTitle('a'.repeat(100))).toBe(`${'a'.repeat(60)}…`)
  })
})

describe('derivePreview', () => {
  it('跳过标题行并去掉 Markdown 符号', () => {
    expect(derivePreview('# 标题\n\n第一段 **加粗**\n\n```js\nlet a = 1\n```\n- 列表')).toBe('第一段 加粗 [代码] 列表')
  })
  it('空内容', () => {
    expect(derivePreview('')).toBe('')
  })
})

describe('derivePreview 细节', () => {
  it('去掉任务标记与表格分隔行，保留下划线', () => {
    expect(derivePreview('# 标题\n- [x] 建 D1\n- [ ] 配 VAULT_KEY\n\n| 环境 | 地址 |\n| --- | --- |\n| 生产 | a-b |')).toBe('建 D1 配 VAULT_KEY 环境 地址 生产 a-b')
  })
})
