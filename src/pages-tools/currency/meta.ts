import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'currency',
  name: '汇率换算',
  desc: '160 多种货币实时汇率换算，常用币种一览，每日更新',
  category: 'life',
  icon: 'i-carbon-currency',
  keywords: ['汇率', '换算', '货币', '美元', '日元', '欧元', '港币', '外汇', 'currency', 'exchange'],
  order: 3,
  isNew: true,
})
