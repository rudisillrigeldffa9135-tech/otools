import { getEnvBaseUrl } from '@/utils'

/**
 * 站点地址（不含末尾斜杠），用于生成分享链接、短链前缀等。
 * H5 直接取当前域名；小程序 / App 由接口地址推算（去掉末尾的 /api），推算不出时返回 ''。
 */
export function getSiteOrigin() {
  // #ifdef H5
  return window.location.origin
  // #endif
  // #ifndef H5

  const base = getEnvBaseUrl() || ''
  return /^https?:\/\//.test(base) ? base.replace(/\/api\/?$/, '').replace(/\/$/, '') : ''
  // #endif
}

/** 站内页面的 H5 访问地址（hash 路由），如 https://xxx/#/pages-tools/paste/index?code=ABC */
export function getPageUrl(path: string) {
  const origin = getSiteOrigin()
  return origin ? `${origin}/#${path}` : ''
}
