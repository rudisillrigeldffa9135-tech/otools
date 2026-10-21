<script lang="ts" setup>
// 便签文件夹：顶部筛选（全部 / 未分类 / 各文件夹）与管理弹窗（新建、重命名、删除）
import type { INoteFolder } from '@/api/notes'
import { createFolder, deleteFolder, renameFolder } from '@/api/notes'
import { toast } from '@/utils/common'

type FolderFilter = 'all' | 'none' | number

const props = defineProps<{
  folders: INoteFolder[]
  /** 各分组的便签数：all、none、文件夹 id */
  counts: Record<string, number>
}>()

const emit = defineEmits<{
  'update:folders': [folders: INoteFolder[]]
  /** 文件夹被删除，其中的便签已移到未分类 */
  'deleted': [id: number]
}>()

const active = defineModel<FolderFilter>({ required: true })

const MAX_NAME = 30

/* ---------------- 管理弹窗 ---------------- */

const manageOpen = ref(false)
const newName = ref('')
const creating = ref(false)
const editingId = ref(0)
const editingName = ref('')

async function add() {
  const name = newName.value.trim()
  if (!name)
    return toast('请填写文件夹名称')
  creating.value = true
  try {
    const folder = await createFolder(name)
    emit('update:folders', [...props.folders, folder])
    newName.value = ''
  }
  catch {}
  finally {
    creating.value = false
  }
}

function startRename(f: INoteFolder) {
  editingId.value = f.id
  editingName.value = f.name
}

async function saveRename() {
  const id = editingId.value
  const name = editingName.value.trim()
  if (!id)
    return
  if (!name)
    return toast('请填写文件夹名称')
  try {
    const folder = await renameFolder(id, name)
    emit('update:folders', props.folders.map(f => (f.id === id ? folder : f)))
    editingId.value = 0
  }
  catch {}
}

function remove(f: INoteFolder) {
  uni.showModal({
    title: '删除文件夹',
    content: `删除「${f.name}」？其中的 ${props.counts[f.id] ?? 0} 条便签会移到「未分类」，不会被删除。`,
    confirmColor: '#ef4444',
    success: async ({ confirm }) => {
      if (!confirm)
        return
      await deleteFolder(f.id)
      emit('update:folders', props.folders.filter(x => x.id !== f.id))
      emit('deleted', f.id)
      if (active.value === f.id)
        active.value = 'all'
    },
  })
}

function openManage() {
  editingId.value = 0
  newName.value = ''
  manageOpen.value = true
}

defineExpose({ openManage })
</script>

<template>
  <view class="ot-nf">
    <ot-hscroll class="min-w-0 flex-1 whitespace-nowrap">
      <view class="ot-nf__chip" :class="{ 'is-active': active === 'all' }" @click="active = 'all'">
        全部 <text class="ot-nf__count">{{ counts.all ?? 0 }}</text>
      </view>
      <view v-if="folders.length" class="ot-nf__chip" :class="{ 'is-active': active === 'none' }" @click="active = 'none'">
        未分类 <text class="ot-nf__count">{{ counts.none ?? 0 }}</text>
      </view>
      <view
        v-for="f in folders" :key="f.id" class="ot-nf__chip" :class="{ 'is-active': active === f.id }"
        :title="f.name" @click="active = f.id"
      >
        <view class="i-carbon-folder text-13px" />{{ f.name }} <text class="ot-nf__count">{{ counts[f.id] ?? 0 }}</text>
      </view>
    </ot-hscroll>
    <view class="ot-nf__manage" title="管理文件夹" @click="openManage">
      <view class="i-carbon-folder-add" />
    </view>

    <wd-popup v-model="manageOpen" position="center" custom-style="border-radius: 16px; width: min(92vw, 400px);">
      <view class="ot-nf__panel">
        <view class="flex items-center gap-2">
          <view class="i-carbon-folders text-18px text-[var(--wot-color-theme)]" />
          <text class="flex-1 text-16px text-main font-600">管理文件夹</text>
          <view class="i-carbon-close cursor-pointer text-18px text-muted" @click="manageOpen = false" />
        </view>

        <view class="mt-4 flex items-center gap-2">
          <view class="ot-nf__input">
            <input v-model="newName" class="min-w-0 flex-1 text-14px" placeholder="新文件夹名称" :maxlength="MAX_NAME" confirm-type="done" @confirm="add">
          </view>
          <wd-button size="small" :loading="creating" @click="add">
            新建
          </wd-button>
        </view>

        <view class="ot-nf__list">
          <view v-if="!folders.length" class="py-6 text-center text-13px text-muted">
            还没有文件夹
          </view>
          <view v-for="f in folders" :key="f.id" class="ot-nf__row">
            <view class="i-carbon-folder shrink-0 text-16px text-muted" />
            <template v-if="editingId === f.id">
              <view class="ot-nf__input min-w-0 flex-1">
                <input v-model="editingName" class="min-w-0 flex-1 text-14px" :maxlength="MAX_NAME" :focus="true" confirm-type="done" @confirm="saveRename">
              </view>
              <text class="ot-nf__link" @click="saveRename">保存</text>
              <text class="ot-nf__link is-muted" @click="editingId = 0">取消</text>
            </template>
            <template v-else>
              <text class="min-w-0 flex-1 truncate text-14px text-main">{{ f.name }}</text>
              <text class="shrink-0 text-12px text-muted">{{ counts[f.id] ?? 0 }} 条</text>
              <view class="ot-nf__icon" title="重命名" @click="startRename(f)">
                <view class="i-carbon-edit" />
              </view>
              <view class="ot-nf__icon is-danger" title="删除" @click="remove(f)">
                <view class="i-carbon-trash-can" />
              </view>
            </template>
          </view>
        </view>
        <text class="mt-3 block text-12px text-muted">删除文件夹不会删除其中的便签，便签会移到「未分类」。</text>
      </view>
    </wd-popup>
  </view>
</template>

<style lang="scss" scoped>
.ot-nf {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ot-nf__chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 160px;
  margin-right: 6px;
  padding: 4px 10px;
  overflow: hidden;
  border-radius: 999px;
  font-size: 12px;
  text-overflow: ellipsis;
  color: var(--ot-text-2);
  background: var(--ot-fill);
  cursor: pointer;

  &.is-active {
    color: #fff;
    background: var(--wot-color-theme);

    .ot-nf__count {
      color: rgba(255, 255, 255, 0.8);
    }
  }
}

.ot-nf__count {
  font-size: 11px;
  color: var(--ot-text-3);
}

.ot-nf__manage {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 26px;
  border-radius: 8px;
  font-size: 16px;
  color: var(--ot-text-2);
  cursor: pointer;

  &:hover {
    color: var(--wot-color-theme);
    background: var(--ot-fill);
  }
}

.ot-nf__panel {
  padding: 18px;
}

.ot-nf__input {
  display: flex;
  flex: 1;
  align-items: center;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--ot-text);
  background: var(--ot-fill);
}

.ot-nf__list {
  display: flex;
  flex-direction: column;
  max-height: 50vh;
  margin-top: 12px;
  overflow-y: auto;
}

.ot-nf__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;

  & + & {
    border-top: 1px solid var(--ot-border);
  }
}

.ot-nf__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  font-size: 15px;
  color: var(--ot-text-2);
  cursor: pointer;

  &:hover {
    background: var(--ot-fill);
    color: var(--wot-color-theme);
  }

  &.is-danger:hover {
    color: #ef4444;
  }
}

.ot-nf__link {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--wot-color-theme);
  cursor: pointer;

  &.is-muted {
    color: var(--ot-text-3);
  }
}
</style>
