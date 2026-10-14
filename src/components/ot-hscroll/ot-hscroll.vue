<script setup lang="ts">
/**
 * 横向滚动容器（不显示滚动条）。
 * scroll-view 在电脑上只能触控板横滑：鼠标滚轮滚不动、按住也拖不动，内容超出就点不到后面的项。
 * H5 改用普通容器：竖向滚轮转为横向滚动，鼠标按住可以拖动（拖动后不会误触发点击）；
 * 手机上仍是原生的手指滑动。小程序 / App 继续用 scroll-view。
 */

// #ifdef H5
const DRAG_THRESHOLD = 5

let startX = 0
let startScroll = 0
let pointerId: number | null = null
let moved = false

function onWheel(e: WheelEvent) {
  const el = e.currentTarget as HTMLElement
  if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) >= Math.abs(e.deltaY))
    return
  const max = el.scrollWidth - el.clientWidth
  // 已经滚到头时把滚轮还给页面，免得卡住页面的上下滚动
  if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1))
    return
  e.preventDefault()
  el.scrollLeft += e.deltaY
}

function onPointerDown(e: PointerEvent) {
  // 触摸用原生滑动即可，这里只处理鼠标
  if (e.pointerType !== 'mouse' || e.button !== 0)
    return
  const el = e.currentTarget as HTMLElement
  if (el.scrollWidth <= el.clientWidth)
    return
  pointerId = e.pointerId
  startX = e.clientX
  startScroll = el.scrollLeft
  moved = false
}

function onPointerMove(e: PointerEvent) {
  if (pointerId !== e.pointerId)
    return
  const el = e.currentTarget as HTMLElement
  const dx = e.clientX - startX
  if (!moved && Math.abs(dx) < DRAG_THRESHOLD)
    return
  if (!moved) {
    moved = true
    el.setPointerCapture(e.pointerId)
    el.classList.add('is-dragging')
  }
  el.scrollLeft = startScroll - dx
}

function onPointerUp(e: PointerEvent) {
  if (pointerId !== e.pointerId)
    return
  pointerId = null;
  (e.currentTarget as HTMLElement).classList.remove('is-dragging')
}

/** 拖动结束时松开鼠标会触发一次 click，拦掉它，避免误点到标签 */
function onClickCapture(e: MouseEvent) {
  if (!moved)
    return
  moved = false
  e.stopPropagation()
  e.preventDefault()
}
// #endif
</script>

<template>
  <!-- #ifdef H5 -->
  <div
    class="ot-hscroll"
    @wheel="onWheel" @pointerdown="onPointerDown" @pointermove="onPointerMove"
    @pointerup="onPointerUp" @pointercancel="onPointerUp" @click.capture="onClickCapture"
  >
    <slot />
  </div>
  <!-- #endif -->
  <!-- #ifndef H5 -->
  <scroll-view scroll-x :show-scrollbar="false" class="ot-hscroll">
    <slot />
  </scroll-view>
  <!-- #endif -->
</template>

<style lang="scss" scoped>
.ot-hscroll {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }

  &.is-dragging {
    cursor: grabbing;
    user-select: none;
  }
}
</style>
