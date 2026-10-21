import { countText, extractOutline, highlight, inlineStyles, langLabel, renderMarkdown } from './markdown'

describe('renderMarkdown', () => {
  it('顶层代码块单独成段', () => {
    const segs = renderMarkdown('# 标题\n\n段落\n\n```js\nconst a = 1\n// 注释\n```\n\n结尾')
    expect(segs.map(s => s.type)).toEqual(['html', 'code', 'html'])
    const code = segs[1]
    expect(code.type === 'code' && code.lineCount).toBe(2)
    expect(code.type === 'code' && code.label).toBe('JavaScript')
    expect(code.type === 'code' && code.code).toBe('const a = 1\n// 注释')
    expect(code.type === 'code' && code.html).toContain('<span style="color:#ff7b72">const</span>')
    expect(segs[0].type === 'html' && segs[0].html).toContain('<h1 data-line="0">标题</h1>')
  })

  it('嵌套在列表里的代码块直接渲染为 pre', () => {
    const segs = renderMarkdown('- 步骤\n\n  ```bash\n  ls -la\n  ```')
    expect(segs).toHaveLength(1)
    expect(segs[0].type === 'html' && segs[0].html).toContain('class="ot-md-pre"')
  })

  it('不渲染原始 HTML，拦截 javascript: 链接', () => {
    const html = (renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1))')[0] as any).html
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('href="javascript')
  })

  it('链接新窗口打开、自动识别网址', () => {
    const html = (renderMarkdown('访问 https://example.com')[0] as any).html
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">')
  })

  it('任务列表', () => {
    const html = (renderMarkdown('- [ ] 待办\n- [x] 完成')[0] as any).html
    expect(html).toContain('☐ 待办')
    expect(html).toContain('☑ 完成')
    expect(html).toContain('class="ot-task is-done"')
  })

  it('表格与删除线', () => {
    const html = (renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |\n\n~~删除~~')[0] as any).html
    expect(html).toContain('<table data-line="0">')
    expect(html).toContain('<s>删除</s>')
  })

  it('换行保留', () => {
    expect((renderMarkdown('第一行\n第二行')[0] as any).html).toContain('第一行<br>')
  })
})

describe('highlight', () => {
  it('未知语言按纯文本转义', () => {
    expect(highlight('<a> & b', 'unknown')).toBe('&lt;a&gt; &amp; b')
    expect(highlight('<a>', '')).toBe('&lt;a&gt;')
  })
  it('别名可用', () => {
    expect(highlight('x = 1', 'py')).toContain('style=')
    expect(highlight('<div></div>', 'html')).toContain('color:#7ee787')
  })
  it('语言名称', () => {
    expect(langLabel('ts')).toBe('TypeScript')
    expect(langLabel('')).toBe('代码')
    expect(langLabel('Elixir')).toBe('Elixir')
  })
})

describe('inlineStyles', () => {
  it('给标签加内联样式，pre 里的 code 不加', () => {
    const html = inlineStyles('<p>a <code>b</code></p><pre class="x"><code>c</code></pre><code>d</code>')
    expect(html).toMatch(/^<p style="[^"]+">a <code style="[^"]+">b<\/code><\/p><pre class="x"><code>c<\/code><\/pre><code style=/)
  })
})

describe('countText', () => {
  it('中英文字数', () => {
    expect(countText('你好 world, hello!\n第二行')).toEqual({ words: 7, chars: 20, lines: 2 })
    expect(countText('')).toEqual({ words: 0, chars: 0, lines: 0 })
  })
})

describe('extractOutline', () => {
  it('提取各级标题与行号，忽略代码块里的 #', () => {
    const src = ['# 标题一', '正文', '```sh', '# 注释不是标题', '```', '## 二级 **粗体** `code`', '', '设置型标题', '---', '### 三级'].join('\n')
    expect(extractOutline(src)).toEqual([
      { level: 1, text: '标题一', line: 0 },
      { level: 2, text: '二级 粗体 code', line: 5 },
      { level: 2, text: '设置型标题', line: 7 },
      { level: 3, text: '三级', line: 9 },
    ])
  })

  it('没有标题时为空', () => {
    expect(extractOutline('只有正文\n- 列表')).toEqual([])
  })
})

describe('源码行号', () => {
  it('顶层块带 data-line，代码块段落记录起始行', () => {
    const segs = renderMarkdown('# 标题\n\n段落\n\n```js\nx\n```\n\n- 列表')
    expect(segs[0].type === 'html' && segs[0].html).toContain('<h1 data-line="0">')
    expect(segs[0].type === 'html' && segs[0].html).toContain('<p data-line="2">')
    expect(segs[1]).toMatchObject({ type: 'code', line: 4 })
    expect(segs[2].type === 'html' && segs[2].html).toContain('<ul data-line="8">')
  })
})
