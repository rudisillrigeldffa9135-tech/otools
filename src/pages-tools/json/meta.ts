import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'json',
  name: 'JSON 格式化',
  desc: 'JSON 美化、压缩、校验与转义',
  category: 'dev',
  icon: 'i-carbon-json',
  keywords: ['json', 'format', '格式化', '压缩', '校验'],
  order: 1,
})
