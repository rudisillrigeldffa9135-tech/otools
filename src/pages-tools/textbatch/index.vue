<script lang="ts" setup>
import type { BatchOptions, CaseMode, SortMode } from './ops'
import { copyText } from '@/utils/common'
import { countLines, DEFAULT_OPTIONS, processText } from './ops'

definePage({
  style: { navigationBarTitleText: '文本批处理' },
})

const input = ref('')
const opts = reactive<BatchOptions>({ ...DEFAULT_OPTIONS })
/** 随机打乱的种子，点「重新打乱」时更新 */
const shuffleSeed = ref(0)

const sortOptions: { value: SortMode, label: string }[] = [
  { value: 'none', label: '不排序' },
  { value: 'asc', label: '升序' },
  { value: 'desc', label: '降序' },
  { value: 'natural', label: '自然' },
  { value: 'length', label: '按长度' },
  { value: 'reverse', label: '倒序' },
  { value: 'shuffle', label: '打乱' },
]
const caseOptions: { value: CaseMode, label: string }[] = [
  { value: 'none', label: '不变' },
  { value: 'upper', label: '大写' },
  { value: 'lower', label: '小写' },
]

/** 常用组合，一键套用 */
const PRESETS: { name: string, opts: Partial<BatchOptions> }[] = [
  { name: '去重排序', opts: { trim: true, removeEmpty: true, dedupe: true, sort: 'natural' } },
  { name: '清理空行空格', opts: { trim: true, collapseSpaces: true, removeEmpty: true } },
  { name: '行转逗号分隔', opts: { trim: true, removeEmpty: true, joinWith: ',' } },
  { name: '逗号分隔转行', opts: { splitBy: ',', trim: true, removeEmpty: true } },
  { name: '加引号（SQL IN）', opts: { trim: true, removeEmpty: true, dedupe: true, prefix: '\'', suffix: '\'', joinWith: ', ' } },
]

function applyPreset(p: Partial<BatchOptions>) {
  Object.assign(opts, DEFAULT_OPTIONS, p)
}

function reset() {
  Object.assign(opts, DEFAULT_OPTIONS)
}

/** 简单的可复现随机数（同一种子结果相同，避免每次输入都重新打乱） */
function seededRandom(seed: number) {
  let s = seed % 2147483647 || 1
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

const result = computed(() => processText(input.value, opts, seededRandom(shuffleSeed.value + 1)))
const inputLines = computed(() => countLines(input.value))

function useResult() {
  input.value = result.value.output
  reset()
}
</script>

<template>
  <ot-tool-layout>
    <ot-panel :title="`输入 · ${inputLines} 行`">
      <template #extra>
        <wd-button size="small" type="info" plain :disabled="!input" @click="input = ''">
          清空
        </wd-button>
      </template>
      <ot-textarea v-model="input" :height="150" :mono="false" placeholder="每行一条数据，也可以设置下方的「拆分」按其他分隔符拆开" />
    </ot-panel>

    <ot-panel title="操作">
      <template #extra>
        <wd-button size="small" type="info" plain @click="reset">
          重置
        </wd-button>
      </template>
      <view class="mb-3 flex flex-wrap items-center gap-1.5">
        <text class="text-12px text-muted">常用：</text>
        <view v-for="p in PRESETS" :key="p.name" class="ot-tb__chip" @click="applyPreset(p.opts)">
          {{ p.name }}
        </view>
      </view>

      <view class="ot-tb__grid">
        <wd-checkbox v-model="opts.trim" shape="square">
          去首尾空白
        </wd-checkbox>
        <wd-checkbox v-model="opts.collapseSpaces" shape="square">
          合并连续空格
        </wd-checkbox>
        <wd-checkbox v-model="opts.removeEmpty" shape="square">
          去空行
        </wd-checkbox>
        <wd-checkbox v-model="opts.dedupe" shape="square">
          去重
        </wd-checkbox>
        <wd-checkbox v-if="opts.dedupe" v-model="opts.dedupeIgnoreCase" shape="square">
          去重忽略大小写
        </wd-checkbox>
        <wd-checkbox v-model="opts.numbering" shape="square">
          添加行号
        </wd-checkbox>
      </view>

      <view class="ot-tb__row">
        <text class="ot-tb__label">排序</text>
        <view class="min-w-0 flex flex-1 flex-wrap items-center gap-2">
          <ot-segmented v-model="opts.sort" :options="sortOptions" size="small" />
          <view v-if="opts.sort === 'shuffle'" class="ot-tb__chip" @click="shuffleSeed++">
            重新打乱
          </view>
        </view>
      </view>
      <view class="ot-tb__row">
        <text class="ot-tb__label">大小写</text>
        <ot-segmented v-model="opts.caseMode" :options="caseOptions" size="small" />
      </view>

      <view class="ot-tb__fields">
        <view class="ot-tb__field">
          <text class="ot-tb__label">查找</text>
          <input v-model="opts.find" class="ot-tb__input" placeholder="要替换的文字">
        </view>
        <view class="ot-tb__field">
          <text class="ot-tb__label">替换为</text>
          <input v-model="opts.replaceWith" class="ot-tb__input" placeholder="留空即删除">
        </view>
        <view class="ot-tb__field">
          <text class="ot-tb__label">只保留</text>
          <input v-model="opts.include" class="ot-tb__input" placeholder="包含该文字的行">
        </view>
        <view class="ot-tb__field">
          <text class="ot-tb__label">排除</text>
          <input v-model="opts.exclude" class="ot-tb__input" placeholder="包含该文字的行">
        </view>
        <view class="ot-tb__field">
          <text class="ot-tb__label">前缀</text>
          <input v-model="opts.prefix" class="ot-tb__input" placeholder="每行开头加上">
        </view>
        <view class="ot-tb__field">
          <text class="ot-tb__label">后缀</text>
          <input v-model="opts.suffix" class="ot-tb__input" placeholder="每行末尾加上">
        </view>
        <view class="ot-tb__field">
          <text class="ot-tb__label">拆分</text>
          <input v-model="opts.splitBy" class="ot-tb__input ot-mono" placeholder="默认按行，如 , 或 \t">
        </view>
        <view class="ot-tb__field">
          <text class="ot-tb__label">合并</text>
          <input v-model="opts.joinWith" class="ot-tb__input ot-mono" placeholder="默认换行，如 , 或 \t">
        </view>
      </view>
      <view class="mt-2 text-12px text-muted leading-20px">
        执行顺序：拆分 → 去空白 → 查找替换 → 筛选 → 去空行 → 大小写 → 去重 → 排序 → 前后缀 → 行号 → 合并。分隔符支持 \n（换行）与 \t（制表符）。
      </view>
    </ot-panel>

    <ot-panel :title="`结果 · ${result.lines.length} 项`">
      <template #extra>
        <wd-button size="small" type="info" plain :disabled="!result.output" @click="useResult">
          结果作为输入
        </wd-button>
        <wd-button size="small" :disabled="!result.output" @click="copyText(result.output)">
          复制
        </wd-button>
      </template>
      <ot-textarea :model-value="result.output" :height="150" :mono="false" readonly placeholder="结果会实时显示在这里" />
      <view v-if="input" class="mt-2 text-12px text-muted">
        输入 {{ inputLines }} 行 → 输出 {{ result.lines.length }} 项{{ inputLines > result.lines.length ? `，减少 ${inputLines - result.lines.length}` : '' }}
      </view>
    </ot-panel>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-tb__chip {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--ot-text-2);
  border: 1px solid var(--ot-border);
  cursor: pointer;

  &:hover {
    color: var(--wot-color-theme);
    border-color: var(--wot-color-theme);
  }
}

.ot-tb__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 20px;
}

.ot-tb__row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.ot-tb__label {
  flex-shrink: 0;
  width: 48px;
  font-size: 13px;
  color: var(--ot-text-2);
}

.ot-tb__fields {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 8px 16px;
  margin-top: 14px;
}

@media (min-width: 640px) {
  .ot-tb__fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.ot-tb__field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ot-tb__input {
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 10px;
  border-radius: 8px;
  background: var(--ot-fill);
  font-size: 13px;
  color: var(--ot-text);
}
</style>
