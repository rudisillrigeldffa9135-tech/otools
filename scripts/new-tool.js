// 新建工具：pnpm new:tool <id> [名称] [分类]
// 例：pnpm new:tool regex 正则测试 dev
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const CATEGORIES = ['security', 'dev', 'crypto', 'text', 'image', 'network', 'convert', 'generate']
const [id, name = id, category = 'dev'] = process.argv.slice(2)

if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
  console.error('用法：pnpm new:tool <id> [名称] [分类]\n  id 只能包含小写字母、数字和短横线，且以字母开头')
  process.exit(1)
}
if (!CATEGORIES.includes(category)) {
  console.error(`分类必须是以下之一：${CATEGORIES.join(', ')}（在 src/tools/categories.ts 中定义）`)
  process.exit(1)
}

const dir = path.resolve(process.cwd(), 'src/pages-tools', id)
if (fs.existsSync(dir)) {
  console.error(`工具已存在：${path.relative(process.cwd(), dir)}`)
  process.exit(1)
}

const meta = `import { defineTool } from '@/tools/types'

export default defineTool({
  id: '${id}',
  name: '${name}',
  desc: '一句话描述这个工具',
  category: '${category}',
  // 图标集：https://icones.js.org/collection/carbon
  icon: 'i-carbon-tool-box',
  keywords: ['${id}'],
  isNew: true,
})
`

const page = `<script lang="ts" setup>
import { copyText } from '@/utils/common'

definePage({
  style: { navigationBarTitleText: '${name}' },
})

const input = ref('')
const output = computed(() => input.value)
</script>

<template>
  <ot-tool-layout>
    <ot-panel title="输入">
      <ot-textarea v-model="input" placeholder="请输入内容" />
    </ot-panel>
    <ot-panel title="结果">
      <template #extra>
        <wd-button size="small" :disabled="!output" @click="copyText(output)">
          复制
        </wd-button>
      </template>
      <ot-textarea :model-value="output" readonly />
    </ot-panel>
  </ot-tool-layout>
</template>
`

fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path.join(dir, 'meta.ts'), meta)
fs.writeFileSync(path.join(dir, 'index.vue'), page)
console.log(`已创建 src/pages-tools/${id}/{meta.ts,index.vue}，重启 dev 后生效（新页面需要重新生成 pages.json）`)
