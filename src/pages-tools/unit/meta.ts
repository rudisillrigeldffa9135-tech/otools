import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'unit',
  name: '单位换算',
  desc: '长度、面积、质量、温度、数据大小、网速等 13 类单位，含市制单位',
  category: 'life',
  icon: 'i-carbon-ruler',
  keywords: ['单位', '换算', '长度', '面积', '亩', '斤', '温度', '摄氏', '华氏', '英寸', '网速', 'Mbps', 'GB', '压强', '卡路里'],
  order: 2,
  isNew: true,
})
