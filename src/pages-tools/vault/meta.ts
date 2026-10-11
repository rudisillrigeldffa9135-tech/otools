import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'vault',
  name: '密码管理',
  desc: '按网站管理账号密码与两步验证码，支持同一网站多个账号，加密存储多端同步',
  category: 'security',
  icon: 'i-carbon-password',
  keywords: ['vault', 'password', '密码', '账号', '密码本', '网站', '多账号', 'totp', '2fa', '两步验证', '动态码', 'authenticator'],
  order: 1,
  isNew: true,
})
