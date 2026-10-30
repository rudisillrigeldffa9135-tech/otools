<script lang="ts" setup>
// 迷你折线图：values 为一组数值，max 不传时按数据最大值缩放
const props = withDefaults(defineProps<{
  values: number[]
  max?: number
  color?: string
  /** 第二条线（如上传速率） */
  values2?: number[]
  color2?: string
  height?: number
}>(), { color: '#4f6ef7', color2: '#f59e0b', height: 36 })

const W = 120

function points(vals: number[], top: number) {
  if (vals.length < 2)
    return ''
  const n = vals.length
  return vals.map((v, i) => `${((i / (n - 1)) * W).toFixed(1)},${(props.height - (Math.min(v, top) / top) * (props.height - 2) - 1).toFixed(1)}`).join(' ')
}

const top = computed(() => props.max ?? Math.max(1, ...props.values, ...(props.values2 ?? [])))
const line1 = computed(() => points(props.values, top.value))
const line2 = computed(() => (props.values2 ? points(props.values2, top.value) : ''))
const area = computed(() => (line1.value ? `0,${props.height} ${line1.value} ${W},${props.height}` : ''))
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${height}`" preserveAspectRatio="none" class="block w-full" :style="{ height: `${height}px` }">
    <polygon v-if="area" :points="area" :fill="color" fill-opacity="0.12" />
    <polyline v-if="line1" :points="line1" fill="none" :stroke="color" stroke-width="1.5" vector-effect="non-scaling-stroke" />
    <polyline v-if="line2" :points="line2" fill="none" :stroke="color2" stroke-width="1.5" vector-effect="non-scaling-stroke" />
  </svg>
</template>
