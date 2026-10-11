import { getTabbarRedirectPath, tabbarStore } from '@/tabbar/store'
import { getAuthRedirect } from './auth'

export const permission = {
  install(router) {
    router.beforeEach((to, from, next) => {
      const path = to.path
      // H5 直接输入地址栏、浏览器前进后退时同样需要登录 / 权限校验
      const authRedirect = getAuthRedirect(path, to.query)
      if (authRedirect) {
        next(authRedirect)
        return
      }
      // H5 直接输入地址栏、浏览器前进后退也要拦住角色不足的 tabbar 页面
      const redirectPath = getTabbarRedirectPath(path)
      if (redirectPath) {
        next(redirectPath)
        return
      }
      tabbarStore.setAutoCurIdx(path)
      next()
    })
  },
}
