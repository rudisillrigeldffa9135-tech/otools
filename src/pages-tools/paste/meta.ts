import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'paste',
  name: '文本快传',
  desc: '多设备间互传文字，取件码分享，支持阅后即焚与有效期',
  category: 'text',
  icon: 'i-carbon-send-alt',
  keywords: ['paste', 'clipboard', '快传', '剪贴板', '传文字', '阅后即焚', '取件码'],
  order: 5,
  isNew: true,
})
