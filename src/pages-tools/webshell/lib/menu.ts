/**
 * 右键菜单（仿 FinalShell）：电脑上在鼠标位置弹出浮动菜单，手机上改用底部操作菜单。
 * 由 components/ws-menu.vue 渲染，全页只有一个。
 */

export interface MenuItem {
  label: string
  icon?: string
  /** 快捷键提示，只用于显示 */
  hint?: string
  danger?: boolean
  disabled?: boolean
  /** 在这一项之前画分隔线 */
  divider?: boolean
  action: () => void
}

export const menu = reactive({
  open: false,
  x: 0,
  y: 0,
  items: [] as MenuItem[],
})

export function openMenu(e: { clientX: number, clientY: number, preventDefault?: () => void, stopPropagation?: () => void }, items: MenuItem[]) {
  e.preventDefault?.()
  e.stopPropagation?.()
  const list = items.filter(i => !i.disabled)
  if (!list.length)
    return
  if (window.innerWidth < 640 || matchMedia('(pointer: coarse)').matches) {
    uni.showActionSheet({ itemList: list.map(i => i.label), success: ({ tapIndex }) => list[tapIndex]?.action() })
    return
  }
  menu.items = items
  menu.x = e.clientX
  menu.y = e.clientY
  menu.open = true
}

export function closeMenu() {
  menu.open = false
}
