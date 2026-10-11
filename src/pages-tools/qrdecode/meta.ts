import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'qrdecode',
  name: '二维码识别',
  desc: '识别图片中的二维码，自动解析网址、Wi-Fi、名片、两步验证等内容',
  category: 'image',
  icon: 'i-carbon-scan-alt',
  keywords: ['二维码', '扫码', '识别', '解码', 'qr', 'qrcode', 'wifi', '名片'],
  order: 1,
  isNew: true,
})
