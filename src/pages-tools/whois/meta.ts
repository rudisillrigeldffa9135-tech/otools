import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'whois',
  name: '域名查询',
  desc: '查询域名的注册商、注册与到期时间、状态和 DNS 服务器，也可查 IP 段归属',
  category: 'network',
  icon: 'i-carbon-search-locate',
  keywords: ['whois', 'rdap', '域名', '注册商', '到期', '过期', 'ip', '归属', '网段'],
  order: 3,
  isNew: true,
})
