import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'textbatch',
  name: '文本批处理',
  desc: '去重、排序、去空行、筛选替换、加前后缀、行列转换',
  category: 'text',
  icon: 'i-carbon-list-checked',
  keywords: ['text', 'dedupe', 'sort', '去重', '排序', '去空行', '批量', '前缀', '后缀', '行转列'],
  order: 3,
  isNew: true,
})
