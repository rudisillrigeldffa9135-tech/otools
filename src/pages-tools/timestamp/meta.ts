import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'timestamp',
  name: '时间戳转换',
  desc: 'Unix 时间戳与日期时间互相转换',
  category: 'dev',
  icon: 'i-carbon-time',
  keywords: ['timestamp', 'unix', 'date', '时间', '日期'],
  order: 2,
})
