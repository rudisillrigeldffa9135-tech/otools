import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'radix',
  name: '进制转换',
  desc: '二、八、十、十六等任意进制互转，支持大整数',
  category: 'convert',
  icon: 'i-carbon-calculator',
  keywords: ['radix', 'hex', 'binary', '进制', '二进制', '十六进制'],
  order: 1,
})
