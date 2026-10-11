<script lang="ts" setup>
// Markdown 预览：普通内容 H5 用 v-html、小程序用 rich-text；顶层代码块带行号与复制按钮
import { copyText } from '@/utils/common'
import { renderMarkdown } from '../markdown'

const props = defineProps<{ source: string }>()

/** 小程序 rich-text 不吃外部样式，需要内联 */
let inline = false
// #ifndef H5
inline = true
// #endif

const segments = computed(() => renderMarkdown(props.source, inline))

function lineNumbers(n: number) {
  return Array.from({ length: n }, (_, i) => i + 1).join('\n')
}
</script>

<template>
  <view class="ot-md">
    <template v-for="(s, i) in segments" :key="i">
      <template v-if="s.type === 'html'">
        <!-- #ifdef H5 -->
        <div class="ot-md__html" v-html="s.html" />
        <!-- #endif -->
        <!-- #ifndef H5 -->
        <rich-text class="ot-md__html" :nodes="s.html" user-select />
        <!-- #endif -->
      </template>
      <view v-else class="ot-md__code">
        <view class="ot-md__code-head">
          <text>{{ s.label }}</text>
          <view class="ot-md__copy" @click="copyText(s.code)">
            <view class="i-carbon-copy" />
            <text>复制</text>
          </view>
        </view>
        <scroll-view scroll-x class="ot-md__code-body">
          <view class="ot-md__code-inner">
            <text class="ot-md__lines">{{ lineNumbers(s.lineCount) }}</text>
            <!-- #ifdef H5 -->
            <div class="ot-md__src" v-html="s.html" />
            <!-- #endif -->
            <!-- #ifndef H5 -->
            <rich-text class="ot-md__src" :nodes="s.html" user-select />
            <!-- #endif -->
          </view>
        </scroll-view>
      </view>
    </template>
  </view>
</template>

<style lang="scss" scoped>
.ot-md {
  font-size: 15px;
  line-height: 1.75;
  color: var(--ot-text);
  word-break: break-word;
}

.ot-md__code {
  margin: 12px 0;
  border-radius: 10px;
  overflow: hidden;
  background: #0d1117;
  border: 1px solid #30363d;
}

.ot-md__code-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  font-size: 12px;
  color: #8b949e;
  background: #161b22;
  border-bottom: 1px solid #30363d;
}

.ot-md__copy {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 6px;
  cursor: pointer;

  &:hover {
    color: #e6edf3;
    background: #30363d;
  }
}

.ot-md__code-body {
  width: 100%;
}

.ot-md__code-inner {
  display: inline-flex;
  min-width: 100%;
  padding: 12px 0;
  box-sizing: border-box;
}

// 行号与代码使用相同的行高，保证逐行对齐
.ot-md__lines {
  flex-shrink: 0;
  padding: 0 12px 0 14px;
  text-align: right;
  white-space: pre;
  color: #6e7681;
  border-right: 1px solid #30363d;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 20px;
  user-select: none;
}

.ot-md__src {
  flex: 1;
  padding: 0 16px 0 12px;
}
</style>

<style lang="scss" scoped>
/* v-html / rich-text 渲染的内容没有 scoped 标记，需要用 :deep 穿透（小程序端样式已内联） */
.ot-md__html {
  display: block;

  :deep(> :first-child) {
    margin-top: 0;
  }

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4),
  :deep(h5),
  :deep(h6) {
    margin: 18px 0 8px;
    font-weight: 700;
    line-height: 1.35;
    color: var(--ot-text);
  }

  :deep(h1) {
    font-size: 24px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--ot-border);
  }

  :deep(h2) {
    font-size: 20px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--ot-border);
  }

  :deep(h3) {
    font-size: 17px;
  }

  :deep(h4),
  :deep(h5),
  :deep(h6) {
    font-size: 15px;
  }

  :deep(p) {
    margin: 8px 0;
  }

  :deep(ul),
  :deep(ol) {
    margin: 8px 0;
    padding-left: 24px;
  }

  :deep(li) {
    margin: 3px 0;
  }

  :deep(li.ot-task) {
    list-style: none;
    margin-left: -18px;
  }

  :deep(li.ot-task.is-done) {
    color: var(--ot-text-3);
    text-decoration: line-through;
  }

  :deep(a) {
    color: var(--wot-color-theme);
    text-decoration: none;
    word-break: break-all;
  }

  :deep(a:hover) {
    text-decoration: underline;
  }

  :deep(blockquote) {
    margin: 10px 0;
    padding: 4px 14px;
    color: var(--ot-text-2);
    border-left: 4px solid var(--ot-border);
    background: var(--ot-fill);
    border-radius: 0 8px 8px 0;
  }

  :deep(code) {
    padding: 1px 6px;
    border-radius: 5px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.88em;
    color: #e11d48;
    background: var(--ot-fill);
  }

  :deep(pre code) {
    padding: 0;
    color: inherit;
    background: transparent;
    font-size: inherit;
  }

  :deep(.ot-md-pre) {
    margin: 8px 0;
  }

  :deep(table) {
    display: block;
    max-width: 100%;
    overflow-x: auto;
    border-collapse: collapse;
    margin: 10px 0;
    font-size: 14px;
  }

  :deep(th),
  :deep(td) {
    padding: 6px 12px;
    border: 1px solid var(--ot-border);
  }

  :deep(th) {
    background: var(--ot-fill);
    font-weight: 600;
  }

  :deep(hr) {
    margin: 18px 0;
    border: none;
    border-top: 1px solid var(--ot-border);
  }

  :deep(img) {
    max-width: 100%;
    border-radius: 8px;
  }
}
</style>
