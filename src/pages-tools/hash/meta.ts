import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'hash',
  name: '哈希计算',
  desc: 'MD5、SHA1、SHA256、SHA512 摘要计算',
  category: 'crypto',
  icon: 'i-carbon-fingerprint-recognition',
  keywords: ['md5', 'sha', 'sha1', 'sha256', 'hash', '摘要', '加密'],
  order: 3,
})
