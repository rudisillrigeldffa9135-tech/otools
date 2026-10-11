import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'regex',
  name: '正则测试',
  desc: '实时高亮匹配与捕获组，支持替换预览，内置常用正则',
  category: 'dev',
  icon: 'i-carbon-search-locate',
  keywords: ['regex', 'regexp', '正则', '表达式', '匹配', '替换'],
  order: 4,
})
