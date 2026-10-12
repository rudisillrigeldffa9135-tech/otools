import { describe, expect, it, vi } from 'vitest'
import { clearUserLocalData, userKey } from '@/utils/user-storage'
import { useToolStore } from './tool'
import { useUserStore } from './user'

vi.mock('@/api/login', () => ({ getUserInfo: vi.fn() }))
vi.mock('@/tools/registry', () => ({ getTool: (id: string) => ({ id }) }))

function login(userId: number) {
  useUserStore().setUserInfo({ userId, username: `u${userId}`, nickname: '', avatar: 'a' })
}

describe('工具收藏与最近使用按用户隔离', () => {
  it('换账号后看不到上一个用户的收藏与最近使用', () => {
    const tools = useToolStore()
    login(1)
    tools.toggleFavorite('vault')
    tools.addRecent('notes')
    expect(tools.favoriteIds).toEqual(['vault'])

    login(2)
    expect(tools.favoriteIds).toEqual([])
    expect(tools.recentIds).toEqual([])
    tools.toggleFavorite('json')

    login(1)
    expect(tools.favoriteIds).toEqual(['vault'])
    expect(tools.recentIds).toEqual(['notes'])
  })

  it('未登录时使用独立的访客分组', () => {
    const tools = useToolStore()
    login(3)
    tools.addRecent('paste')
    useUserStore().clearUserInfo()
    expect(tools.recentIds).toEqual([])
  })
})

describe('user-storage', () => {
  it('键名带上用户标识', () => {
    login(7)
    expect(userKey('ot-notes-draft')).toBe('ot-notes-draft@u7')
    expect(userKey('ot-notes-draft', -1)).toBe('ot-notes-draft@guest')
  })

  it('退出登录时删除该用户的草稿与查询记录，以及旧版本的全局数据', () => {
    clearUserLocalData(7)
    const removed = (uni.removeStorageSync as any).mock.calls.map((c: string[]) => c[0])
    expect(removed).toEqual(expect.arrayContaining([
      'ot-notes-draft@u7',
      'ot-dns-history@u7',
      'ot-notes-draft',
      'ot-dns-history',
      'ot-currency-favorites',
    ]))
    // 偏好设置按用户保留
    expect(removed).not.toContain('ot-currency-favorites@u7')
  })
})
