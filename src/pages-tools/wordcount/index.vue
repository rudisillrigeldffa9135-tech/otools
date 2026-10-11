<script lang="ts" setup>
definePage({
  style: { navigationBarTitleText: '字数统计' },
})

const input = ref('')

/* eslint-disable regexp/no-obscure-range -- 按码点范围匹配，本身就是意图 */
// 不使用 \p{P}：部分小程序运行环境不支持 Unicode 属性转义，按码点范围列出 ASCII / 通用 / 全角标点
const PUNCT = /[!-/:-@[-`{-~\u2010-\u2027\u3000-\u303F\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65]/g
// CJK 统一汉字 + 扩展 A 区
const HAN = /[\u4E00-\u9FFF\u3400-\u4DBF]/g
/* eslint-enable regexp/no-obscure-range */

const stats = computed(() => {
  const s = input.value
  // Array.from 按码点计数，emoji 等不会被拆成两个字符
  const chars = Array.from(s)
  return [
    { label: '字符数', value: chars.length },
    { label: '不含空白', value: chars.filter(c => !/\s/.test(c)).length },
    { label: '汉字', value: (s.match(HAN) || []).length },
    { label: '英文单词', value: (s.match(/[a-z]+(?:['’-][a-z]+)*/gi) || []).length },
    { label: '数字', value: (s.match(/\d+(?:\.\d+)?/g) || []).length },
    { label: '标点', value: (s.match(PUNCT) || []).length },
    { label: '行数', value: s ? s.split(/\r?\n/).length : 0 },
    // 段落：非空行数
    { label: '段落', value: s.split(/\r?\n/).filter(p => p.trim()).length },
  ]
})
</script>

<template>
  <ot-tool-layout>
    <ot-panel>
      <view class="ot-stats">
        <view v-for="item in stats" :key="item.label" class="ot-stat">
          <view class="text-22px text-main font-600">
            {{ item.value }}
          </view>
          <view class="mt-1 text-12px text-muted">
            {{ item.label }}
          </view>
        </view>
      </view>
    </ot-panel>
    <ot-panel title="文本">
      <ot-textarea v-model="input" :mono="false" :height="300" placeholder="粘贴或输入文本，实时统计" />
    </ot-panel>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.ot-stat {
  padding: 12px 4px;
  border-radius: 10px;
  background: var(--ot-fill);
  text-align: center;
}
</style>
