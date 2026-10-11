import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'myip',
  name: '我的 IP',
  desc: '查看本机公网 IP、地理位置、运营商与网络连接信息',
  category: 'network',
  icon: 'i-carbon-location',
  keywords: ['ip', 'my ip', '公网', 'ip地址', '归属地', '运营商', 'asn'],
  order: 0,
})
