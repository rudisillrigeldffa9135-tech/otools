<script lang="ts" setup>
// 历史版本：列出某条便签的历史快照，可预览、复制、恢复，或清空
import type { INote, INoteVersion, INoteVersionList } from '@/api/notes'
import dayjs from 'dayjs'
import { clearVersions, getVersion, listVersions, restoreVersion } from '@/api/notes'
import { copyText, toast } from '@/utils/common'
import MdView from './md-view.vue'

const props = defineProps<{
  noteId?: number
  /** 当前正文，用来提示「与当前相同」 */
  currentContent: string
  /** 宽屏左右分栏，窄屏先列表后详情 */
  wide: boolean
}>()

const emit = defineEmits<{ restored: [note: INote] }>()

const open = defineModel<boolean>({ required: true })

const data = ref<INoteVersionList>()
const loading = ref(false)
const selected = ref<INoteVersion>()
const selecting = ref(0)
const view = ref<'render' | 'source'>('render')
const restoring = ref(false)

const VIEW_OPTIONS = [
  { value: 'render', label: '预览' },
  { value: 'source', label: '源码' },
]

function formatBytes(n: number) {
  return n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`
}

function relative(sec: number) {
  const d = dayjs(sec * 1000)
  const diff = Date.now() / 1000 - sec
  if (diff < 3600)
    return `${Math.max(1, Math.round(diff / 60))} 分钟前`
  if (d.isSame(dayjs(), 'day'))
    return `今天 ${d.format('HH:mm')}`
  if (d.isSame(dayjs().subtract(1, 'day'), 'day'))
    return `昨天 ${d.format('HH:mm')}`
  return d.format(d.isSame(dayjs(), 'year') ? 'MM-DD HH:mm' : 'YYYY-MM-DD HH:mm')
}

async function load() {
  if (!props.noteId)
    return
  loading.value = true
  selected.value = undefined
  try {
    data.value = await listVersions(props.noteId)
    if (props.wide && data.value.items.length)
      select(data.value.items[0].id)
  }
  catch {}
  finally {
    loading.value = false
  }
}

async function select(id: number) {
  if (!props.noteId)
    return
  selecting.value = id
  try {
    selected.value = await getVersion(props.noteId, id)
  }
  catch {}
  finally {
    selecting.value = 0
  }
}

const sameAsCurrent = computed(() => selected.value?.content === props.currentContent)
const delta = computed(() => {
  if (!selected.value)
    return ''
  const d = selected.value.size - props.currentContent.length
  return d === 0 ? '字数与当前相同' : d > 0 ? `比当前多 ${d} 字` : `比当前少 ${-d} 字`
})

function restore() {
  const v = selected.value
  if (!v || !props.noteId)
    return
  uni.showModal({
    title: '恢复到这个版本',
    content: `将便签恢复为 ${dayjs(v.createdAt * 1000).format('MM-DD HH:mm')} 的内容。当前内容会先保存为一个历史版本，之后还能再恢复回来。`,
    success: async ({ confirm }) => {
      if (!confirm)
        return
      restoring.value = true
      try {
        const note = await restoreVersion(props.noteId!, v.id)
        emit('restored', note)
        open.value = false
        toast('已恢复', 'success')
      }
      catch {}
      finally {
        restoring.value = false
      }
    },
  })
}

function clearAll() {
  if (!props.noteId)
    return
  uni.showModal({
    title: '清空历史版本',
    content: '删除这条便签的全部历史版本，删除后无法恢复。便签本身不受影响。',
    confirmColor: '#ef4444',
    success: async ({ confirm }) => {
      if (!confirm)
        return
      await clearVersions(props.noteId!)
      toast('已清空', 'success')
      load()
    },
  })
}

watch(open, (v) => {
  if (v)
    load()
  else
    selected.value = undefined
})
</script>

<template>
  <wd-popup
    v-model="open" position="center" :z-index="1000"
    :custom-style="`border-radius: 16px; width: ${wide ? 'min(94vw, 980px)' : '94vw'}; overflow: hidden;`"
  >
    <view class="ot-nh" :class="{ 'is-wide': wide }">
      <view class="ot-nh__head">
        <view v-if="!wide && selected" class="i-carbon-arrow-left cursor-pointer text-18px text-sub" @click="selected = undefined" />
        <view v-else class="i-carbon-recently-viewed text-18px text-[var(--wot-color-theme)]" />
        <text class="flex-1 text-16px text-main font-600">历史版本</text>
        <view class="i-carbon-close cursor-pointer text-18px text-muted" @click="open = false" />
      </view>

      <view class="ot-nh__body">
        <!-- 版本列表 -->
        <view v-if="wide || !selected" class="ot-nh__list">
          <view v-if="loading" class="py-10 text-center text-13px text-muted">
            加载中…
          </view>
          <view v-else-if="!data?.items.length" class="ot-nh__empty">
            还没有历史版本。修改便签后会自动保存修改前的内容（同一便签 {{ data?.limits.intervalMinutes ?? 10 }} 分钟内的连续修改只保留一个版本）
          </view>
          <view
            v-for="v in data?.items" :key="v.id" class="ot-nh__item"
            :class="{ 'is-active': selected?.id === v.id }" @click="select(v.id)"
          >
            <text class="text-13px text-main">{{ relative(v.createdAt) }}</text>
            <text class="text-11px text-muted">{{ dayjs(v.createdAt * 1000).format('YYYY-MM-DD HH:mm') }} · {{ v.size }} 字</text>
            <view v-if="selecting === v.id" class="i-carbon-renew ot-nh__spin animate-spin text-12px text-muted" />
          </view>
        </view>

        <!-- 版本内容 -->
        <view v-if="wide || selected" class="ot-nh__detail">
          <template v-if="selected">
            <view class="ot-nh__toolbar">
              <ot-segmented v-model="view" :options="VIEW_OPTIONS" size="small" />
              <text class="min-w-0 flex-1 truncate text-12px text-muted">{{ sameAsCurrent ? '与当前内容相同' : delta }}</text>
              <wd-button size="small" type="info" plain @click="copyText(selected.content)">
                复制
              </wd-button>
              <wd-button size="small" :loading="restoring" :disabled="sameAsCurrent" @click="restore">
                恢复此版本
              </wd-button>
            </view>
            <scroll-view scroll-y class="ot-nh__content">
              <md-view v-if="view === 'render'" :source="selected.content" />
              <text v-else class="ot-nh__source ot-mono" user-select selectable>{{ selected.content }}</text>
            </scroll-view>
          </template>
          <view v-else class="ot-nh__empty">
            选择左侧的版本查看内容
          </view>
        </view>
      </view>

      <view class="ot-nh__foot">
        <text class="min-w-0 flex-1">
          <template v-if="data">
            历史共占用 {{ formatBytes(data.usedBytes) }} / {{ formatBytes(data.maxBytes) }} ·
            每条最多 {{ data.limits.perNote }} 个版本，保留 {{ data.limits.retentionDays }} 天，超出后自动删除最旧的
          </template>
        </text>
        <text v-if="data?.items.length" class="ot-nh__clear" @click="clearAll">清空本便签历史</text>
      </view>
    </view>
  </wd-popup>
</template>

<style lang="scss" scoped>
.ot-nh {
  display: flex;
  flex-direction: column;
  height: min(80vh, 680px);
  background: var(--ot-card);
}

.ot-nh__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--ot-border);
}

.ot-nh__body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.ot-nh__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-height: 0;
  padding: 8px;
  overflow-y: auto;

  .is-wide & {
    flex: 0 0 230px;
    border-right: 1px solid var(--ot-border);
  }
}

.ot-nh__item {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
  }

  &.is-active {
    background: rgba(79, 110, 247, 0.08);
  }
}

.ot-nh__spin {
  position: absolute;
  top: 10px;
  right: 10px;
}

.ot-nh__detail {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.ot-nh__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--ot-border);
}

.ot-nh__content {
  flex: 1;
  min-height: 0;
  height: 100%;
  box-sizing: border-box;
  padding: 4px 16px 16px;
}

.ot-nh__source {
  display: block;
  padding-top: 10px;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--ot-text);
}

.ot-nh__empty {
  padding: 32px 16px;
  font-size: 13px;
  line-height: 1.7;
  text-align: center;
  color: var(--ot-text-3);
}

.ot-nh__foot {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-top: 1px solid var(--ot-border);
  font-size: 12px;
  line-height: 1.6;
  color: var(--ot-text-3);
}

.ot-nh__clear {
  flex-shrink: 0;
  color: #ef4444;
  cursor: pointer;
}
</style>
