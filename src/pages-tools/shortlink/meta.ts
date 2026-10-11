import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'shortlink',
  name: '短链接',
  desc: '长链接转短链，支持自定义后缀、有效期、点击统计与二维码',
  category: 'generate',
  icon: 'i-carbon-link',
  keywords: ['short', 'url', 'link', '短链', '短网址', '转短链', '链接'],
  order: 1,
})
