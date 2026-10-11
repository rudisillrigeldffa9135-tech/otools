import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'uuid',
  name: 'UUID 生成',
  desc: '批量生成 UUID v4',
  category: 'generate',
  icon: 'i-carbon-barcode',
  keywords: ['uuid', 'guid', '唯一标识'],
  order: 2,
})
