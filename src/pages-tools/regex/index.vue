<script lang="ts" setup>
import type { Preset } from './regex'
import { copyText } from '@/utils/common'
import { compile, escapeRegExp, findMatches, FLAGS, PRESETS, toSegments } from './regex'

definePage({
  style: { navigationBarTitleText: '正则测试' },
})

const pattern = ref('(\\d{4})-(\\d{2})-(\\d{2})')
const flags = reactive<Record<string, boolean>>({ g: true, i: false, m: false, s: false, u: false })
const text = ref('会议日期：2026-10-11，截止日期：2026-12-31，备用 2027-01-05')
const replacement = ref('$3/$2/$1')
const mode = ref<'match' | 'replace'>('match')
const modeOptions = [
  { value: 'match', label: '匹配' },
  { value: 'replace', label: '替换' },
]

const flagStr = computed(() => FLAGS.map(f => f.flag).filter(f => flags[f]).join(''))
const compiled = computed(() => compile(pattern.value, flagStr.value))

const result = computed(() => {
  const re = compiled.value.re
  if (!re)
    return { matches: [], truncated: false }
  return findMatches(re, text.value)
})
const segments = computed(() => toSegments(text.value, result.value.matches))

const replaced = computed(() => {
  const re = compiled.value.re
  if (!re)
    return ''
  try {
    return text.value.replace(re, replacement.value)
  }
  catch {
    return text.value
  }
})

/** 匹配高亮用 4 种颜色轮换，便于区分相邻匹配 */
const HL = ['#4f6ef7', '#10b981', '#f59e0b', '#ec4899']

function usePreset(p: Preset) {
  pattern.value = p.pattern
  for (const f of FLAGS)
    flags[f.flag] = p.flags.includes(f.flag)
  text.value = p.sample
  mode.value = 'match'
}

/** 把测试文本里选中的普通文字转成正则字面量（这里直接转义整个输入框内容） */
function escapePattern() {
  pattern.value = escapeRegExp(pattern.value)
}

const jsCode = computed(() => `/${pattern.value.replace(/\//g, '\\/')}/${flagStr.value}`)
</script>

<template>
  <ot-tool-layout>
    <ot-panel title="正则表达式">
      <template #extra>
        <wd-button size="small" type="info" plain :disabled="!pattern" @click="escapePattern">
          转义为字面量
        </wd-button>
        <wd-button size="small" type="info" plain :disabled="!pattern" @click="copyText(jsCode)">
          复制
        </wd-button>
      </template>
      <view class="ot-re__pattern">
        <text class="ot-re__slash">/</text>
        <input v-model="pattern" class="ot-mono min-w-0 flex-1 text-14px" placeholder="输入正则，如 \d+">
        <text class="ot-re__slash">/{{ flagStr }}</text>
      </view>
      <view class="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        <wd-checkbox v-for="f in FLAGS" :key="f.flag" v-model="flags[f.flag]" shape="square">
          <text class="ot-mono">{{ f.flag }}</text> {{ f.label }}
        </wd-checkbox>
      </view>
      <view v-if="compiled.error" class="ot-re__error">
        <view class="i-carbon-warning-filled shrink-0" />
        <text>{{ compiled.error }}</text>
      </view>
      <view class="mt-3 flex flex-wrap items-center gap-1.5">
        <text class="text-12px text-muted">常用：</text>
        <view v-for="p in PRESETS" :key="p.name" class="ot-re__preset" @click="usePreset(p)">
          {{ p.name }}
        </view>
      </view>
    </ot-panel>

    <ot-panel title="测试文本">
      <template #extra>
        <ot-segmented v-model="mode" :options="modeOptions" size="small" />
      </template>
      <ot-textarea v-model="text" :height="130" :mono="false" placeholder="输入要测试的文本" />
      <view v-if="mode === 'replace'" class="ot-re__pattern mt-3">
        <text class="shrink-0 text-13px text-muted">替换为</text>
        <input v-model="replacement" class="ot-mono min-w-0 flex-1 text-14px" placeholder="$1 引用第 1 组，$<name> 引用命名组，$& 为整个匹配">
      </view>
    </ot-panel>

    <ot-panel v-if="mode === 'match'" :title="`匹配结果 · ${result.matches.length}${result.truncated ? '+' : ''}`">
      <view v-if="!text" class="py-4 text-center text-13px text-muted">
        请输入测试文本
      </view>
      <template v-else>
        <view class="ot-re__preview">
          <text
            v-for="(s, i) in segments" :key="i"
            :class="{ 'ot-re__hl': s.match >= 0 }"
            :style="s.match >= 0 ? { background: `${HL[s.match % HL.length]}2e`, borderColor: HL[s.match % HL.length] } : {}"
          >
            {{ s.text }}
          </text>
        </view>
        <view v-if="result.truncated" class="mt-2 text-12px text-[#b45309]">
          匹配过多，仅显示前 {{ result.matches.length }} 个
        </view>
        <view v-if="!result.matches.length && compiled.re" class="mt-3 text-13px text-muted">
          没有匹配
        </view>
        <view v-for="(m, i) in result.matches.slice(0, 100)" :key="i" class="ot-re__match">
          <view class="flex items-center gap-2">
            <text class="ot-re__idx" :style="{ background: HL[i % HL.length] }">{{ i + 1 }}</text>
            <text class="ot-mono min-w-0 flex-1 break-all text-13px text-main" user-select selectable>{{ m.text || '（空匹配）' }}</text>
            <text class="shrink-0 text-12px text-muted">位置 {{ m.index }}–{{ m.end }}</text>
          </view>
          <view v-if="m.groups.length" class="mt-1.5 flex flex-wrap gap-1.5 pl-7">
            <text v-for="(g, gi) in m.groups" :key="gi" class="ot-re__group">
              <text class="text-muted">${{ gi + 1 }}</text> {{ g ?? '未匹配' }}
            </text>
            <text v-for="(v, k) in m.named" :key="k" class="ot-re__group">
              <text class="text-muted">{{ k }}</text> {{ v ?? '未匹配' }}
            </text>
          </view>
        </view>
        <view v-if="result.matches.length > 100" class="mt-2 text-12px text-muted">
          列表仅显示前 100 个匹配
        </view>
      </template>
    </ot-panel>

    <ot-panel v-else title="替换结果">
      <template #extra>
        <wd-button size="small" type="info" plain :disabled="!replaced" @click="copyText(replaced)">
          复制
        </wd-button>
        <wd-button size="small" type="info" plain :disabled="!replaced" @click="text = replaced">
          用作测试文本
        </wd-button>
      </template>
      <text class="ot-re__preview block" user-select selectable>{{ replaced }}</text>
      <view v-if="compiled.re && !flags.g" class="mt-2 text-12px text-muted">
        未开启 g（全局）时只替换第一个匹配
      </view>
    </ot-panel>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-re__pattern {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 42px;
  padding: 0 12px;
  border-radius: 10px;
  background: var(--ot-fill);
  color: var(--ot-text);
}

.ot-re__slash {
  flex-shrink: 0;
  font-family: var(--ot-font-mono);
  font-size: 15px;
  color: var(--ot-text-3);
}

.ot-re__error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: #dc2626;
  background: rgba(239, 68, 68, 0.08);
}

.ot-re__preset {
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

.ot-re__preview {
  padding: 12px;
  border-radius: 10px;
  background: var(--ot-fill);
  font-size: 14px;
  line-height: 1.9;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--ot-text);
}

.ot-re__hl {
  border-radius: 3px;
  border-bottom: 2px solid;
}

.ot-re__match {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--ot-border);
}

.ot-re__idx {
  flex-shrink: 0;
  min-width: 20px;
  height: 20px;
  padding: 0 4px;
  box-sizing: border-box;
  border-radius: 6px;
  font-size: 11px;
  line-height: 20px;
  text-align: center;
  color: #fff;
}

.ot-re__group {
  padding: 1px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-family: var(--ot-font-mono);
  background: var(--ot-fill);
  color: var(--ot-text);
  word-break: break-all;
}
</style>
