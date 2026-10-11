<script lang="ts" setup>
definePage({
  style: { navigationBarTitleText: '命名格式转换' },
})

const input = ref('hello world, OTools isGreat')

/** 拆分为单词：兼容空格、下划线、短横线、驼峰、连续大写（如 XMLHttp） */
function splitWords(s: string) {
  return s
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^a-z\d]+/i)
    .filter(Boolean)
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()

const results = computed(() => {
  const s = input.value
  if (!s)
    return []
  const words = splitWords(s)
  const lower = words.map(w => w.toLowerCase())
  return [
    { label: '大写', value: s.toUpperCase() },
    { label: '小写', value: s.toLowerCase() },
    { label: '首字母大写', value: s.replace(/\b[a-z]/gi, c => c.toUpperCase()) },
    { label: 'camelCase', value: lower.map((w, i) => (i ? cap(w) : w)).join('') },
    { label: 'PascalCase', value: lower.map(cap).join('') },
    { label: 'snake_case', value: lower.join('_') },
    { label: 'CONSTANT', value: lower.join('_').toUpperCase() },
    { label: 'kebab-case', value: lower.join('-') },
    { label: 'dot.case', value: lower.join('.') },
  ]
})
</script>

<template>
  <ot-tool-layout>
    <ot-panel title="输入">
      <ot-textarea v-model="input" :height="100" placeholder="输入文本或变量名，如 userName / user_name" />
    </ot-panel>
    <ot-panel v-if="results.length" title="结果">
      <ot-result v-for="r in results" :key="r.label" :label="r.label" :value="r.value" />
    </ot-panel>
  </ot-tool-layout>
</template>
