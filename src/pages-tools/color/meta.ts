import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'color',
  name: '颜色转换',
  desc: 'HEX、RGB、HSL 颜色格式互转与预览',
  category: 'convert',
  icon: 'i-carbon-color-palette',
  keywords: ['color', 'hex', 'rgb', 'hsl', '颜色'],
  order: 2,
})
