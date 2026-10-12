import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'vaultcheck',
  name: '密码体检',
  desc: '检查密码库中的弱密码、重复使用、长期未换，以及是否出现在公开泄露数据中',
  category: 'security',
  icon: 'i-carbon-security-services',
  keywords: ['密码', '体检', '泄露', '安全', '弱密码', '重复', 'hibp', 'pwned', '撞库'],
  order: 2,
  isNew: true,
})
