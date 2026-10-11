import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'wordcount',
  name: '字数统计',
  desc: '统计字符、汉字、单词、行数与段落',
  category: 'text',
  icon: 'i-carbon-text-align-left',
  keywords: ['count', 'word', '字数', '统计'],
  order: 1,
})
