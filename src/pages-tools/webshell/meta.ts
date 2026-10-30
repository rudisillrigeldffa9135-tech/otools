import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'webshell',
  name: 'WebShell',
  desc: '网页版 SSH 客户端：终端、SFTP 文件管理、服务器监控、快捷命令，端到端加密的云同步',
  category: 'dev',
  icon: 'i-carbon-terminal',
  keywords: ['ssh', 'shell', 'terminal', 'sftp', 'finalshell', 'xshell', '终端', '服务器', '远程', '运维', '监控', 'linux'],
  platforms: ['h5'],
  order: 1,
  isNew: true,
})
