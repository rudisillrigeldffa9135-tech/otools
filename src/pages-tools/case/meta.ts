import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'case',
  name: '命名格式转换',
  desc: '大小写、驼峰、下划线、短横线等命名格式互转',
  category: 'text',
  icon: 'i-carbon-letter-aa',
  keywords: ['case', 'camel', 'snake', 'kebab', '驼峰', '大小写'],
  order: 2,
})
