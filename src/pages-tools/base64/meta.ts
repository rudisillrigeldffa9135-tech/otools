import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'base64',
  name: 'Base64 编解码',
  desc: '文本 Base64 编码与解码，支持中文与 URL 安全格式',
  category: 'crypto',
  icon: 'i-carbon-data-format',
  keywords: ['base64', '编码', '解码'],
  order: 1,
})
