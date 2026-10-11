import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'cipher',
  name: '对称加密',
  desc: 'AES / DES / 3DES 加解密，支持多种模式与填充，兼容 OpenSSL 口令格式',
  category: 'crypto',
  icon: 'i-carbon-password',
  keywords: ['aes', 'des', '3des', 'tripledes', '加密', '解密', '对称', 'cbc', 'ecb', 'openssl', 'crypto-js'],
  order: 4,
  isNew: true,
})
