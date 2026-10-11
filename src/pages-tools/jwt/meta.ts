import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'jwt',
  name: 'JWT 解析',
  desc: '解码 JWT 头部与载荷，显示过期状态，校验 HS256/384/512 签名',
  category: 'dev',
  icon: 'i-carbon-certificate',
  keywords: ['jwt', 'token', 'json web token', '令牌', '解码', '签名'],
  order: 3,
  isNew: true,
})
