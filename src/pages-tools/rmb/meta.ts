import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'rmb',
  name: '人民币大写',
  desc: '金额转中文大写，支持中文数字读法与大写金额反向核对',
  category: 'text',
  icon: 'i-carbon-currency-yen',
  keywords: ['rmb', '人民币', '大写', '金额', '财务', '报销', '中文数字'],
  order: 4,
  isNew: true,
})
