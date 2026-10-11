import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'mortgage',
  name: '房贷计算器',
  desc: '等额本息 / 等额本金对比，支持公积金与组合贷、提前还款测算与还款明细',
  category: 'life',
  icon: 'i-carbon-home',
  keywords: ['房贷', '贷款', '月供', '利息', '等额本息', '等额本金', '公积金', '组合贷', '提前还款', 'LPR'],
  order: 0,
  isNew: true,
})
