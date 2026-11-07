import type { AssetCategory, SubjectType } from '@/api/whereis'

export interface CategoryPreset {
  id: AssetCategory
  name: string
  icon: string
  color: string
}

export const CATEGORIES: CategoryPreset[] = [
  { id: 'domain', name: '域名DNS', icon: 'i-carbon-network-4', color: '#0ea5e9' },
  { id: 'server', name: '服务器VPS', icon: 'i-carbon-bare-metal-server', color: '#10b981' },
  { id: 'subscription', name: '订阅会员', icon: 'i-carbon-money', color: '#f59e0b' },
  { id: 'api_key', name: '凭据证书', icon: 'i-carbon-certificate', color: '#8b5cf6' },
  { id: 'footprint', name: '数字足迹', icon: 'i-carbon-application-mobile', color: '#ec4899' },
  { id: 'hardware', name: '设备硬件', icon: 'i-carbon-laptop', color: '#6366f1' },
  { id: 'other', name: '其他资产', icon: 'i-carbon-folder', color: '#64748b' },
]

export interface SubjectTypePreset {
  type: SubjectType
  name: string
  icon: string
  placeholder: string
}

export const SUBJECT_TYPES: SubjectTypePreset[] = [
  { type: 'phone', name: '手机号', icon: 'i-carbon-phone', placeholder: '如 13800000000' },
  { type: 'email', name: '邮箱', icon: 'i-carbon-email', placeholder: '如 user@example.com' },
  { type: 'bankcard', name: '银行卡', icon: 'i-carbon-money', placeholder: '如 招行双币卡 尾号8848' },
  { type: 'idcard', name: '实名身份', icon: 'i-carbon-id-management', placeholder: '如 个人身份证 / 公司营业执照' },
  { type: 'entity', name: '公司主体', icon: 'i-carbon-enterprise', placeholder: '如 某某科技有限公司' },
  { type: 'other', name: '其他主体', icon: 'i-carbon-folder', placeholder: '标识或备注' },
]

export interface PlatformPreset {
  name: string
  icon: string
  loginUrl?: string
  defaultCategory?: AssetCategory
}

export const POPULAR_PLATFORMS: PlatformPreset[] = [
  { name: '阿里云', icon: 'i-carbon-cloud', loginUrl: 'https://aliyun.com', defaultCategory: 'domain' },
  { name: '腾讯云', icon: 'i-carbon-cloud', loginUrl: 'https://cloud.tencent.com', defaultCategory: 'server' },
  { name: 'Cloudflare', icon: 'i-carbon-cloud', loginUrl: 'https://dash.cloudflare.com', defaultCategory: 'domain' },
  { name: 'GitHub', icon: 'i-carbon-logo-github', loginUrl: 'https://github.com', defaultCategory: 'api_key' },
  { name: 'OpenAI', icon: 'i-carbon-bot', loginUrl: 'https://platform.openai.com', defaultCategory: 'api_key' },
  { name: '微信公众平台', icon: 'i-carbon-application-mobile', loginUrl: 'https://mp.weixin.qq.com', defaultCategory: 'footprint' },
  { name: '微信商户平台', icon: 'i-carbon-money', loginUrl: 'https://pay.weixin.qq.com', defaultCategory: 'footprint' },
  { name: '华为云', icon: 'i-carbon-cloud', loginUrl: 'https://huaweicloud.com', defaultCategory: 'server' },
  { name: 'AWS', icon: 'i-carbon-virtual-private-cloud', loginUrl: 'https://aws.amazon.com', defaultCategory: 'server' },
  { name: 'Apple ID / 开发者', icon: 'i-carbon-certificate', loginUrl: 'https://developer.apple.com', defaultCategory: 'subscription' },
  { name: 'Google Workspace', icon: 'i-carbon-email', loginUrl: 'https://admin.google.com', defaultCategory: 'subscription' },
  { name: '京东', icon: 'i-carbon-shopping-bag', loginUrl: 'https://jd.com', defaultCategory: 'subscription' },
  { name: '美团', icon: 'i-carbon-shopping-bag', loginUrl: 'https://meituan.com', defaultCategory: 'subscription' },
  { name: '爱奇艺', icon: 'i-carbon-video', loginUrl: 'https://iqiyi.com', defaultCategory: 'subscription' },
  { name: '腾讯视频', icon: 'i-carbon-video', loginUrl: 'https://v.qq.com', defaultCategory: 'subscription' },
  { name: '网易云音乐', icon: 'i-carbon-music', loginUrl: 'https://music.163.com', defaultCategory: 'subscription' },
  { name: 'Bilibili', icon: 'i-carbon-video', loginUrl: 'https://bilibili.com', defaultCategory: 'subscription' },
]

export function getCategoryPreset(id: AssetCategory): CategoryPreset {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1]
}

export function getSubjectTypePreset(type: SubjectType): SubjectTypePreset {
  return SUBJECT_TYPES.find(s => s.type === type) || SUBJECT_TYPES[SUBJECT_TYPES.length - 1]
}
