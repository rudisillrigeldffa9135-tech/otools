import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'imgcolor',
  name: '图片取色',
  desc: '点击图片任意位置获取颜色，并自动提取主色调',
  category: 'image',
  icon: 'i-carbon-eyedropper',
  keywords: ['image', 'color', 'picker', 'eyedropper', '取色', '吸管', '主色', '调色板', '图片'],
  // 依赖 canvas 读取像素：H5 用 DOM canvas，微信小程序用 type="2d" canvas
  platforms: ['h5', 'mp-weixin'],
  order: 3,
})
