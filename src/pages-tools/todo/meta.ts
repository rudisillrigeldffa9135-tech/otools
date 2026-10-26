import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'todo',
  name: '待办事项',
  desc: '清单、重复任务、提醒、中文智能识别、共享清单，多设备同步',
  category: 'life',
  icon: 'i-carbon-task',
  keywords: ['todo', 'task', '待办', '任务', '清单', '提醒', '日程', 'gtd', '番茄钟', '四象限', '共享'],
  order: 1,
  isNew: true,
})
