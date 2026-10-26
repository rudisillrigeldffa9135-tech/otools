import type { TodoLike } from './views'
import { allTags, dueLabel, groupTodos, isOverdue, matchesView, sortTodos, viewCounts } from './views'

const TODAY = '2026-10-26'
let seq = 0
function todo(p: Partial<TodoLike>): TodoLike {
  seq++
  return { id: seq, listId: null, title: `t${seq}`, tags: [], dueDate: null, dueTime: null, priority: 0, done: false, doneAt: null, sort: seq, createdAt: seq, ...p }
}

describe('dueLabel', () => {
  it.each([
    ['2026-10-26', null, '今天'],
    ['2026-10-26', '18:30', '今天 18:30'],
    ['2026-10-27', null, '明天'],
    ['2026-10-28', null, '后天'],
    ['2026-10-25', null, '昨天'],
    ['2026-10-30', null, '周五'],
    ['2026-11-11', null, '11-11 周三'],
    ['2027-01-05', null, '2027-01-05'],
  ])('%s %s → %s', (d, time, text) => {
    expect(dueLabel(d, time, TODAY)).toBe(text)
  })
})

describe('matchesView', () => {
  it('今天包含逾期，不含已完成', () => {
    expect(matchesView(todo({ dueDate: '2026-10-20' }), 'today', TODAY)).toBe(true)
    expect(matchesView(todo({ dueDate: '2026-10-27' }), 'today', TODAY)).toBe(false)
    expect(matchesView(todo({ dueDate: '2026-10-26', done: true }), 'today', TODAY)).toBe(false)
  })
  it('未来 7 天、收集箱、清单、标签、已完成', () => {
    expect(matchesView(todo({ dueDate: '2026-11-01' }), 'week', TODAY)).toBe(true)
    expect(matchesView(todo({ dueDate: '2026-11-02' }), 'week', TODAY)).toBe(false)
    expect(matchesView(todo({ listId: 3 }), 'inbox', TODAY)).toBe(false)
    expect(matchesView(todo({ listId: 3 }), 'list:3', TODAY)).toBe(true)
    expect(matchesView(todo({ tags: ['工作'] }), 'tag:工作', TODAY)).toBe(true)
    expect(matchesView(todo({ done: true }), 'done', TODAY)).toBe(true)
  })
})

describe('排序与分组', () => {
  const items = [
    todo({ title: '无日期' }),
    todo({ title: '以后', dueDate: '2026-12-01' }),
    todo({ title: '今天低', dueDate: TODAY, priority: 1 }),
    todo({ title: '今天高', dueDate: TODAY, priority: 3 }),
    todo({ title: '逾期', dueDate: '2026-10-01' }),
    todo({ title: '明天', dueDate: '2026-10-27' }),
    todo({ title: '周四', dueDate: '2026-10-29' }),
  ]

  it('智能分组', () => {
    const groups = groupTodos(items, 'all', 'smart', TODAY)
    expect(groups.map(g => g.title)).toEqual(['已逾期', '今天', '明天', '10-29 周四', '以后', '无日期'])
    expect(groups[1].items.map(t => t.title)).toEqual(['今天高', '今天低'])
    expect(groups[0].danger).toBe(true)
  })

  it('按优先级、手动排序不分组', () => {
    expect(groupTodos(items, 'all', 'priority', TODAY)).toHaveLength(1)
    expect(sortTodos(items, 'priority')[0].title).toBe('今天高')
    expect(sortTodos(items, 'manual').map(t => t.title)[0]).toBe('无日期')
  })

  it('逾期判断', () => {
    expect(isOverdue({ dueDate: '2026-10-25', done: false }, TODAY)).toBe(true)
    expect(isOverdue({ dueDate: '2026-10-25', done: true }, TODAY)).toBe(false)
  })
})

describe('计数与标签', () => {
  it('各视图数量', () => {
    const list = [todo({ dueDate: TODAY, tags: ['a'] }), todo({ listId: 2, dueDate: '2026-10-30', tags: ['a', 'b'] }), todo({ done: true })]
    expect(viewCounts(list, TODAY)).toMatchObject({ 'today': 1, 'week': 2, 'all': 2, 'inbox': 1, 'list:2': 1, 'tag:a': 2, 'tag:b': 1 })
    expect(allTags(list)).toEqual(['a', 'b'])
  })
})
