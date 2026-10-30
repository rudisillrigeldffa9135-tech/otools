<script lang="ts" setup>
// 新建 / 编辑快捷命令
import type { Snippet } from '../lib/types'
import { toast } from '@/utils/common'
import { data, remove, save } from '../lib/store'
import { snippetVars } from '../lib/util'

const props = defineProps<{ snippet: Snippet | null }>()
const open = defineModel<boolean>({ required: true })

const form = ref<Snippet>(blank())
const saving = ref(false)

function blank(): Snippet {
  return { id: '', name: '', command: '', category: '', autoRun: true, sort: Date.now() }
}

watch(open, (v) => {
  if (v)
    form.value = props.snippet ? { ...props.snippet } : blank()
})

const categories = computed(() => [...new Set(data.snippets.map(s => s.category).filter(Boolean))])
const vars = computed(() => snippetVars(form.value.command))

async function submit() {
  const f = form.value
  if (!f.command.trim())
    return toast('请填写命令')
  saving.value = true
  try {
    await save('snippet', { ...f, name: f.name.trim() || f.command.trim().split('\n')[0].slice(0, 40), category: f.category.trim() })
    open.value = false
  }
  catch (e: any) {
    toast(e?.message || '保存失败')
  }
  finally {
    saving.value = false
  }
}

function del() {
  if (!props.snippet)
    return
  uni.showModal({
    title: '删除快捷命令',
    content: `确定删除「${props.snippet.name}」吗？`,
    success: async ({ confirm }) => {
      if (!confirm)
        return
      await remove(props.snippet!.id)
      open.value = false
    },
  })
}
</script>

<template>
  <wd-popup v-model="open" position="center" :z-index="1100" custom-style="border-radius: 16px; width: min(92vw, 480px);">
    <view class="ws-form">
      <view class="mb-1 text-16px text-main font-600">
        {{ snippet ? '编辑快捷命令' : '新建快捷命令' }}
      </view>
      <view class="ws-form__label">
        名称
      </view>
      <view class="ws-form__field">
        <input v-model="form.name" class="min-w-0 flex-1" placeholder="不填时使用命令的第一行" :maxlength="60">
      </view>
      <view class="ws-form__label">
        分类
      </view>
      <view class="ws-form__field">
        <input v-model="form.category" class="min-w-0 flex-1" placeholder="如：Docker、日志、系统" :maxlength="30">
      </view>
      <view v-if="categories.length" class="mt-2 flex flex-wrap gap-1.5">
        <text v-for="c in categories" :key="c" class="ws-form__chip" :class="{ 'is-on': form.category === c }" @click="form.category = c">{{ c }}</text>
      </view>
      <view class="ws-form__label">
        命令 <text class="text-red-500">*</text>
      </view>
      <view class="ws-form__field is-area">
        <textarea v-model="form.command" class="ot-mono" placeholder="可以多行；用 {{变量}} 或 {{变量:默认值}} 在执行前填写，如 tail -n {{行数:100}} {{文件}}" :maxlength="5000" :auto-height="true" />
      </view>
      <view v-if="vars.length" class="mt-1.5 text-12px text-muted">
        执行前需要填写：{{ vars.map(v => v.name).join('、') }}
      </view>
      <view class="mt-3 flex items-center gap-2">
        <wd-switch v-model="form.autoRun" size="20px" />
        <text class="text-13px text-main">发送后自动回车执行</text>
      </view>
      <view class="mt-5 flex gap-2">
        <wd-button v-if="snippet" type="error" plain @click="del">
          删除
        </wd-button>
        <view class="flex-1" />
        <wd-button type="info" plain @click="open = false">
          取消
        </wd-button>
        <wd-button :loading="saving" @click="submit">
          保存
        </wd-button>
      </view>
    </view>
  </wd-popup>
</template>
