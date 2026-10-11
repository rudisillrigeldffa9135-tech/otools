<script lang="ts" setup>
import type { EscapeKind } from './escape'
import { copyText, toast } from '@/utils/common'
import { decode, encode, findInvisible, KINDS } from './escape'

definePage({
  style: { navigationBarTitleText: '字符转义' },
})

const kind = ref<EscapeKind>('html')
const direction = ref<'encode' | 'decode'>('encode')
const nonAscii = ref(false)
const input = ref('<p class="note">Tom & Jerry 说："你好"</p>')

const current = computed(() => KINDS.find(k => k.value === kind.value)!)
/** 只有这几种转义有「非 ASCII 也转义」的区别 */
const supportsNonAscii = computed(() => ['html', 'unicode', 'js', 'json'].includes(kind.value))
const nonAsciiLabel = computed(() => (kind.value === 'unicode' ? 'ASCII 字符也转义' : '中文等非 ASCII 也转义'))

const output = computed<{ value?: string, error?: string }>(() => {
  if (!input.value)
    return {}
  try {
    return {
      value: direction.value === 'encode'
        ? encode(kind.value, input.value, { nonAscii: nonAscii.value })
        : decode(kind.value, input.value),
    }
  }
  catch (e: any) {
    return { error: e.message }
  }
})

const invisible = computed(() => findInvisible(input.value))

function swap() {
  if (output.value.value === undefined)
    return toast('没有可互换的结果')
  input.value = output.value.value
  direction.value = direction.value === 'encode' ? 'decode' : 'encode'
}

/** 去掉零宽字符、BOM 等不可见字符，全角空格与不换行空格换成普通空格 */
function cleanInvisible() {
  input.value = input.value.replace(/[\u200B-\u200D\uFEFF­]/g, '').replace(/[\xA0\u3000]/g, ' ')
  toast('已清理', 'success')
}
</script>

<template>
  <ot-tool-layout>
    <ot-panel title="转义类型">
      <view class="ot-es__kinds">
        <view v-for="k in KINDS" :key="k.value" class="ot-es__kind" :class="{ 'is-active': kind === k.value }" @click="kind = k.value">
          {{ k.label }}
        </view>
      </view>
      <view class="mt-2 text-12px text-muted leading-18px">
        {{ current.desc }}
      </view>
    </ot-panel>

    <ot-panel>
      <view class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ot-segmented v-model="direction" :options="[{ value: 'encode', label: '转义' }, { value: 'decode', label: '还原' }]" />
        <view v-if="supportsNonAscii && direction === 'encode'" class="flex items-center gap-2 text-13px text-sub">
          <wd-switch v-model="nonAscii" size="18px" />
          {{ nonAsciiLabel }}
        </view>
      </view>
      <ot-textarea v-model="input" :height="140" :placeholder="direction === 'encode' ? '输入原始文本' : '输入转义后的文本'" />
      <view v-if="invisible.length" class="ot-es__warn">
        <view class="i-carbon-view-off shrink-0 text-15px" />
        <view class="flex-1">
          含有不可见或易混淆的字符：
          <text v-for="c in invisible" :key="c.code" class="mr-2 inline-block">
            {{ c.name }}（{{ c.code }}）× {{ c.count }}
          </text>
        </view>
        <text class="shrink-0 cursor-pointer font-600" @click="cleanInvisible">清理</text>
      </view>
    </ot-panel>

    <ot-panel title="结果">
      <template #extra>
        <wd-button size="small" type="info" plain @click="swap">
          互换
        </wd-button>
        <wd-button size="small" icon="copy" :disabled="!output.value" @click="copyText(output.value || '')">
          复制
        </wd-button>
      </template>
      <view v-if="output.error" class="ot-es__error">
        <view class="i-carbon-warning-filled shrink-0" />
        <text>{{ output.error }}</text>
      </view>
      <view v-else-if="output.value !== undefined" class="ot-es__output ot-mono">
        <text user-select selectable>{{ output.value }}</text>
      </view>
      <view v-else class="py-4 text-center text-13px text-muted">
        输入内容后实时转换
      </view>
      <view v-if="output.value !== undefined && input" class="mt-2 text-12px text-muted">
        {{ Array.from(input).length }} 字符 → {{ Array.from(output.value || '').length }} 字符
      </view>
    </ot-panel>

    <view class="px-1 text-12px text-muted leading-20px">
      URL 编码请使用「URL 编解码」工具，Base64 请使用「Base64」工具。
    </view>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-es__kinds {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ot-es__kind {
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--ot-text-2);
  background: var(--ot-fill);
  border: 1px solid transparent;
  cursor: pointer;

  &.is-active {
    color: var(--wot-color-theme);
    border-color: var(--wot-color-theme);
    background: transparent;
    font-weight: 600;
  }
}

.ot-es__warn {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 18px;
  color: #b45309;
  background: rgba(245, 158, 11, 0.12);
}

.ot-es__output {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--ot-fill);
  font-size: 13px;
  line-height: 1.6;
  color: var(--ot-text);
  word-break: break-all;
  white-space: pre-wrap;
  max-height: 360px;
  overflow-y: auto;
}

.ot-es__error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: #dc2626;
  background: rgba(239, 68, 68, 0.08);
}
</style>
