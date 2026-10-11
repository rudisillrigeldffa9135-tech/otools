import { defineTool } from '@/tools/types'

export default defineTool({
  id: 'cron',
  name: 'Cron 表达式',
  desc: '解析 Linux / Spring / Quartz 定时表达式，中文说明并列出接下来的执行时间',
  category: 'dev',
  icon: 'i-carbon-event-schedule',
  keywords: ['cron', 'crontab', '定时', '任务', 'quartz', 'spring', '调度', '表达式'],
  order: 6,
  isNew: true,
})
