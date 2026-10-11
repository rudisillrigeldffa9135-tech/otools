import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'datecalc',
  name: '日期计算',
  desc: '日期间隔、工作日推算（含法定节假日与调休）、公历农历互转、节气节日',
  category: 'life',
  icon: 'i-carbon-calendar',
  keywords: ['日期', '天数', '间隔', '工作日', '节假日', '调休', '农历', '阴历', '公历', '节气', '生肖', '倒计时', '黄历'],
  order: 1,
  isNew: true,
})
