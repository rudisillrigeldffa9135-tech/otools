<script lang="ts" setup>
// 右键浮动菜单：超出窗口时自动向左 / 向上翻转，点外面、按 Esc、滚动时关闭
import type { MenuItem } from '../lib/menu'
import { closeMenu, menu } from '../lib/menu'

const el = ref<HTMLElement>()
const pos = ref({ left: 0, top: 0 })

watch(() => [menu.open, menu.x, menu.y], async () => {
  if (!menu.open)
    return
  pos.value = { left: menu.x, top: menu.y }
  await nextTick()
  const box = el.value?.getBoundingClientRect()
  if (!box)
    return
  pos.value = {
    left: menu.x + box.width > window.innerWidth - 4 ? Math.max(4, menu.x - box.width) : menu.x,
    top: menu.y + box.height > window.innerHeight - 4 ? Math.max(4, menu.y - box.height) : menu.y,
  }
})

function run(item: MenuItem) {
  if (item.disabled)
    return
  closeMenu()
  item.action()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape')
    closeMenu()
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', closeMenu)
  window.addEventListener('blur', closeMenu)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', closeMenu)
  window.removeEventListener('blur', closeMenu)
})
</script>

<template>
  <div v-if="menu.open" class="ws-menu__mask" @mousedown="closeMenu" @contextmenu.prevent="closeMenu" @wheel="closeMenu">
    <div ref="el" class="ws-menu" :style="{ left: `${pos.left}px`, top: `${pos.top}px` }" @mousedown.stop @contextmenu.prevent>
      <template v-for="(item, i) in menu.items" :key="i">
        <div v-if="item.divider && i > 0" class="ws-menu__divider" />
        <div class="ws-menu__item" :class="{ 'is-danger': item.danger, 'is-disabled': item.disabled }" @click="run(item)">
          <span class="ws-menu__icon" :class="item.icon" />
          <span class="flex-1">{{ item.label }}</span>
          <span v-if="item.hint" class="ws-menu__hint">{{ item.hint }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ws-menu__mask {
  position: fixed;
  inset: 0;
  z-index: 1300;
}

.ws-menu {
  position: fixed;
  min-width: 180px;
  padding: 4px 0;
  border: 1px solid var(--ot-border);
  border-radius: 6px;
  font-size: 13px;
  color: var(--ot-text);
  background: var(--ot-card);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
  user-select: none;
}

.ws-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 14px 0 10px;
  cursor: default;

  &:hover:not(.is-disabled) {
    color: #fff;
    background: var(--wot-color-theme);
  }

  &.is-danger:not(:hover) {
    color: #ef4444;
  }

  &.is-disabled {
    opacity: 0.4;
  }
}

.ws-menu__icon {
  width: 16px;
  font-size: 14px;
}

.ws-menu__hint {
  margin-left: 16px;
  font-size: 11px;
  opacity: 0.6;
}

.ws-menu__divider {
  height: 1px;
  margin: 4px 0;
  background: var(--ot-border);
}
</style>
