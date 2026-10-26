/**
 * 登录与角色守卫：除白名单外所有页面都需要登录；/pages-admin/ 下的页面仅管理员可进入。
 * 这里只负责前端跳转体验，真正的权限校验在服务端（worker/src/auth.ts）。
 */
import { useTokenStore } from '@/store/token'
import { useUserStore } from '@/store/user'
import { HOME_PAGE } from '@/utils'

export const LOGIN_PAGE = '/pages/login/index'

/** 文本快传：未登录也能凭取件码提取（发送、查看自己的快传仍需登录） */
export const PASTE_PAGE = '/pages-tools/paste/index'
/** 文件快传与便签分享页同理：凭取件码 / 分享链接免登录访问 */
export const FILEDROP_PAGE = '/pages-tools/filedrop/index'
export const NOTE_SHARE_PAGE = '/pages-tools/notes/share'
export const ANNIV_SHARE_PAGE = '/pages-tools/anniversary/share'

/** 无需登录即可访问的页面 */
const PUBLIC_PAGES = [LOGIN_PAGE, PASTE_PAGE, FILEDROP_PAGE, NOTE_SHARE_PAGE, ANNIV_SHARE_PAGE]
const ADMIN_PREFIX = '/pages-admin/'

export function isLoggedIn() {
  return useTokenStore().updateNowTime().hasLogin
}

export function isAdmin() {
  return useUserStore().userInfo.role === 'admin'
}

function buildUrl(path: string, query?: Record<string, string>) {
  const qs = Object.entries(query || {})
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')
  return qs ? `${path}?${qs}` : path
}

/**
 * 返回需要重定向到的地址；允许访问则返回 ''
 * @param path 以 '/' 开头的页面路径，H5 首页可能是 '/'
 */
export function getAuthRedirect(path: string, query?: Record<string, string>) {
  if (PUBLIC_PAGES.includes(path))
    return ''
  if (!isLoggedIn()) {
    const target = path === '/' || path === HOME_PAGE ? '' : buildUrl(path, query)
    return buildUrl(LOGIN_PAGE, { redirect: target })
  }
  if (path.startsWith(ADMIN_PREFIX) && !isAdmin())
    return HOME_PAGE
  return ''
}
