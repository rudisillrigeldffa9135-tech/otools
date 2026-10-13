import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'paste',
  name: '文本快传',
  desc: '多设备间互传文字，取件码或链接分享，支持纯文本页面、阅后即焚与永久有效',
  category: 'text',
  icon: 'i-carbon-send-alt',
  keywords: ['paste', 'clipboard', 'raw', 'pastebin', '快传', '剪贴板', '传文字', '阅后即焚', '取件码', '纯文本'],
  order: 5,
})
