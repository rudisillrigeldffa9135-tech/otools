<script lang="ts" setup>
import type { IPerson, ITodo, ITodoForm, ITodoList } from '@/api/todo'
import type { SortMode, ViewKey } from './views'
import { clearDoneTodos, completeTodo, createTodo, deleteTodo, getTodos, reorderTodos, updateTodo } from '@/api/todo'
import { toast } from '@/utils/common'
import { userKey } from '@/utils/user-storage'
import { today as localToday } from '../datecalc/date'
import { colorHex } from './colors'
import ListSettings from './components/list-settings.vue'
import TodoDetail from './components/todo-detail.vue'
import TodoItem from './components/todo-item.vue'
import { parseQuickAdd } from './quick-parse'
import { describeRule } from './repeat'
import { allTags, dueLabel, groupTodos, matchesView, viewCounts } from './views'

definePage({
  style: { navigationBarTitleText: '待办事项' },
})

/* ---------------- 偏好（按用户记住） ---------------- */

function readPref<T>(key: string, fallback: T): T {
  try {
    const v = uni.getStorageSync(userKey(key))
    return v === '' || v === undefined || v === null ? fallback : v as T
  }
  catch {
    return fallback
  }
}
function writePref(key: string, value: unknown) {
  try {
    uni.setStorageSync(userKey(key), value)
  }
  catch {}
}

function windowWidth() {
  // #ifdef H5
  return window.innerWidth
  // #endif
  // #ifndef H5
  return uni.getWindowInfo().windowWidth
  // #endif
}
const wide = ref(windowWidth() >= 900)

/* ---------------- 数据 ---------------- */

const lists = ref<ITodoList[]>([])
const todos = ref<ITodo[]>([])
const people = ref<IPerson[]>([])
const me = ref(0)
const loading = ref(true)
const today = ref(localToday())
const view = ref<ViewKey>(readPref<ViewKey>('ot-todo-view', 'today'))
const selectedId = ref<number | null>(null)

async function load(silent = false) {
  if (!silent)
    loading.value = true
  try {
    const data = await getTodos()
    lists.value = data.lists
    people.value = data.people
    me.value = data.me
    // 正在编辑的那一条保留本地版本，避免刷新打断输入
    const editing = selectedId.value ? todos.value.find(t => t.id === selectedId.value) : undefined
    todos.value = editing ? data.todos.map(t => (t.id === editing.id ? { ...t, title: editing.title, note: editing.note } : t)) : data.todos
    if (selectedId.value && !todos.value.some(t => t.id === selectedId.value))
      selectedId.value = null
    // 选中的清单已被删除或自己被移出
    if (view.value.startsWith('list:') && !lists.value.some(l => `list:${l.id}` === view.value))
      view.value = 'today'
  }
  catch {}
  finally {
    loading.value = false
  }
}

function personName(id: number | null) {
  if (!id)
    return ''
  const p = people.value.find(x => x.id === id)
  return p ? (p.nickname || p.username) : '已删除的用户'
}

/* ---------------- 视图 ---------------- */

const sortMode = ref<SortMode>(readPref<SortMode>('ot-todo-sort', 'smart'))
watch(view, v => writePref('ot-todo-view', v))
watch(sortMode, v => writePref('ot-todo-sort', v))

const SMART_VIEWS: { key: ViewKey, label: string, icon: string }[] = [
  { key: 'today', label: '今天', icon: 'i-carbon-sun' },
  { key: 'week', label: '未来 7 天', icon: 'i-carbon-calendar' },
  { key: 'all', label: '全部', icon: 'i-carbon-list-boxes' },
  { key: 'inbox', label: '收集箱', icon: 'i-carbon-inbox' },
  { key: 'done', label: '已完成', icon: 'i-carbon-checkmark-outline' },
]
const SORT_OPTIONS: { value: SortMode, label: string }[] = [
  { value: 'smart', label: '智能' },
  { value: 'due', label: '截止时间' },
  { value: 'priority', label: '优先级' },
  { value: 'manual', label: '手动' },
]

const counts = computed(() => viewCounts(todos.value, today.value))
const tags = computed(() => allTags(todos.value.filter(t => !t.done)))
const currentList = computed(() => view.value.startsWith('list:') ? lists.value.find(l => l.id === Number(view.value.slice(5))) : undefined)

const viewTitle = computed(() => {
  const smart = SMART_VIEWS.find(v => v.key === view.value)
  if (smart)
    return smart.label
  if (currentList.value)
    return currentList.value.name
  if (view.value.startsWith('tag:'))
    return `#${view.value.slice(4)}`
  return ''
})

const activeTodos = computed(() => todos.value.filter(t => !t.done && matchesView(t, view.value, today.value)))
const groups = computed(() => view.value === 'done'
  ? groupTodos(todos.value.filter(t => t.done), 'done', sortMode.value, today.value)
  : groupTodos(activeTodos.value, view.value, sortMode.value, today.value))

/** 列表底部折叠显示的已完成：清单 / 收集箱 / 标签里显示全部，智能视图只显示今天完成的 */
const doneInView = computed(() => {
  if (view.value === 'done')
    return []
  const v = view.value
  const startOfToday = new Date(`${today.value}T00:00:00`).getTime() / 1000
  return todos.value
    .filter((t) => {
      if (!t.done)
        return false
      if (v.startsWith('list:'))
        return t.listId === Number(v.slice(5))
      if (v === 'inbox')
        return t.listId === null
      if (v.startsWith('tag:'))
        return t.tags.includes(v.slice(4))
      return (t.doneAt ?? 0) >= startOfToday
    })
    .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
})
const showDone = ref(false)

function listOf(t: ITodo) {
  return t.listId ? lists.value.find(l => l.id === t.listId) : undefined
}

/** 智能视图、标签里显示所在清单；在清单里不用重复显示 */
function itemListName(t: ITodo) {
  if (view.value.startsWith('list:') || view.value === 'inbox')
    return ''
  return listOf(t)?.name ?? ''
}

function itemCreator(t: ITodo) {
  return t.createdBy !== me.value ? personName(t.createdBy) : ''
}

function selectView(v: ViewKey) {
  view.value = v
  showDone.value = false
  if (!wide.value)
    selectedId.value = null
}

/* ---------------- 快速添加 ---------------- */

const quickText = ref('')
const smartParse = ref<boolean>(readPref('ot-todo-smart', true))
watch(smartParse, v => writePref('ot-todo-smart', v))
const adding = ref(false)

const parsed = computed(() => smartParse.value && quickText.value.trim()
  ? parseQuickAdd(quickText.value, today.value, lists.value.map(l => l.name))
  : null)

const parsedChips = computed(() => {
  const p = parsed.value
  if (!p)
    return []
  const chips: { icon: string, text: string }[] = []
  if (p.dueDate)
    chips.push({ icon: 'i-carbon-calendar', text: dueLabel(p.dueDate, p.dueTime, today.value) })
  if (p.repeat)
    chips.push({ icon: 'i-carbon-repeat', text: describeRule(p.repeat) })
  if (p.priority)
    chips.push({ icon: 'i-carbon-flag', text: ['', '低', '中', '高'][p.priority] })
  if (p.listName)
    chips.push({ icon: 'i-carbon-list', text: p.listName })
  for (const tag of p.tags)
    chips.push({ icon: 'i-carbon-tag', text: tag })
  return chips
})

async function quickAdd() {
  const raw = quickText.value.trim()
  if (!raw || adding.value)
    return
  const p = parsed.value
  const form: ITodoForm = { title: p?.title || raw }
  if (p) {
    form.dueDate = p.dueDate
    form.dueTime = p.dueTime
    form.priority = p.priority ?? 0
    form.repeat = p.repeat
    form.tags = p.tags
    if (p.listName)
      form.listId = lists.value.find(l => l.name === p.listName)?.id ?? null
  }
  // 在某个清单 / 标签 / 今天里添加时，默认归入当前视图
  if (form.listId === undefined && currentList.value)
    form.listId = currentList.value.id
  if (view.value.startsWith('tag:'))
    form.tags = [...new Set([...(form.tags ?? []), view.value.slice(4)])]
  if (!form.dueDate && view.value === 'today')
    form.dueDate = today.value
  // 有日期时默认准时提醒（不想提醒可以在详情里关掉）
  if (form.dueDate && form.dueTime)
    form.remind = 0
  adding.value = true
  try {
    const todo = await createTodo(form)
    todos.value.push(todo)
    quickText.value = ''
  }
  catch {}
  finally {
    adding.value = false
  }
}

/* ---------------- 修改、完成、删除 ---------------- */

const selected = computed(() => todos.value.find(t => t.id === selectedId.value))
const detailOpen = computed({
  get: () => !wide.value && !!selected.value,
  set: (v) => {
    if (!v)
      selectedId.value = null
  },
})

async function applyUpdate(id: number, patch: ITodoForm) {
  const idx = todos.value.findIndex(t => t.id === id)
  if (idx < 0)
    return
  const before = todos.value[idx]
  // 先在本地生效，界面立即响应
  const local = { ...before, ...patch } as ITodo
  if (patch.dueDate === null)
    Object.assign(local, { dueTime: null, repeat: null, remind: null })
  todos.value[idx] = local
  try {
    const saved = await updateTodo(id, patch)
    const i = todos.value.findIndex(t => t.id === id)
    if (i >= 0)
      todos.value[i] = saved
  }
  catch {
    const i = todos.value.findIndex(t => t.id === id)
    if (i >= 0)
      todos.value[i] = before
  }
}

/* 撤销提示条 */
const undo = ref<{ text: string, run: () => void }>()
let undoTimer: ReturnType<typeof setTimeout> | undefined
function showUndo(text: string, run: () => void) {
  clearTimeout(undoTimer)
  undo.value = { text, run }
  undoTimer = setTimeout(() => (undo.value = undefined), 5000)
}
function runUndo() {
  const u = undo.value
  undo.value = undefined
  clearTimeout(undoTimer)
  u?.run()
}

async function toggle(t: ITodo) {
  const done = !t.done
  const idx = todos.value.findIndex(x => x.id === t.id)
  todos.value[idx] = { ...t, done, doneAt: done ? Math.floor(Date.now() / 1000) : null, doneBy: done ? me.value : null }
  try {
    const res = await completeTodo(t.id, done)
    const i = todos.value.findIndex(x => x.id === t.id)
    if (i >= 0)
      todos.value[i] = res.todo
    if (res.next)
      todos.value.push(res.next)
    if (done) {
      const nextId = res.next?.id
      showUndo(res.next ? `已完成，下一次：${dueLabel(res.next.dueDate, res.next.dueTime, today.value)}` : '已完成', async () => {
        const r = await completeTodo(t.id, false, nextId)
        const j = todos.value.findIndex(x => x.id === t.id)
        if (j >= 0)
          todos.value[j] = r.todo
        if (nextId)
          todos.value = todos.value.filter(x => x.id !== nextId)
      })
    }
  }
  catch {
    const i = todos.value.findIndex(x => x.id === t.id)
    if (i >= 0)
      todos.value[i] = t
  }
}

function remove(t: ITodo) {
  uni.showModal({
    title: '删除待办',
    content: `删除「${t.title.slice(0, 40)}」？删除后无法恢复。`,
    confirmColor: '#ef4444',
    success: async ({ confirm }) => {
      if (!confirm)
        return
      await deleteTodo(t.id)
      todos.value = todos.value.filter(x => x.id !== t.id)
      if (selectedId.value === t.id)
        selectedId.value = null
    },
  })
}

function clearDone() {
  const v = view.value
  const listId = v.startsWith('list:') ? Number(v.slice(5)) : null
  if (listId === null && v !== 'inbox')
    return
  uni.showModal({
    title: '清空已完成',
    content: `删除「${viewTitle.value}」里所有已完成的待办？删除后无法恢复（不影响统计）。`,
    confirmColor: '#ef4444',
    success: async ({ confirm }) => {
      if (!confirm)
        return
      await clearDoneTodos(listId)
      todos.value = todos.value.filter(t => !(t.done && t.listId === listId))
      toast('已清空', 'success')
    },
  })
}

/* 已完成视图：加载更早 */
const loadingMore = ref(false)
const noMore = ref(false)
async function loadMoreDone() {
  const oldest = Math.min(...todos.value.filter(t => t.done && t.doneAt).map(t => t.doneAt!), Math.floor(Date.now() / 1000))
  loadingMore.value = true
  try {
    const data = await getTodos(oldest)
    const ids = new Set(todos.value.map(t => t.id))
    const more = data.todos.filter(t => !ids.has(t.id))
    todos.value.push(...more)
    people.value = [...people.value, ...data.people.filter(p => !people.value.some(x => x.id === p.id))]
    if (more.length < 100)
      noMore.value = true
  }
  catch {}
  finally {
    loadingMore.value = false
  }
}

/* ---------------- 清单设置 ---------------- */

const settingsOpen = ref(false)
const settingsList = ref<ITodoList | null>(null)

function openListSettings(list: ITodoList | null) {
  settingsList.value = list
  settingsOpen.value = true
}

function onListSaved(list: ITodoList) {
  const i = lists.value.findIndex(l => l.id === list.id)
  if (i >= 0) {
    lists.value[i] = list
  }
  else {
    lists.value.push(list)
    selectView(`list:${list.id}`)
  }
  settingsList.value = list
}

function onListRemoved(id: number) {
  lists.value = lists.value.filter(l => l.id !== id)
  todos.value = todos.value.filter(t => t.listId !== id)
  if (view.value === `list:${id}`)
    view.value = 'today'
}

/* ---------------- 手动拖动排序（H5） ---------------- */

const dragId = ref<number | null>(null)
function startDrag(t: ITodo, e: PointerEvent) {
  // #ifdef H5
  if (sortMode.value !== 'manual')
    return
  dragId.value = t.id
  const order = activeTodos.value.slice().sort((a, b) => a.sort - b.sort || b.createdAt - a.createdAt).map(x => x.id)
  const onMove = (ev: PointerEvent) => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-todo-id]'))
    const target = els.find((el) => {
      const r = el.getBoundingClientRect()
      return ev.clientY >= r.top && ev.clientY <= r.bottom
    })
    const targetId = Number(target?.dataset.todoId)
    if (!targetId || targetId === dragId.value)
      return
    const from = order.indexOf(dragId.value!)
    const to = order.indexOf(targetId)
    if (from < 0 || to < 0)
      return
    order.splice(to, 0, order.splice(from, 1)[0])
    order.forEach((id, i) => {
      const item = todos.value.find(x => x.id === id)
      if (item)
        item.sort = i
    })
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    dragId.value = null
    reorderTodos(order).catch(() => load(true))
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  e.preventDefault()
  // #endif
}

/* ---------------- 生命周期 ---------------- */

let poller: ReturnType<typeof setInterval> | undefined
/** 有共享清单时每 30 秒刷新一次，看到其他成员的改动 */
const hasShared = computed(() => lists.value.some(l => !l.isOwner || l.members.length))

function onResize() {
  wide.value = windowWidth() >= 900
}

onLoad(() => load())
onShow(() => {
  today.value = localToday()
  if (!loading.value)
    load(true)
  poller = setInterval(() => {
    today.value = localToday()
    if (hasShared.value)
      load(true)
  }, 30_000)
  // #ifdef H5
  window.addEventListener('resize', onResize)
  // #endif
})
onHide(() => {
  clearInterval(poller)
  // #ifdef H5
  window.removeEventListener('resize', onResize)
  // #endif
})
onUnload(() => clearInterval(poller))
</script>

<template>
  <ot-tool-layout :max-width="1280">
    <view class="ot-todo" :class="{ 'is-wide': wide }">
      <!-- 侧栏：视图、清单、标签 -->
      <view v-if="wide" class="ot-todo__side">
        <view
          v-for="v in SMART_VIEWS" :key="v.key" class="ot-todo__nav" :class="{ 'is-active': view === v.key }"
          @click="selectView(v.key)"
        >
          <view :class="v.icon" class="text-16px" />
          <text class="min-w-0 flex-1">{{ v.label }}</text>
          <text v-if="counts[v.key]" class="ot-todo__count">{{ counts[v.key] }}</text>
        </view>

        <view class="ot-todo__side-title">
          <text class="flex-1">清单</text>
          <view class="i-carbon-add cursor-pointer text-16px" title="新建清单" @click="openListSettings(null)" />
        </view>
        <view
          v-for="l in lists" :key="l.id" class="ot-todo__nav" :class="{ 'is-active': view === `list:${l.id}` }"
          @click="selectView(`list:${l.id}`)"
        >
          <view class="ot-todo__dot" :style="{ background: colorHex(l.color) }" />
          <text class="min-w-0 flex-1 truncate">{{ l.name }}</text>
          <view v-if="!l.isOwner || l.members.length" class="i-carbon-user-multiple text-13px text-muted" title="共享清单" />
          <text v-if="counts[`list:${l.id}`]" class="ot-todo__count">{{ counts[`list:${l.id}`] }}</text>
        </view>
        <view v-if="!lists.length" class="px-2 py-1 text-12px text-muted">
          还没有清单
        </view>

        <template v-if="tags.length">
          <view class="ot-todo__side-title">
            标签
          </view>
          <view class="flex flex-wrap gap-1.5 px-1">
            <view
              v-for="tag in tags" :key="tag" class="ot-todo__tag" :class="{ 'is-active': view === `tag:${tag}` }"
              @click="selectView(`tag:${tag}`)"
            >
              #{{ tag }}
            </view>
          </view>
        </template>
      </view>

      <!-- 主区域 -->
      <view class="ot-todo__main">
        <!-- 窄屏：视图切换 -->
        <ot-hscroll v-if="!wide" class="mb-3 whitespace-nowrap">
          <view v-for="v in SMART_VIEWS" :key="v.key" class="ot-todo__chip" :class="{ 'is-active': view === v.key }" @click="selectView(v.key)">
            {{ v.label }}<text v-if="counts[v.key]" class="ml-1 opacity-70">{{ counts[v.key] }}</text>
          </view>
          <view v-for="l in lists" :key="l.id" class="ot-todo__chip" :class="{ 'is-active': view === `list:${l.id}` }" @click="selectView(`list:${l.id}`)">
            <view class="ot-todo__dot mr-1" :style="{ background: colorHex(l.color) }" />{{ l.name }}
          </view>
          <view v-for="tag in tags" :key="tag" class="ot-todo__chip" :class="{ 'is-active': view === `tag:${tag}` }" @click="selectView(`tag:${tag}`)">
            #{{ tag }}
          </view>
          <view class="ot-todo__chip" @click="openListSettings(null)">
            <view class="i-carbon-add mr-0.5" />清单
          </view>
        </ot-hscroll>

        <view class="ot-todo__head">
          <text class="ot-todo__title">{{ viewTitle }}</text>
          <view v-if="currentList" class="ot-todo__icon-btn" :title="currentList.isOwner ? '清单设置与共享' : '清单信息'" @click="openListSettings(currentList)">
            <view :class="currentList.members.length || !currentList.isOwner ? 'i-carbon-user-multiple' : 'i-carbon-settings'" />
          </view>
          <view class="flex-1" />
          <picker v-if="view !== 'done'" :range="SORT_OPTIONS" range-key="label" :value="SORT_OPTIONS.findIndex(s => s.value === sortMode)" @change="sortMode = SORT_OPTIONS[Number($event.detail.value)].value">
            <view class="ot-todo__sort">
              <view class="i-carbon-sort-ascending" />{{ SORT_OPTIONS.find(s => s.value === sortMode)?.label }}
            </view>
          </picker>
        </view>

        <!-- 快速添加 -->
        <view v-if="view !== 'done'" class="ot-todo__add">
          <view class="ot-todo__add-row">
            <view class="i-carbon-add text-18px text-[var(--wot-color-theme)]" />
            <input
              v-model="quickText" class="min-w-0 flex-1 text-14px" :maxlength="500" confirm-type="done" :confirm-hold="true"
              :placeholder="smartParse ? '添加待办，如：明天下午3点 交周报 !高 #工作' : '添加待办，回车确认'" @confirm="quickAdd"
            >
            <view class="ot-todo__smart" :class="{ 'is-on': smartParse }" :title="smartParse ? '智能识别：开' : '智能识别：关'" @click="smartParse = !smartParse">
              <view class="i-carbon-magic-wand" />
            </view>
            <wd-button size="small" :loading="adding" :disabled="!quickText.trim()" @click="quickAdd">
              添加
            </wd-button>
          </view>
          <view v-if="parsedChips.length" class="ot-todo__parsed">
            <text class="text-muted">识别到：</text>
            <view v-for="(c, i) in parsedChips" :key="i" class="ot-todo__parsed-chip">
              <view :class="c.icon" />{{ c.text }}
            </view>
          </view>
        </view>

        <!-- 列表 -->
        <view v-if="loading" class="py-12 text-center text-13px text-muted">
          加载中…
        </view>
        <template v-else>
          <view v-for="g in groups" :key="g.key" class="ot-todo__group">
            <view v-if="g.title" class="ot-todo__group-title" :class="{ 'is-danger': g.danger }">
              {{ g.title }} <text class="opacity-60">{{ g.items.length }}</text>
            </view>
            <view v-for="t in g.items" :key="t.id" :data-todo-id="t.id" :class="{ 'is-dragging': dragId === t.id }">
              <todo-item
                :todo="t" :today="today" :active="selectedId === t.id" :list-name="itemListName(t)" :list-color="colorHex(listOf(t)?.color ?? '')"
                :creator="itemCreator(t)" :draggable="sortMode === 'manual' && view !== 'done'"
                @toggle="toggle(t)" @open="selectedId = t.id" @dragstart="startDrag(t, $event)"
              />
            </view>
          </view>

          <view v-if="!groups.length || (groups.length === 1 && !groups[0].items.length)" class="ot-todo__empty">
            <view :class="view === 'done' ? 'i-carbon-checkmark-outline' : 'i-carbon-task-complete'" class="text-40px text-muted" />
            <text class="mt-2 text-13px text-muted">{{ view === 'done' ? '最近 30 天没有完成的待办' : view === 'today' ? '今天没有待办，休息一下吧' : '这里还没有待办' }}</text>
          </view>

          <view v-if="view === 'done' && groups.length" class="py-3 text-center">
            <text v-if="!noMore" class="ot-todo__link" @click="loadMoreDone">{{ loadingMore ? '加载中…' : '加载更早的' }}</text>
            <text v-else class="text-12px text-muted">没有更多了（已完成的待办保留 180 天）</text>
          </view>

          <!-- 已完成（折叠） -->
          <view v-if="doneInView.length" class="ot-todo__done">
            <view class="ot-todo__done-head" @click="showDone = !showDone">
              <view :class="showDone ? 'i-carbon-chevron-down' : 'i-carbon-chevron-right'" />
              <text class="flex-1">{{ ['today', 'week', 'all'].includes(view) ? '今天已完成' : '已完成' }} {{ doneInView.length }}</text>
              <text v-if="showDone && (view === 'inbox' || view.startsWith('list:'))" class="ot-todo__link text-12px" @click.stop="clearDone">清空</text>
            </view>
            <template v-if="showDone">
              <todo-item
                v-for="t in doneInView" :key="t.id" :todo="t" :today="today" :active="selectedId === t.id"
                :list-name="itemListName(t)" :list-color="colorHex(listOf(t)?.color ?? '')" :creator="itemCreator(t)"
                @toggle="toggle(t)" @open="selectedId = t.id"
              />
            </template>
          </view>
        </template>
      </view>

      <!-- 宽屏：右侧详情 -->
      <view v-if="wide && selected" class="ot-todo__detail">
        <todo-detail
          :todo="selected" :lists="lists" :today="today" :person-name="personName" :me="me"
          @update="applyUpdate(selected.id, $event)" @toggle="toggle(selected)" @remove="remove(selected)" @close="selectedId = null"
        />
      </view>
    </view>

    <!-- 窄屏：详情弹出层 -->
    <wd-popup v-model="detailOpen" position="bottom" :z-index="1000" custom-style="border-radius: 16px 16px 0 0; max-height: 88vh;">
      <scroll-view v-if="selected" scroll-y class="ot-todo__sheet">
        <todo-detail
          :todo="selected" :lists="lists" :today="today" :person-name="personName" :me="me"
          @update="applyUpdate(selected.id, $event)" @toggle="toggle(selected)" @remove="remove(selected)" @close="selectedId = null"
        />
      </scroll-view>
    </wd-popup>

    <list-settings v-model="settingsOpen" :list="settingsList" :me="me" @saved="onListSaved" @removed="onListRemoved" />

    <!-- 撤销提示 -->
    <view v-if="undo" class="ot-todo__undo">
      <text class="min-w-0 flex-1 truncate">{{ undo.text }}</text>
      <text class="ot-todo__undo-btn" @click="runUndo">撤销</text>
    </view>
  </ot-tool-layout>
</template>

<style lang="scss" scoped>
.ot-todo {
  display: flex;
  flex-direction: column;
  gap: 12px;

  &.is-wide {
    flex-direction: row;
    align-items: flex-start;
  }
}

.ot-todo__side {
  position: sticky;
  top: 72px;
  flex-shrink: 0;
  box-sizing: border-box;
  width: 220px;
  max-height: calc(100vh - 96px);
  padding: 10px;
  overflow-y: auto;
  border-radius: 14px;
  background: var(--ot-card);
  border: 1px solid var(--ot-border);
}

.ot-todo__nav {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--ot-text-2);
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
  }

  &.is-active {
    color: var(--wot-color-theme);
    background: rgba(79, 110, 247, 0.08);
    font-weight: 600;
  }
}

.ot-todo__count {
  font-size: 12px;
  color: var(--ot-text-3);
}

.ot-todo__side-title {
  display: flex;
  align-items: center;
  margin: 14px 10px 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ot-text-3);
}

.ot-todo__dot {
  display: inline-block;
  flex-shrink: 0;
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.ot-todo__tag {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--ot-text-2);
  background: var(--ot-fill);
  cursor: pointer;

  &.is-active {
    color: #fff;
    background: var(--wot-color-theme);
  }
}

.ot-todo__main {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  padding: 14px;
  border-radius: 14px;
  background: var(--ot-card);
  border: 1px solid var(--ot-border);
}

.ot-todo__chip {
  display: inline-flex;
  align-items: center;
  margin-right: 6px;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 13px;
  color: var(--ot-text-2);
  background: var(--ot-fill);

  &.is-active {
    color: #fff;
    background: var(--wot-color-theme);
  }
}

.ot-todo__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.ot-todo__title {
  font-size: 18px;
  font-weight: 700;
  color: var(--ot-text);
}

.ot-todo__icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  font-size: 16px;
  color: var(--ot-text-2);
  cursor: pointer;

  &:hover {
    color: var(--wot-color-theme);
    background: var(--ot-fill);
  }
}

.ot-todo__sort {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--ot-text-2);
  background: var(--ot-fill);
}

.ot-todo__add {
  margin-bottom: 8px;
  padding: 6px 6px 6px 12px;
  border-radius: 12px;
  border: 1px solid var(--ot-border);
  background: var(--ot-card);

  &:focus-within {
    border-color: var(--wot-color-theme);
  }
}

.ot-todo__add-row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ot-text);
}

.ot-todo__smart {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  font-size: 15px;
  color: var(--ot-text-3);
  cursor: pointer;

  &.is-on {
    color: var(--wot-color-theme);
  }
}

.ot-todo__parsed {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  padding: 6px 2px 2px 26px;
  font-size: 12px;
}

.ot-todo__parsed-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 8px;
  border-radius: 999px;
  color: var(--wot-color-theme);
  background: rgba(79, 110, 247, 0.1);
}

.ot-todo__group {
  margin-top: 6px;
}

.ot-todo__group-title {
  padding: 8px 10px 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ot-text-3);

  &.is-danger {
    color: #ef4444;
  }
}

.is-dragging {
  opacity: 0.5;
}

.ot-todo__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 16px;
}

.ot-todo__done {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px dashed var(--ot-border);
}

.ot-todo__done-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 13px;
  color: var(--ot-text-3);
  cursor: pointer;
}

.ot-todo__link {
  font-size: 13px;
  color: var(--wot-color-theme);
  cursor: pointer;
}

.ot-todo__detail {
  position: sticky;
  top: 72px;
  flex-shrink: 0;
  box-sizing: border-box;
  width: 380px;
  max-height: calc(100vh - 96px);
  padding: 16px;
  overflow-y: auto;
  border-radius: 14px;
  background: var(--ot-card);
  border: 1px solid var(--ot-border);
}

.ot-todo__sheet {
  box-sizing: border-box;
  max-height: 88vh;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.ot-todo__undo {
  position: fixed;
  left: 50%;
  bottom: calc(24px + env(safe-area-inset-bottom));
  z-index: 1200;
  display: flex;
  align-items: center;
  gap: 16px;
  box-sizing: border-box;
  width: min(92vw, 420px);
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 14px;
  color: #fff;
  background: rgba(17, 19, 23, 0.92);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  transform: translateX(-50%);
}

.ot-todo__undo-btn {
  flex-shrink: 0;
  font-weight: 600;
  color: #8fa6ff;
  cursor: pointer;
}
</style>
