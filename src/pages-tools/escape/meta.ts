import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'escape',
  name: '字符转义',
  desc: 'HTML 实体、Unicode、JS / JSON 字符串、正则、SQL、XML 转义与还原',
  category: 'crypto',
  icon: 'i-carbon-string-text',
  keywords: ['转义', '反转义', 'escape', 'unescape', 'html', '实体', 'unicode', 'native2ascii', 'json', '正则', 'sql', '零宽'],
  order: 5,
  isNew: true,
})
