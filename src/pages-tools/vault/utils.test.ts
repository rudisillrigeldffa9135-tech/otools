import type { VaultLike } from './utils'
import { findDuplicate, groupBySite, hostOf, matchKeyword, passwordStrength } from './utils'

let seq = 0
function item(name: string, url: string, username = '', extra: Partial<VaultLike> = {}): VaultLike {
  seq++
  return { id: seq, name, url, username, label: '', updatedAt: seq, ...extra }
}

describe('hostOf', () => {
  it('提取主机名，忽略协议、www、端口、路径与大小写', () => {
    expect(hostOf('https://www.GitHub.com/login?a=1')).toBe('github.com')
    expect(hostOf('github.com')).toBe('github.com')
    expect(hostOf('http://example.com:8080/x')).toBe('example.com')
    expect(hostOf('')).toBe('')
  })
})

describe('groupBySite 按网站分组', () => {
  it('同一主机名的多个账号归为一组（含 www 与不同路径）', () => {
    const groups = groupBySite([
      item('GitHub', 'https://github.com', 'a'),
      item('GitHub 工作', 'www.github.com/login', 'b'),
      item('Google', 'google.com', 'c'),
    ])
    expect(groups).toHaveLength(2)
    expect(groups.find(g => g.host === 'github.com')!.items.map(i => i.username).sort()).toEqual(['a', 'b'])
  })

  it('没填网址的条目并入同名站点', () => {
    const groups = groupBySite([item('GitHub', 'github.com', 'a'), item('github', '', 'b')])
    expect(groups).toHaveLength(1)
    expect(groups[0].items).toHaveLength(2)
    expect(groups[0].url).toBe('github.com')
  })

  it('没有网址也没有同名站点时按名称成组', () => {
    const groups = groupBySite([item('路由器', '', 'admin'), item('路由器', '', 'guest'), item('NAS', '', 'root')])
    expect(groups.map(g => g.items.length).sort()).toEqual([1, 2])
  })

  it('组按最近更新排序，组内同样按更新时间倒序', () => {
    const groups = groupBySite([
      item('A', 'a.com', 'old', { updatedAt: 1 }),
      item('B', 'b.com', 'x', { updatedAt: 5 }),
      item('A', 'a.com', 'new', { updatedAt: 9 }),
    ])
    expect(groups.map(g => g.host)).toEqual(['a.com', 'b.com'])
    expect(groups[0].items.map(i => i.username)).toEqual(['new', 'old'])
    expect(groups[0].updatedAt).toBe(9)
  })
})

describe('findDuplicate 重复检测', () => {
  const items = [item('GitHub', 'github.com', 'Alice'), item('GitHub', 'github.com', 'bob')]

  it('同站点同账号（不区分大小写）视为重复', () => {
    expect(findDuplicate(items, { name: 'GH', url: 'https://www.github.com', username: 'alice' })?.username).toBe('Alice')
  })

  it('同站点不同账号不算重复', () => {
    expect(findDuplicate(items, { name: 'GitHub', url: 'github.com', username: 'carol' })).toBeUndefined()
  })

  it('编辑时排除自身', () => {
    expect(findDuplicate(items, { name: 'GitHub', url: 'github.com', username: 'alice' }, items[0].id)).toBeUndefined()
  })

  it('账号为空时不检测', () => {
    expect(findDuplicate(items, { name: 'GitHub', url: 'github.com', username: ' ' })).toBeUndefined()
  })
})

describe('matchKeyword', () => {
  it('匹配名称、网址、账号与账号备注', () => {
    const i = item('GitHub', 'github.com', 'alice', { label: '工作号' })
    expect(matchKeyword(i, '工作')).toBe(true)
    expect(matchKeyword(i, 'ALICE')).toBe(true)
    expect(matchKeyword(i, 'gitlab')).toBe(false)
    expect(matchKeyword(i, '')).toBe(true)
  })
})

describe('passwordStrength', () => {
  it('按长度与字符种类分级', () => {
    expect(passwordStrength('').level).toBe(0)
    expect(passwordStrength('123456').level).toBe(1)
    expect(passwordStrength('abcDEF12').level).toBe(1)
    expect(passwordStrength('abcDEF123456').level).toBe(2)
    expect(passwordStrength('aB3$eF7*hJ9!kL0@').level).toBe(3)
  })
})
