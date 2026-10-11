import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'notes',
  name: 'Markdown 便签',
  desc: '随写随存的 Markdown 便签，多设备同步，代码高亮、行号与一键复制',
  category: 'text',
  icon: 'i-carbon-notebook',
  keywords: ['便签', '笔记', '备忘', 'markdown', 'md', 'note', '代码片段', '记事本', '待办'],
  order: 0,
  isNew: true,
})
