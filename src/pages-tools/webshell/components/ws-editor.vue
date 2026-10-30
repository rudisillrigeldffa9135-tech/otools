<script lang="ts" setup>
// 在线编辑远程文本文件（仅 H5）：Ctrl+S 保存，有未保存的修改时关闭前确认
const props = defineProps<{
  path: string
  text: string
}>()

const emit = defineEmits<{ save: [text: string], close: [] }>()

const open = ref(true)
const value = ref(props.text)
const saving = ref(false)
const dirty = computed(() => value.value !== props.text)
const lines = computed(() => value.value.split('\n').length)

watch(() => props.text, (t) => {
  // 保存成功后父组件会传回新的内容
  if (!dirty.value || t === value.value)
    value.value = t
})

async function save() {
  if (saving.value)
    return
  saving.value = true
  try {
    emit('save', value.value)
  }
  finally {
    setTimeout(() => (saving.value = false), 300)
  }
}

function close() {
  if (!dirty.value) {
    emit('close')
    return
  }
  uni.showModal({
    title: '放弃修改',
    content: '修改尚未保存，确定关闭吗？',
    success: ({ confirm }) => confirm && emit('close'),
  })
}

function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    save()
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

watch(open, (v) => {
  if (!v) {
    open.value = true
    close()
  }
})
</script>

<template>
  <wd-popup v-model="open" position="center" :z-index="1100" custom-style="border-radius: 14px; width: min(96vw, 1000px); overflow: hidden;">
    <view class="ot-ed">
      <view class="ot-ed__head">
        <view class="i-carbon-document text-16px text-muted" />
        <text class="ot-mono min-w-0 flex-1 truncate text-12px text-main" :title="path">{{ path }}</text>
        <text v-if="dirty" class="shrink-0 text-12px text-amber-600">未保存</text>
        <wd-button size="small" :loading="saving" :disabled="!dirty" @click="save">
          保存
        </wd-button>
        <view class="i-carbon-close cursor-pointer p-1 text-18px text-muted" @click="close" />
      </view>
      <textarea v-model="value" class="ot-ed__area" :maxlength="-1" :show-confirm-bar="false" :auto-height="false" spellcheck="false" />
      <view class="ot-ed__foot">
        {{ lines }} 行 · UTF-8 · Ctrl+S 保存
      </view>
    </view>
  </wd-popup>
</template>

<style lang="scss" scoped>
.ot-ed {
  display: flex;
  flex-direction: column;
  height: 85vh;
  background: var(--ot-card);
}

.ot-ed__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--ot-border);
}

.ot-ed__area {
  flex: 1;
  width: 100%;
  height: auto;
  min-height: 0;
  padding: 12px;
  box-sizing: border-box;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--ot-text);
  white-space: pre;
  tab-size: 4;

  :deep(textarea) {
    white-space: pre;
    overflow: auto;
  }
}

.ot-ed__foot {
  padding: 6px 12px;
  border-top: 1px solid var(--ot-border);
  font-size: 11px;
  color: var(--ot-text-3);
}
</style>
