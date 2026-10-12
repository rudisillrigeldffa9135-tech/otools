import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'filedrop',
  name: '文件快传',
  desc: '上传文件得到取件码，免登录即可下载，可设有效期与阅后即焚，到期自动删除',
  category: 'network',
  icon: 'i-carbon-document-export',
  keywords: ['文件', '快传', '传文件', '取件码', '分享', '上传', '下载', '网盘', '阅后即焚'],
  order: 4,
  isNew: true,
})
