import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'incometax',
  name: '个税计算器',
  desc: '工资个税逐月预扣、专项附加扣除、年终奖单独计税与并入综合所得对比',
  category: 'life',
  icon: 'i-carbon-receipt',
  keywords: ['个税', '个人所得税', '工资', '税后', '到手', '年终奖', '专项附加扣除', '五险一金', '汇算'],
  order: 1,
  isNew: true,
})
