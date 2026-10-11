import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'imgcompress',
  name: '图片压缩',
  desc: '批量压缩图片、转换格式（JPG/PNG/WebP）并调整尺寸',
  category: 'image',
  icon: 'i-carbon-image-copy',
  keywords: ['image', 'compress', 'resize', 'webp', '压缩', '图片', '格式转换', '尺寸'],
  order: 0,
  isNew: true,
})
