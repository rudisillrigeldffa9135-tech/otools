import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'whereis',
  name: '归属查询',
  desc: '快速查询资产与服务归属的账户与平台，支持多设备同步与正反向双向盘点',
  category: 'life',
  icon: 'i-carbon-query',
  keywords: ['whereis', '归属', '归属查询', '资产', '找账号', '多账号', '足迹', '换绑', '平台', '域名归属'],
  order: 10,
})
