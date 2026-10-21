import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'notes',
  name: 'Markdown 便签',
  desc: '随写随存的 Markdown 便签，多设备同步，文件夹、大纲、历史版本与密码分享',
  category: 'text',
  icon: 'i-carbon-notebook',
  keywords: ['便签', '笔记', '备忘', 'markdown', 'md', 'note', '代码片段', '记事本', '待办', '文件夹', '大纲', '历史版本'],
  order: 0,
  isNew: true,
})
