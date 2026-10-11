import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'qrcode',
  name: '二维码生成',
  desc: '文本 / 网址生成二维码，可自定义颜色并保存图片',
  category: 'generate',
  icon: 'i-carbon-qr-code',
  keywords: ['qrcode', 'qr', '二维码'],
  order: 0,
  isNew: true,
})
