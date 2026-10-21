/**
 * 编辑区与预览区按源码行号对齐（仅 H5）：分栏滚动同步、大纲跳转、当前所在标题。
 *
 * - 编辑区：textarea 会自动换行，某一行的位置无法直接算出，用一个样式相同的隐藏镜像元素逐行测量（结果缓存，内容或宽度变化后重新测）
 * - 预览区：渲染时给顶层块元素加了 data-line（源码起始行号），以这些元素作锚点
 * - 两边在锚点之间线性插值，代码块、图片、表格等高度差异很大的内容也能对齐
 */

interface Anchor {
  line: number
  top: number
}

export interface ScrollSyncOptions {
  editor: () => HTMLTextAreaElement | null
  preview: () => HTMLElement | null
  text: () => string
  /** 是否开启滚动同步（关闭时仍可用于大纲跳转） */
  enabled: () => boolean
  /** 任一侧滚动后回调（用于高亮当前标题） */
  onScroll?: () => void
}

const MIRROR_STYLES = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'tabSize',
  'textIndent',
  'wordSpacing',
] as const

/** 二分查找：最后一个 <= value 的下标 */
function lastLE(arr: number[], value: number) {
  let lo = 0
  let hi = arr.length - 1
  let ans = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid] <= value) {
      ans = mid
      lo = mid + 1
    }
    else {
      hi = mid - 1
    }
  }
  return ans
}

export function createScrollSync(opts: ScrollSyncOptions) {
  let lineTops: number[] = []
  let measuredText: string | null = null
  let measuredWidth = 0
  let anchors: Anchor[] = []
  let anchorsDirty = true
  /** 程序设置滚动位置后，忽略对侧随之触发的一次 scroll 事件，避免来回触发 */
  let ignore: { el: HTMLElement, until: number } | null = null
  let editorEl: HTMLTextAreaElement | null = null
  let previewEl: HTMLElement | null = null

  /** 编辑区每一行（源码行）顶部相对内容顶部的位置 */
  function measureLines(ta: HTMLTextAreaElement) {
    const text = opts.text()
    if (text === measuredText && ta.clientWidth === measuredWidth && lineTops.length)
      return lineTops
    const style = getComputedStyle(ta)
    const mirror = document.createElement('div')
    for (const k of MIRROR_STYLES)
      (mirror.style as any)[k] = style[k]
    Object.assign(mirror.style, {
      position: 'absolute',
      visibility: 'hidden',
      left: '-99999px',
      top: '0',
      height: 'auto',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'break-word',
      wordBreak: style.wordBreak,
      width: `${ta.clientWidth}px`,
      boxSizing: 'border-box',
      borderStyle: 'solid',
      borderColor: 'transparent',
      borderTopWidth: '0',
      borderBottomWidth: '0',
      borderLeftWidth: '0',
      borderRightWidth: '0',
    })
    const lines = text.split('\n')
    const frag = document.createDocumentFragment()
    for (const line of lines) {
      const div = document.createElement('div')
      // 空行也要占一行高
      div.textContent = line || '​'
      frag.appendChild(div)
    }
    mirror.appendChild(frag)
    document.body.appendChild(mirror)
    const children = mirror.children
    const padTop = Number.parseFloat(style.paddingTop) || 0
    lineTops = Array.from({ length: children.length }, (_, i) => (children[i] as HTMLElement).offsetTop - padTop)
    // 末尾补一个「文档结束」的位置，便于插值
    lineTops.push(mirror.scrollHeight - padTop - (Number.parseFloat(style.paddingBottom) || 0))
    document.body.removeChild(mirror)
    measuredText = text
    measuredWidth = ta.clientWidth
    return lineTops
  }

  function measureAnchors(pv: HTMLElement) {
    if (!anchorsDirty && anchors.length)
      return anchors
    const base = pv.getBoundingClientRect().top - pv.scrollTop
    const list: Anchor[] = []
    pv.querySelectorAll<HTMLElement>('[data-line]').forEach((el) => {
      const line = Number(el.dataset.line)
      if (Number.isFinite(line))
        list.push({ line, top: el.getBoundingClientRect().top - base })
    })
    list.sort((a, b) => a.line - b.line || a.top - b.top)
    // 行号相同时只保留第一个
    anchors = list.filter((a, i) => i === 0 || a.line !== list[i - 1].line)
    anchorsDirty = false
    return anchors
  }

  /** 编辑区滚动位置 → 源码行（带小数） */
  function editorLineAt(ta: HTMLTextAreaElement, y: number) {
    const tops = measureLines(ta)
    const i = Math.min(lastLE(tops, y), tops.length - 2)
    const h = tops[i + 1] - tops[i] || 1
    return Math.max(0, i + Math.min(1, (y - tops[i]) / h))
  }

  function editorYOfLine(ta: HTMLTextAreaElement, line: number) {
    const tops = measureLines(ta)
    const i = Math.max(0, Math.min(Math.floor(line), tops.length - 1))
    const next = tops[Math.min(i + 1, tops.length - 1)]
    return tops[i] + (next - tops[i]) * (line - i)
  }

  /** 源码行（带小数）→ 预览区位置：在前后两个锚点之间按编辑区的位置比例插值 */
  function previewYOfLine(pv: HTMLElement, ta: HTMLTextAreaElement | null, line: number) {
    const list = measureAnchors(pv)
    if (!list.length)
      return 0
    const idx = list.findIndex(a => a.line > line)
    const a = idx === -1 ? list[list.length - 1] : idx === 0 ? { line: 0, top: 0 } : list[idx - 1]
    const b = idx === -1 ? { line: Math.max(a.line + 1, opts.text().split('\n').length), top: pv.scrollHeight } : list[idx]
    if (b.line === a.line)
      return a.top
    let ratio = (line - a.line) / (b.line - a.line)
    if (ta) {
      const ya = editorYOfLine(ta, a.line)
      const yb = editorYOfLine(ta, b.line)
      if (yb > ya)
        ratio = (editorYOfLine(ta, line) - ya) / (yb - ya)
    }
    return a.top + (b.top - a.top) * Math.max(0, Math.min(1, ratio))
  }

  /** 预览区位置 → 源码行（带小数） */
  function previewLineAt(pv: HTMLElement, y: number) {
    const list = measureAnchors(pv)
    if (!list.length)
      return 0
    const idx = list.findIndex(a => a.top > y)
    const a = idx === -1 ? list[list.length - 1] : idx === 0 ? { line: 0, top: 0 } : list[idx - 1]
    const b = idx === -1 ? { line: Math.max(a.line + 1, opts.text().split('\n').length), top: pv.scrollHeight } : list[idx]
    if (b.top === a.top)
      return a.line
    return a.line + (b.line - a.line) * Math.max(0, Math.min(1, (y - a.top) / (b.top - a.top)))
  }

  function setScroll(el: HTMLElement, top: number) {
    const target = Math.max(0, Math.min(top, el.scrollHeight - el.clientHeight))
    if (Math.abs(el.scrollTop - target) < 1)
      return
    ignore = { el, until: performance.now() + 120 }
    el.scrollTop = target
  }

  /** 预览区自身不滚动（只看预览时高度随内容撑开，滚动的是整个页面） */
  function scrollable(el: HTMLElement) {
    return el.scrollHeight > el.clientHeight + 1
  }
  /** 页面顶部吸顶导航栏的高度 */
  const HEADER_OFFSET = 72

  function atBottom(el: HTMLElement) {
    return el.scrollTop + el.clientHeight >= el.scrollHeight - 2
  }

  function onEditorScroll() {
    const ta = editorEl
    const pv = previewEl
    if (!ta || (ignore?.el === ta && performance.now() < ignore.until)) {
      opts.onScroll?.()
      return
    }
    if (pv && opts.enabled()) {
      if (atBottom(ta))
        setScroll(pv, pv.scrollHeight)
      else if (ta.scrollTop <= 0)
        setScroll(pv, 0)
      else
        setScroll(pv, previewYOfLine(pv, ta, editorLineAt(ta, ta.scrollTop)))
    }
    opts.onScroll?.()
  }

  function onPreviewScroll() {
    const ta = editorEl
    const pv = previewEl
    if (!pv || (ignore?.el === pv && performance.now() < ignore.until)) {
      opts.onScroll?.()
      return
    }
    if (ta && opts.enabled()) {
      if (atBottom(pv))
        setScroll(ta, ta.scrollHeight)
      else if (pv.scrollTop <= 0)
        setScroll(ta, 0)
      else
        setScroll(ta, editorYOfLine(ta, previewLineAt(pv, pv.scrollTop)))
    }
    opts.onScroll?.()
  }

  /** 每帧最多处理一次滚动（不用 requestAnimationFrame：窗口在后台时它会暂停） */
  function throttled(fn: () => void) {
    let pending = false
    return () => {
      if (pending)
        return
      pending = true
      setTimeout(() => {
        pending = false
        fn()
      }, 16)
    }
  }
  const editorHandler = throttled(onEditorScroll)
  const previewHandler = throttled(onPreviewScroll)
  const windowHandler = throttled(() => opts.onScroll?.())
  /** 预览里的图片加载完后高度会变 */
  const onImageLoad = () => (anchorsDirty = true)

  /** 页面结构变化后（切换模式、打开便签、预览重新渲染）重新绑定 */
  function bind() {
    const ta = opts.editor()
    const pv = opts.preview()
    if (ta !== editorEl) {
      editorEl?.removeEventListener('scroll', editorHandler)
      ta?.addEventListener('scroll', editorHandler, { passive: true })
      editorEl = ta
    }
    if (pv !== previewEl) {
      previewEl?.removeEventListener('scroll', previewHandler)
      previewEl?.removeEventListener('load', onImageLoad, true)
      pv?.addEventListener('scroll', previewHandler, { passive: true })
      pv?.addEventListener('load', onImageLoad, true)
      previewEl = pv
    }
    window.removeEventListener('scroll', windowHandler)
    window.addEventListener('scroll', windowHandler, { passive: true })
    anchorsDirty = true
  }

  function unbind() {
    editorEl?.removeEventListener('scroll', editorHandler)
    previewEl?.removeEventListener('scroll', previewHandler)
    previewEl?.removeEventListener('load', onImageLoad, true)
    window.removeEventListener('scroll', windowHandler)
    editorEl = null
    previewEl = null
  }

  /** 预览内容或尺寸变了，锚点位置需要重新测量 */
  function invalidate() {
    anchorsDirty = true
    measuredText = null
  }

  /** 当前视图最上方对应的源码行；编辑区可见时以编辑区为准 */
  function topLine() {
    if (editorEl && editorEl.isConnected)
      return editorLineAt(editorEl, editorEl.scrollTop + 4)
    if (previewEl && previewEl.isConnected) {
      const y = scrollable(previewEl) ? previewEl.scrollTop : HEADER_OFFSET - previewEl.getBoundingClientRect().top
      return previewLineAt(previewEl, Math.max(0, y) + 4)
    }
    return 0
  }

  /** 跳到源码某一行：编辑区与预览区都滚过去，并把光标放到该行开头 */
  function scrollToLine(line: number) {
    const ta = editorEl?.isConnected ? editorEl : null
    const pv = previewEl?.isConnected ? previewEl : null
    if (ta) {
      setScroll(ta, editorYOfLine(ta, line) - 4)
      const text = opts.text()
      let pos = 0
      for (let i = 0; i < line && pos !== -1; i++)
        pos = text.indexOf('\n', pos) + 1
      if (pos >= 0) {
        // 不弹出键盘也能移动光标
        ta.setSelectionRange(pos, pos)
      }
    }
    if (pv) {
      const el = pv.querySelector<HTMLElement>(`[data-line="${line}"]`)
      const y = el
        ? el.getBoundingClientRect().top - pv.getBoundingClientRect().top + pv.scrollTop
        : previewYOfLine(pv, ta, line)
      if (scrollable(pv))
        setScroll(pv, y - 4)
      else
        window.scrollTo({ top: Math.max(0, window.scrollY + pv.getBoundingClientRect().top + y - HEADER_OFFSET) })
    }
  }

  return { bind, unbind, invalidate, topLine, scrollToLine }
}
