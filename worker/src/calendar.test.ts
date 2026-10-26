// @vitest-environment node
import { buildCalendar, foldLine, icsEscape } from './calendar'

describe('iCalendar 文本', () => {
  it('转义逗号、分号、反斜杠与换行', () => {
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
  })

  it('每行不超过 75 字节，不拆开中文字符', () => {
    const line = `SUMMARY:${'纪念日'.repeat(20)}`
    const folded = foldLine(line)
    const parts = folded.split('\r\n ')
    expect(parts.length).toBeGreaterThan(1)
    for (const p of parts)
      expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75)
    expect(parts.join('')).toBe(line)
  })

  it('全天事件、定时事件与提醒', () => {
    const ics = buildCalendar('测试', [
      { uid: 'a@otools', title: '🎂 妈妈生日（60 岁）', date: '2026-12-04', alarms: [540, 540 - 1440] },
      { uid: 'b@otools', title: '☑ 交周报', start: Date.UTC(2026, 9, 27, 7, 0) / 1000, duration: 30, alarms: [-15] },
    ], Date.UTC(2026, 9, 26) / 1000)
    expect(ics).toContain('DTSTART;VALUE=DATE:20261204\r\nDTEND;VALUE=DATE:20261205')
    expect(ics).toContain('TRIGGER:PT540M')
    expect(ics).toContain('TRIGGER:-PT900M')
    expect(ics).toContain('DTSTART:20261027T070000Z\r\nDTEND:20261027T073000Z')
    expect(ics).toContain('TRIGGER:-PT15M')
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
  })
})
