<script lang="ts" setup>
import type { CollapsedRow, DiffMode, LineRow } from './diff-view'
import { collapseRows, inlineDiff, lineDiff } from './diff-view'

definePage({
  style: { navigationBarTitleText: '文本对比' },
})

/** 超过这个长度时提示可能较慢（按字符对比的复杂度较高） */
const LARGE_INPUT = 200_000

const left = ref('')
const right = ref('')
const mode = ref<DiffMode>('line')
const modeOptions = [
  { value: 'line', label: '按行' },
  { value: 'word', label: '按词' },
  { value: 'char', label: '按字符' },
]
const ignoreCase = ref(false)
const ignoreWhitespace = ref(false)
const onlyChanges = ref(false)

/** 输入停顿后再计算，避免大文本逐字输入时卡顿 */
const debounced = reactive({ left: '', right: '' })
let timer: ReturnType<typeof setTimeout> | undefined
watch([left, right], () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    debounced.left = left.value
    debounced.right = right.value
  }, 250)
})

const isLarge = computed(() => left.value.length + right.value.length > LARGE_INPUT)
const opts = computed(() => ({ ignoreCase: ignoreCase.value, ignoreWhitespace: ignoreWhitespace.value }))

const lineResult = computed(() => (mode.value === 'line' ? lineDiff(debounced.left, debounced.right, opts.value) : undefined))
const inlineResult = computed(() => (mode.value !== 'line' ? inlineDiff(debounced.left, debounced.right, mode.value as 'word' | 'char', opts.value) : undefined))
const stats = computed(() => lineResult.value?.stats || inlineResult.value?.stats || { added: 0, removed: 0 })
const hasInput = computed(() => !!(debounced.left || debounced.right))
const identical = computed(() => hasInput.value && !stats.value.added && !stats.value.removed)
const unit = computed(() => ({ line: '行', word: '词', char: '字' }[mode.value]))

/** 被折叠的区段中，用户点开的起始下标 */
const expanded = reactive(new Set<number>())
watch([lineResult, onlyChanges], () => expanded.clear())

const displayRows = computed<CollapsedRow[]>(() => {
  const rows = lineResult.value?.rows || []
  if (!onlyChanges.value)
    return rows
  // 展开被用户点开的折叠段
  return collapseRows(rows).flatMap(r =>
    r.type === 'skip' && expanded.has(r.from) ? rows.slice(r.from, r.from + r.count) : [r],
  )
})

function isRow(r: CollapsedRow): r is LineRow {
  return r.type !== 'skip'
}

function swap() {
  [left.value, right.value] = [right.value, left.value]
}

function clear() {
  left.value = ''
  right.value = ''
}

function useSample() {
  left.value = 'OTools 工具箱\n版本：1.0.0\n支持平台：H5、小程序\n作者：张三\n\n功能列表：\n- JSON 格式化\n- 时间戳转换'
  right.value = 'OTools 工具箱\n版本：1.1.0\n支持平台：H5、微信小程序、App\n\n功能列表：\n- JSON 格式化\n- 时间戳转换\n- 文本对比'
}
</script>

<template>
  <ot-tool-layout>
    <view class="flex flex-col gap-3 md:flex-row">
      <ot-panel title="原文" class="min-w-0 md:flex-1">
        <ot-textarea v-model="left" :height="180" placeholder="粘贴原始文本" />
      </ot-panel>
      <ot-panel title="新文本" class="min-w-0 md:flex-1">
        <ot-textarea v-model="right" :height="180" placeholder="粘贴修改后的文本" />
      </ot-panel>
    </view>

    <ot-panel>
      <view class="flex flex-wrap items-center gap-3">
        <ot-segmented v-model="mode" :options="modeOptions" size="small" />
        <wd-checkbox v-model="ignoreCase" shape="square">
          忽略大小写
        </wd-checkbox>
        <wd-checkbox v-if="mode === 'line'" v-model="ignoreWhitespace" shape="square">
          忽略空白
        </wd-checkbox>
        <wd-checkbox v-if="mode === 'line'" v-model="onlyChanges" shape="square">
          只看差异
        </wd-checkbox>
        <view class="flex-1" />
        <wd-button size="small" type="info" plain @click="useSample">
          示例
        </wd-button>
        <wd-button size="small" type="info" plain icon="swap" @click="swap">
          交换
        </wd-button>
        <wd-button size="small" type="info" plain @click="clear">
          清空
        </wd-button>
      </view>
      <view v-if="isLarge" class="mt-2 text-12px text-[#b45309]">
        文本较大，对比可能需要几秒
      </view>
    </ot-panel>

    <ot-panel v-if="hasInput" title="对比结果">
      <template #extra>
        <text class="ot-diff__stat is-add">+{{ stats.added }} {{ unit }}</text>
        <text class="ot-diff__stat is-del">−{{ stats.removed }} {{ unit }}</text>
      </template>
      <view>
        <view v-if="identical" class="ot-diff__same">
          <view class="i-carbon-checkmark-filled shrink-0" />
          <text>两段文本{{ ignoreCase || ignoreWhitespace ? '（按当前选项）' : '' }}完全相同</text>
        </view>

        <!-- 按行 -->
        <view v-else-if="mode === 'line'" class="ot-diff__lines ot-mono">
          <template v-for="(r, i) in displayRows" :key="i">
            <view v-if="isRow(r)" class="ot-diff__row" :class="`is-${r.type}`">
              <text class="ot-diff__no">{{ r.oldNo ?? '' }}</text>
              <text class="ot-diff__no">{{ r.newNo ?? '' }}</text>
              <text class="ot-diff__sign">{{ r.type === 'add' ? '+' : r.type === 'del' ? '−' : '' }}</text>
              <text class="ot-diff__text" user-select selectable>
                <text
                  v-for="(s, k) in r.segs" :key="k"
                  :class="s.type !== 'equal' && r.segs.length > 1 ? `ot-diff__mark is-${s.type}` : ''"
                >
                  {{ s.text }}
                </text>{{ r.segs.every(s => !s.text) ? ' ' : '' }}
              </text>
            </view>
            <view v-else class="ot-diff__skip" @click="expanded.add(r.from)">
              <view class="i-carbon-row-expand" />
              <text>展开 {{ r.count }} 行相同内容</text>
            </view>
          </template>
        </view>

        <!-- 按词 / 字符 -->
        <view v-else class="ot-diff__inline" user-select selectable>
          <text v-for="(s, i) in inlineResult?.segs" :key="i" :class="s.type !== 'equal' ? `ot-diff__mark is-${s.type}` : ''">{{ s.text }}</text>
        </view>
      </view>
    </ot-panel>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-diff__stat {
  padding: 1px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-family: var(--ot-font-mono);

  &.is-add {
    color: #059669;
    background: rgba(16, 185, 129, 0.12);
  }

  &.is-del {
    color: #dc2626;
    background: rgba(239, 68, 68, 0.1);
  }
}

.ot-diff__same {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: #059669;
  background: rgba(16, 185, 129, 0.1);
}

.ot-diff__lines {
  border: 1px solid var(--ot-border);
  border-radius: 10px;
  overflow: hidden;
  font-size: 12.5px;
  line-height: 1.7;
}

.ot-diff__row {
  display: flex;
  color: var(--ot-text);

  &.is-add {
    background: rgba(16, 185, 129, 0.1);
  }

  &.is-del {
    background: rgba(239, 68, 68, 0.08);
  }
}

.ot-diff__no {
  flex-shrink: 0;
  width: 34px;
  padding-right: 6px;
  box-sizing: border-box;
  text-align: right;
  color: var(--ot-text-3);
  user-select: none;
  border-right: 1px solid var(--ot-border);
}

.ot-diff__sign {
  flex-shrink: 0;
  width: 18px;
  text-align: center;
  color: var(--ot-text-3);
  user-select: none;
}

.ot-diff__row.is-add .ot-diff__sign {
  color: #059669;
}

.ot-diff__row.is-del .ot-diff__sign {
  color: #dc2626;
}

.ot-diff__text {
  flex: 1;
  min-width: 0;
  padding-right: 8px;
  white-space: pre-wrap;
  word-break: break-all;
}

.ot-diff__mark {
  border-radius: 2px;

  &.is-add {
    background: rgba(16, 185, 129, 0.35);
  }

  &.is-del {
    background: rgba(239, 68, 68, 0.3);
    text-decoration: line-through;
    text-decoration-color: rgba(220, 38, 38, 0.6);
  }
}

.ot-diff__skip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 4px 0;
  font-family: inherit;
  font-size: 12px;
  color: var(--wot-color-theme);
  background: var(--ot-fill);
  cursor: pointer;
}

.ot-diff__inline {
  padding: 12px;
  border-radius: 10px;
  background: var(--ot-fill);
  font-size: 14px;
  line-height: 1.9;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--ot-text);
}
</style>
