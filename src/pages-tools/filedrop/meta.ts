import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'filedrop',
  name: '文件快传',
  desc: '上传文件得到取件码，免登录即可下载，有效期可选或自定义（含永久），支持阅后即焚',
  category: 'network',
  icon: 'i-carbon-document-export',
  keywords: ['文件', '快传', '传文件', '取件码', '分享', '上传', '下载', '网盘', '阅后即焚'],
  order: 4,
  isNew: true,
})
