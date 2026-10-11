import { getToolByPath } from '@/tools/registry'
import { currRoute } from '@/utils'

const APP_TITLE = 'OTools 工具箱 - 简单好用的在线工具'

function getShareInfo() {
  const { path } = currRoute()
  const tool = getToolByPath(path)
  return {
    title: tool ? `${tool.name} - ${tool.desc}` : APP_TITLE,
    path,
  }
}

/** 小程序全局分享：所有页面默认开启“转发”和“分享到朋友圈”，工具页带上工具名称 */
export const shareMixin = {
  onShareAppMessage() {
    return getShareInfo()
  },
  onShareTimeline() {
    return { title: getShareInfo().title }
  },
}
