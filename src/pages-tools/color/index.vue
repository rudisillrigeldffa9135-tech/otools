<script lang="ts" setup>
definePage({
  style: { navigationBarTitleText: '颜色转换' },
})

interface RGBA { r: number, g: number, b: number, a: number }

const PRESETS = ['#4f6ef7', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#1d2129']

const input = ref('#4f6ef7')

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

function parseColor(raw: string): RGBA | null {
  const s = raw.trim().toLowerCase()
  // HEX：#rgb #rgba #rrggbb #rrggbbaa
  let m = s.match(/^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/)
  if (m) {
    let hex = m[1]
    if (hex.length <= 4)
      hex = hex.split('').map(c => c + c).join('')
    const n = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16)
    return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) / 255 : 1 }
  }
  // rgb(a)：支持逗号或空格分隔
  m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/)
  if (m) {
    const a = m[4] ? (m[4].endsWith('%') ? Number.parseFloat(m[4]) / 100 : Number(m[4])) : 1
    return { r: clamp(+m[1], 0, 255), g: clamp(+m[2], 0, 255), b: clamp(+m[3], 0, 255), a: clamp(a, 0, 1) }
  }
  // hsl(a)
  m = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)$/)
  if (m) {
    const a = m[4] ? (m[4].endsWith('%') ? Number.parseFloat(m[4]) / 100 : Number(m[4])) : 1
    return { ...hslToRgb(+m[1], +m[2], +m[3]), a: clamp(a, 0, 1) }
  }
  return null
}

function hslToRgb(h: number, s: number, l: number) {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) }
}

function rgbToHsl({ r, g, b }: RGBA) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r)
      h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g)
      h = (b - r) / d + 2
    else
      h = (r - g) / d + 4
    h *= 60
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

const color = computed(() => parseColor(input.value))

const results = computed(() => {
  const c = color.value
  if (!c)
    return []
  const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  const { h, s, l } = rgbToHsl(c)
  const alpha = +c.a.toFixed(2)
  const hasAlpha = alpha < 1
  return [
    { label: 'HEX', value: `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${hasAlpha ? hex2(c.a * 255) : ''}` },
    { label: 'RGB', value: hasAlpha ? `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})` : `rgb(${c.r}, ${c.g}, ${c.b})` },
    { label: 'HSL', value: hasAlpha ? `hsla(${h}, ${s}%, ${l}%, ${alpha})` : `hsl(${h}, ${s}%, ${l}%)` },
    { label: 'Flutter', value: `Color(0x${(hex2(c.a * 255) + hex2(c.r) + hex2(c.g) + hex2(c.b)).toUpperCase()})` },
  ]
})

const previewColor = computed(() => results.value[1]?.value || 'transparent')
</script>

<template>
  <ot-tool-layout>
    <ot-panel title="输入">
      <view class="flex items-center gap-3">
        <view class="ot-swatch" :style="{ background: previewColor }" />
        <input v-model="input" class="ot-input ot-mono flex-1" type="text" placeholder="#4f6ef7 / rgb(79,110,247) / hsl(229,91%,64%)">
      </view>
      <view class="mt-3 flex flex-wrap gap-2">
        <view
          v-for="p in PRESETS" :key="p"
          class="ot-preset" :style="{ background: p }"
          @click="input = p"
        />
      </view>
      <view v-if="input && !color" class="mt-2 text-13px text-red-500">
        无法识别的颜色格式
      </view>
    </ot-panel>

    <ot-panel v-if="results.length" title="结果">
      <ot-result v-for="r in results" :key="r.label" :label="r.label" :value="r.value" />
    </ot-panel>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-swatch {
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: 10px;
  border: 1px solid var(--ot-border);
}

.ot-preset {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid var(--ot-border);
}
</style>
