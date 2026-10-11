import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
})

async function setup({ login = false, role = '' } = {}) {
  vi.doMock('@/store/token', () => ({
    useTokenStore: () => ({ updateNowTime: () => ({ hasLogin: login }) }),
  }))
  const { useUserStore } = await import('@/store/user')
  if (role)
    useUserStore().setUserInfo({ userId: 1, username: 'u', nickname: 'U', role })
  return import('./auth')
}

describe('getAuthRedirect 登录守卫', () => {
  it('未登录访问工具页时跳登录页，并带上原地址', async () => {
    const { getAuthRedirect } = await setup()
    expect(getAuthRedirect('/pages-tools/json/index', { a: '1' }))
      .toBe(`/pages/login/index?redirect=${encodeURIComponent('/pages-tools/json/index?a=1')}`)
  })

  it('未登录访问首页时跳登录页，不带 redirect', async () => {
    const { getAuthRedirect } = await setup()
    expect(getAuthRedirect('/')).toBe('/pages/login/index')
    expect(getAuthRedirect('/pages/index/index')).toBe('/pages/login/index')
  })

  it('登录页本身无需登录，不会死循环', async () => {
    const { getAuthRedirect, LOGIN_PAGE } = await setup()
    expect(getAuthRedirect(LOGIN_PAGE)).toBe('')
  })

  it('文本快传未登录也能打开（凭取件码提取）', async () => {
    const { getAuthRedirect, PASTE_PAGE } = await setup()
    expect(getAuthRedirect(PASTE_PAGE, { code: 'ABC23K' })).toBe('')
  })

  it('已登录放行普通页面', async () => {
    const { getAuthRedirect } = await setup({ login: true, role: 'user' })
    expect(getAuthRedirect('/pages-tools/vault/index')).toBe('')
  })

  it('普通用户不能进入管理页', async () => {
    const { getAuthRedirect } = await setup({ login: true, role: 'user' })
    expect(getAuthRedirect('/pages-admin/users/index')).toBe('/pages/index/index')
  })

  it('管理员可以进入管理页', async () => {
    const { getAuthRedirect } = await setup({ login: true, role: 'admin' })
    expect(getAuthRedirect('/pages-admin/users/index')).toBe('')
  })
})
