<script setup lang="ts">
/**
 * 滑块。wd-slider 只监听触摸事件，电脑上用鼠标拖不动、点轨道也没反应，
 * 所以 H5 用 Pointer Events 自己实现（鼠标 / 触摸 / 触控笔都能拖，点轨道直接跳到该位置，支持方向键）；
 * 小程序 / App 只有触摸操作，继续用 wd-slider。
 */
const props = withDefaults(defineProps<{
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}>(), {
  min: 0,
  max: 100,
  step: 1,
  disabled: false,
})

const emit = defineEmits<{
  /** 拖动结束 / 键盘调整后触发 */
  change: [value: number]
}>()

const model = defineModel<number>({ required: true })

/** 对齐到步长并限制在范围内（避免 0.1 + 0.2 这类浮点误差） */
function snap(value: number) {
  const { min, max, step } = props
  const decimals = (String(step).split('.')[1] || '').length
  const stepped = Math.round((value - min) / step) * step + min
  return Number(Math.min(max, Math.max(min, stepped)).toFixed(decimals))
}

const percent = computed(() => props.max > props.min ? (snap(model.value) - props.min) / (props.max - props.min) * 100 : 0)

// #ifdef H5
const trackRef = ref<HTMLElement>()
const dragging = ref(false)

function update(value: number) {
  if (value !== model.value)
    model.value = value
}

function valueAt(clientX: number) {
  const rect = trackRef.value!.getBoundingClientRect()
  const ratio = rect.width ? (clientX - rect.left) / rect.width : 0
  return snap(props.min + ratio * (props.max - props.min))
}

function onPointerDown(e: PointerEvent) {
  if (props.disabled || e.button !== 0)
    return
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  el.focus({ preventScroll: true })
  dragging.value = true
  update(valueAt(e.clientX))
}

function onPointerMove(e: PointerEvent) {
  if (dragging.value)
    update(valueAt(e.clientX))
}

function onPointerUp() {
  if (!dragging.value)
    return
  dragging.value = false
  emit('change', model.value)
}

function onKeydown(e: KeyboardEvent) {
  if (props.disabled)
    return
  const { min, max, step } = props
  const big = Math.max(step, (max - min) / 10)
  const delta: Record<string, number> = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -big, PageUp: big }
  let next: number
  if (e.key in delta)
    next = snap(model.value + delta[e.key])
  else if (e.key === 'Home')
    next = min
  else if (e.key === 'End')
    next = max
  else
    return
  e.preventDefault()
  update(next)
  emit('change', next)
}
// #endif
</script>

<template>
  <!-- #ifdef H5 -->
  <div
    class="ot-slider" :class="{ 'is-disabled': disabled, 'is-dragging': dragging }"
    role="slider" :tabindex="disabled ? -1 : 0"
    :aria-valuemin="min" :aria-valuemax="max" :aria-valuenow="model" :aria-disabled="disabled"
    @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp"
    @keydown="onKeydown"
  >
    <div ref="trackRef" class="ot-slider__track">
      <div class="ot-slider__fill" :style="{ width: `${percent}%` }" />
      <div class="ot-slider__thumb" :style="{ left: `${percent}%` }" />
    </div>
  </div>
  <!-- #endif -->
  <!-- #ifndef H5 -->
  <wd-slider v-model="model" :min="min" :max="max" :step="step" :disabled="disabled" hide-min-max hide-label @dragend="emit('change', model)" />
  <!-- #endif -->
</template>

<style lang="scss" scoped>
.ot-slider {
  position: relative;
  // 左右留出半个滑块的宽度，拖到两端时滑块不会超出
  padding: 12px 10px;
  cursor: pointer;
  outline: none;
  // 允许上下滑动页面，横向拖动交给滑块
  touch-action: pan-y;
  user-select: none;
  -webkit-tap-highlight-color: transparent;

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.ot-slider__track {
  position: relative;
  height: 4px;
  border-radius: 2px;
  background: var(--ot-border, #e5e7eb);
}

.ot-slider__fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 2px;
  background: var(--wot-color-theme, #4f6ef7);
}

.ot-slider__thumb {
  position: absolute;
  top: 50%;
  width: 20px;
  height: 20px;
  box-sizing: border-box;
  border-radius: 50%;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  transform: translate(-50%, -50%);
  transition:
    box-shadow 0.15s,
    transform 0.15s;

  .ot-slider:hover:not(.is-disabled) &,
  .ot-slider.is-dragging & {
    transform: translate(-50%, -50%) scale(1.1);
  }

  .ot-slider:focus-visible & {
    box-shadow:
      0 0 0 4px rgba(79, 110, 247, 0.25),
      0 1px 4px rgba(0, 0, 0, 0.2);
  }
}
</style>
