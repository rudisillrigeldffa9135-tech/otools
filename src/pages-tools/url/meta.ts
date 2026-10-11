import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'url',
  name: 'URL 编解码',
  desc: 'URL 编码 / 解码，并解析查询参数',
  category: 'crypto',
  icon: 'i-carbon-link',
  keywords: ['url', 'encode', 'decode', 'urlencode', '编码'],
  order: 2,
})
