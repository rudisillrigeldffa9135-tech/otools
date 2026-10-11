import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'password',
  name: '随机密码',
  desc: '生成高强度随机密码，可自定义长度与字符集',
  category: 'generate',
  icon: 'i-carbon-password',
  keywords: ['password', '密码', '随机'],
  order: 1,
})
