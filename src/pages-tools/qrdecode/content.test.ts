import { analyze } from './content'

describe('analyze', () => {
  it('网址', () => {
    const a = analyze('https://example.com/a?b=1')
    expect(a.kind).toBe('url')
    expect(a.link).toBe('https://example.com/a?b=1')
    expect(a.fields).toEqual([{ label: '域名', value: 'example.com' }])
  })

  it('wi-Fi（含转义字符）', () => {
    const a = analyze('WIFI:T:WPA;S:My\\;Home;P:pa\\:ss\\\\1;H:true;;')
    expect(a.kind).toBe('wifi')
    expect(a.fields).toEqual([
      { label: '网络名称', value: 'My;Home' },
      { label: '密码', value: 'pa:ss\\1' },
      { label: '加密方式', value: 'WPA' },
      { label: '隐藏网络', value: '是' },
    ])
    expect(analyze('WIFI:S:Guest;T:nopass;;').fields[1].value).toBe('（无密码）')
  })

  it('两步验证', () => {
    const a = analyze('otpauth://totp/GitHub:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub')
    expect(a.kind).toBe('otpauth')
    expect(a.fields).toContainEqual({ label: '账号', value: 'alice@example.com' })
    expect(a.fields).toContainEqual({ label: '服务', value: 'GitHub' })
  })

  it('vCard', () => {
    const a = analyze('BEGIN:VCARD\r\nVERSION:3.0\r\nN:张;三;;;\r\nFN:张三\r\nTEL;TYPE=CELL:13800000000\r\nEMAIL:z@example.com\r\nORG:示例公司\r\nEND:VCARD')
    expect(a.kind).toBe('vcard')
    expect(a.fields).toEqual([
      { label: '姓名', value: '张三' },
      { label: '电话', value: '13800000000' },
      { label: '邮箱', value: 'z@example.com' },
      { label: '单位', value: '示例公司' },
    ])
  })

  it('mECARD', () => {
    const a = analyze('MECARD:N:Doe,John;TEL:123;EMAIL:j@x.com;;')
    expect(a.fields[0]).toEqual({ label: '姓名', value: 'John Doe' })
  })

  it('日程', () => {
    const a = analyze('BEGIN:VEVENT\nSUMMARY:周会\nDTSTART:20261012T090000Z\nLOCATION:3 楼\nEND:VEVENT')
    expect(a.kind).toBe('event')
    expect(a.fields).toContainEqual({ label: '开始', value: '2026-10-12 09:00 (UTC)' })
  })

  it('邮件 / 电话 / 短信 / 位置', () => {
    expect(analyze('mailto:a@b.com?subject=Hi%20there').fields).toEqual([{ label: '收件人', value: 'a@b.com' }, { label: '主题', value: 'Hi there' }])
    expect(analyze('tel:+8610123').kind).toBe('tel')
    expect(analyze('SMSTO:10086:查询话费').fields).toEqual([{ label: '号码', value: '10086' }, { label: '内容', value: '查询话费' }])
    expect(analyze('geo:39.9,116.4').fields).toEqual([{ label: '纬度', value: '39.9' }, { label: '经度', value: '116.4' }])
  })

  it('普通文本', () => {
    expect(analyze('hello world').kind).toBe('text')
    expect(analyze('http://has space').kind).toBe('text')
  })
})
