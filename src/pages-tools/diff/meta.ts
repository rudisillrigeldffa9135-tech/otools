import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'diff',
  name: '文本对比',
  desc: '按行 / 词 / 字符比较两段文本，标出新增、删除与行内改动',
  category: 'dev',
  icon: 'i-carbon-compare',
  keywords: ['diff', 'compare', '对比', '比较', '差异', '比对'],
  order: 5,
  isNew: true,
})
