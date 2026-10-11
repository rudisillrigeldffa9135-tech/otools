import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'dns',
  name: 'DNS 查询',
  desc: '查询 A、AAAA、CNAME、MX、TXT、NS 等解析记录，可切换 Cloudflare / Google / 阿里 DNS',
  category: 'network',
  icon: 'i-carbon-dns-services',
  keywords: ['dns', '域名', '解析', 'nslookup', 'dig', 'mx', 'txt', 'cname', 'ptr', '反向解析', 'doh'],
  order: 1,
  isNew: true,
})
