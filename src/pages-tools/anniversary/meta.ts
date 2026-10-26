import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'anniversary',
  name: '纪念日',
  desc: '倒数日与累计天数，支持农历、生日年龄、里程碑、节日库与提醒',
  category: 'life',
  icon: 'i-carbon-favorite',
  keywords: ['纪念日', '倒数日', '倒计时', '生日', '农历生日', '恋爱', '在一起', '纪念', 'days', 'countdown', '节日', '里程碑'],
  order: 2,
  isNew: true,
})
