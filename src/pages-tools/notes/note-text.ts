/**
 * 便签的标题与预览推导（纯函数）。
 * 前端（保存后就地更新列表）与 Worker（加密前写入标题）共用这一份实现。
 */

const PREVIEW_LENGTH = 100
const TITLE_LENGTH = 60

/** 从正文推导标题：第一行非空文字，去掉 Markdown 标记 */
export function deriveTitle(content: string) {
  for (const raw of content.split('\n')) {
    const line = raw
      .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ x]\]\s+)?|\d+[.)]\s+)/i, '')
      .replace(/[*_`~]/g, '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .trim()
    // 代码块的围栏行不算标题
    if (line && !/^(?:```|~~~)/.test(raw.trim()))
      return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH)}…` : line
  }
  return ''
}

/** 列表预览：去掉标题行与 Markdown 符号后的前若干字 */
export function derivePreview(content: string) {
  const body = content.split('\n')
  const first = body.findIndex(l => l.trim())
  const text = body.slice(first + 1).join('\n').replace(/```[\s\S]*?(?:```|$)/g, '\n[代码]\n').replace(/^[ \t]*(?:#{1,6}[ \t]+|>[ \t]*|[-*+][ \t]+(?:\[[ x]\][ \t]+)?|\d+[.)][ \t]+)/gim, '').replace(/^[ \t]*(?:\|[ \t]*)?:?-{3}.*$/gm, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*`~|]+/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text
}

/**
 * 便签里未完成的任务（「- [ ] xxx」「* [ ] xxx」「1. [ ] xxx」），代码块里的不算；用于「转为待办」
 */
export function extractTasks(content: string, max = 50) {
  const tasks: string[] = []
  let inFence = false
  for (const line of content.split('\n')) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence)
      continue
    const m = line.match(/^\s*(?:[-*+]|\d+[.)])\s+\[ \]\s+(\S.*)$/)
    if (m) {
      const text = m[1].trim().slice(0, 500)
      if (text && !tasks.includes(text))
        tasks.push(text)
      if (tasks.length >= max)
        break
    }
  }
  return tasks
}
