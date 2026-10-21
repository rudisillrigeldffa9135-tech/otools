/**
 * Markdown 渲染：markdown-it + highlight.js（按需注册常用语言）。
 * - 顶层代码块单独拆成 CodeSegment，由页面渲染行号与「复制」按钮
 * - 高亮颜色写成内联样式：小程序 rich-text 里外部 class 样式不可靠
 * - 不允许原始 HTML（html: false），链接只允许 http(s) / mailto 等安全协议（markdown-it 默认校验）
 */
import type Token from 'markdown-it/lib/token.mjs'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import markdown from 'highlight.js/lib/languages/markdown'
import nginx from 'highlight.js/lib/languages/nginx'
import php from 'highlight.js/lib/languages/php'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import scss from 'highlight.js/lib/languages/scss'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import MarkdownIt from 'markdown-it'

const LANGUAGES = { bash, c, cpp, csharp, css, diff, dockerfile, go, ini, java, javascript, json, kotlin, markdown, nginx, php, python, rust, scss, shell, sql, typescript, xml, yaml }
for (const [name, lang] of Object.entries(LANGUAGES))
  hljs.registerLanguage(name, lang)

/** 代码块标题栏显示的语言名 */
const LANG_LABEL: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  py: 'Python',
  python: 'Python',
  sh: 'Shell',
  bash: 'Bash',
  shell: 'Shell',
  zsh: 'Shell',
  html: 'HTML',
  xml: 'XML',
  vue: 'Vue',
  json: 'JSON',
  yml: 'YAML',
  yaml: 'YAML',
  sql: 'SQL',
  css: 'CSS',
  scss: 'SCSS',
  java: 'Java',
  go: 'Go',
  rust: 'Rust',
  rs: 'Rust',
  c: 'C',
  cpp: 'C++',
  cs: 'C#',
  csharp: 'C#',
  kotlin: 'Kotlin',
  kt: 'Kotlin',
  php: 'PHP',
  diff: 'Diff',
  dockerfile: 'Dockerfile',
  docker: 'Dockerfile',
  nginx: 'Nginx',
  ini: 'INI',
  toml: 'TOML',
  md: 'Markdown',
  markdown: 'Markdown',
}

/** GitHub Dark 配色；代码块统一使用深色背景，浅色 / 深色主题下都清晰 */
const TOKEN_STYLE: Record<string, string> = {
  'keyword': 'color:#ff7b72',
  'operator': 'color:#ff7b72',
  'doctag': 'color:#ff7b72',
  'variable.language': 'color:#ff7b72',
  'built_in': 'color:#ffa657',
  'type': 'color:#ffa657',
  'title.class': 'color:#ffa657',
  'title.class.inherited': 'color:#ffa657',
  'variable': 'color:#ffa657',
  'template-variable': 'color:#ffa657',
  'literal': 'color:#79c0ff',
  'number': 'color:#79c0ff',
  'attr': 'color:#79c0ff',
  'attribute': 'color:#79c0ff',
  'property': 'color:#79c0ff',
  'symbol': 'color:#79c0ff',
  'meta': 'color:#79c0ff',
  'selector-id': 'color:#79c0ff',
  'selector-attr': 'color:#79c0ff',
  'selector-pseudo': 'color:#79c0ff',
  'char.escape': 'color:#79c0ff',
  'variable.constant': 'color:#79c0ff',
  'string': 'color:#a5d6ff',
  'regexp': 'color:#a5d6ff',
  'meta.string': 'color:#a5d6ff',
  'comment': 'color:#8b949e;font-style:italic',
  'title': 'color:#d2a8ff',
  'title.function': 'color:#d2a8ff',
  'selector-class': 'color:#d2a8ff',
  'tag': 'color:#7ee787',
  'name': 'color:#7ee787',
  'selector-tag': 'color:#7ee787',
  'quote': 'color:#7ee787',
  'bullet': 'color:#f2cc60',
  'section': 'color:#79c0ff;font-weight:bold',
  'addition': 'color:#aff5b4;background:rgba(46,160,67,0.18)',
  'deletion': 'color:#ffdcd7;background:rgba(248,81,73,0.18)',
  'emphasis': 'font-style:italic',
  'strong': 'font-weight:bold',
  'link': 'text-decoration:underline',
}

/** hljs-title function_ → title.function；找不到时退回第一段 */
function styleOf(className: string) {
  const parts = className.split(/\s+/).map(c => c.replace(/^hljs-/, '').replace(/_+$/, ''))
  const full = parts.join('.')
  return TOKEN_STYLE[full] ?? TOKEN_STYLE[parts[0]] ?? ''
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 返回已转义、带内联样式的高亮 HTML；不认识的语言按纯文本处理 */
export function highlight(code: string, lang: string) {
  const name = lang.toLowerCase()
  if (!name || !hljs.getLanguage(name))
    return escapeHtml(code)
  try {
    const html = hljs.highlight(code, { language: name, ignoreIllegals: true }).value
    return html.replace(/<span class="([^"]+)">/g, (_, cls: string) => {
      const style = styleOf(cls)
      return style ? `<span style="${style}">` : '<span>'
    })
  }
  catch {
    return escapeHtml(code)
  }
}

export function langLabel(lang: string) {
  const name = lang.toLowerCase()
  return LANG_LABEL[name] ?? (name ? lang : '代码')
}

const CODE_FONT = 'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:20px'
const PRE_STYLE = `margin:0;padding:0;white-space:pre;color:#e6edf3;background:transparent;${CODE_FONT}`

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  // 嵌套在列表、引用里的代码块走这里（没有行号）
  highlight: (code, lang) => `<pre class="ot-md-pre" style="${PRE_STYLE};padding:12px;border-radius:8px;background:#0d1117;overflow-x:auto"><code>${highlight(code, lang.split(/\s+/)[0] || '')}</code></pre>`,
})

// 链接在新窗口打开
const defaultLinkOpen = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank')
  tokens[idx].attrSet('rel', 'noopener noreferrer')
  return defaultLinkOpen(tokens, idx, options, env, self)
}

// 任务列表：- [ ] 待办 / - [x] 已完成
md.core.ruler.after('inline', 'ot-task-list', (state) => {
  const tokens = state.tokens
  for (let i = 2; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.type !== 'inline' || tokens[i - 1].type !== 'paragraph_open' || tokens[i - 2].type !== 'list_item_open')
      continue
    const first = t.children?.[0]
    const m = first?.type === 'text' ? first.content.match(/^\[([ x])\]\s+/i) : null
    if (first && m) {
      first.content = `${m[1] === ' ' ? '☐' : '☑'} ${first.content.slice(m[0].length)}`
      tokens[i - 2].attrJoin('class', m[1] === ' ' ? 'ot-task' : 'ot-task is-done')
    }
  }
})

// 顶层块级元素带上源码行号（data-line），用于分栏滚动同步与大纲跳转
md.core.ruler.push('ot-source-line', (state) => {
  for (const t of state.tokens) {
    if (t.level === 0 && t.nesting === 1 && t.map)
      t.attrSet('data-line', String(t.map[0]))
    else if (t.level === 0 && t.type === 'hr' && t.map)
      t.attrSet('data-line', String(t.map[0]))
  }
})

export interface HtmlSegment {
  type: 'html'
  html: string
}

export interface CodeSegment {
  type: 'code'
  lang: string
  label: string
  code: string
  /** 带内联样式的 <pre> */
  html: string
  lineCount: number
  /** 代码块在源码中的起始行（从 0 开始） */
  line: number
}

export type Segment = HtmlSegment | CodeSegment

/** 小程序 rich-text 不吃外部样式，给常见标签补上内联样式（H5 用 CSS，不需要） */
const INLINE_STYLE: Record<string, string> = {
  h1: 'font-size:22px;font-weight:700;margin:16px 0 10px;line-height:1.35',
  h2: 'font-size:19px;font-weight:700;margin:14px 0 8px;line-height:1.35',
  h3: 'font-size:17px;font-weight:600;margin:12px 0 6px',
  h4: 'font-size:15px;font-weight:600;margin:10px 0 6px',
  h5: 'font-size:14px;font-weight:600;margin:8px 0 4px',
  h6: 'font-size:13px;font-weight:600;margin:8px 0 4px;color:#6b7280',
  p: 'margin:8px 0;line-height:1.75',
  ul: 'margin:8px 0;padding-left:22px',
  ol: 'margin:8px 0;padding-left:22px',
  li: 'margin:4px 0;line-height:1.7',
  blockquote: 'margin:10px 0;padding:6px 12px;border-left:4px solid #d1d5db;color:#6b7280;background:#f9fafb',
  code: 'padding:1px 5px;border-radius:4px;background:#f3f4f6;color:#c7254e;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:0.9em',
  a: 'color:#4f6ef7;text-decoration:underline',
  table: 'border-collapse:collapse;margin:10px 0;font-size:13px',
  th: 'border:1px solid #e5e7eb;padding:6px 10px;background:#f9fafb;font-weight:600',
  td: 'border:1px solid #e5e7eb;padding:6px 10px',
  hr: 'border:none;border-top:1px solid #e5e7eb;margin:16px 0',
  img: 'max-width:100%',
}

export function inlineStyles(html: string) {
  // <pre> 里的 <code> 不加行内代码样式
  return html.replace(/<(h[1-6]|p|ul|ol|li|blockquote|code|a|table|th|td|hr|img)(\s[^>]*)?>/g, (m, tag: string, attrs: string | undefined, offset: number) => {
    attrs = attrs ?? ''
    if (tag === 'code' && html.lastIndexOf('<pre', offset) > html.lastIndexOf('</pre>', offset))
      return m
    if (/\sstyle="/.test(attrs))
      return m
    return `<${tag}${attrs} style="${INLINE_STYLE[tag]}">`
  })
}

/**
 * 把 Markdown 拆成若干段：普通内容渲染成 HTML，顶层代码块单独成段
 * @param inline 是否给普通内容补内联样式（小程序）
 */
export function renderMarkdown(source: string, inline = false): Segment[] {
  const env = {}
  const tokens = md.parse(source, env)
  const segments: Segment[] = []
  let buffer: Token[] = []
  const flush = () => {
    if (!buffer.length)
      return
    const html = md.renderer.render(buffer, md.options, env)
    segments.push({ type: 'html', html: inline ? inlineStyles(html) : html })
    buffer = []
  }
  for (const t of tokens) {
    if ((t.type === 'fence' || t.type === 'code_block') && t.level === 0) {
      flush()
      const lang = t.info.trim().split(/\s+/)[0] || ''
      const code = t.content.replace(/\n$/, '')
      segments.push({
        type: 'code',
        lang,
        label: langLabel(lang),
        code,
        html: `<pre style="${PRE_STYLE}">${highlight(code, lang)}</pre>`,
        lineCount: code.split('\n').length,
        line: t.map?.[0] ?? 0,
      })
    }
    else {
      buffer.push(t)
    }
  }
  flush()
  return segments
}

/** 统计：字数（中文按字、英文按词）与行数 */
export function countText(source: string) {
  const cjk = source.match(/\p{Script=Han}/gu)?.length ?? 0
  const words = source.replace(/\p{Script=Han}/gu, ' ').match(/[\w'-]+/g)?.length ?? 0
  return { words: cjk + words, chars: Array.from(source).length, lines: source ? source.split('\n').length : 0 }
}

export interface OutlineItem {
  level: number
  text: string
  /** 源码行号（从 0 开始） */
  line: number
}

/** 大纲：所有标题（代码块里的 # 不算），标题里的 Markdown 标记只保留文字 */
export function extractOutline(source: string): OutlineItem[] {
  const tokens = md.parse(source, {})
  const items: OutlineItem[] = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.type !== 'heading_open' || !t.map)
      continue
    const inline = tokens[i + 1]
    const text = (inline?.children ?? [])
      .filter(c => c.type === 'text' || c.type === 'code_inline')
      .map(c => c.content)
      .join('')
      .trim()
    items.push({ level: Number(t.tag.slice(1)), text: text || '（空标题）', line: t.map[0] })
  }
  return items
}
