import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'vault',
  name: '密码管理',
  desc: '保存各网站的账号密码，服务端加密存储，多端同步',
  category: 'security',
  icon: 'i-carbon-password',
  keywords: ['vault', 'password', '密码', '账号', '密码本', '网站'],
  order: 1,
  isNew: true,
})
