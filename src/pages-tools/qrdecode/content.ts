/** 识别二维码内容的类型，并拆出关键字段（纯函数，便于单测） */

export type ContentKind = 'url' | 'wifi' | 'otpauth' | 'vcard' | 'mecard' | 'email' | 'tel' | 'sms' | 'geo' | 'event' | 'text'

export interface Analysis {
  kind: ContentKind
  label: string
  fields: { label: string, value: string }[]
  /** 可以直接打开的链接 */
  link?: string
}

/** WIFI:T:WPA;S:名称;P:密码;H:false;; 中的 \; \: \\ 需要反转义 */
function splitEscaped(body: string) {
  const out: Record<string, string> = {}
  let key = ''
  let buf = ''
  let inKey = true
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === '\\' && i + 1 < body.length) {
      buf += body[++i]
      continue
    }
    if (inKey && ch === ':') {
      key = buf
      buf = ''
      inKey = false
      continue
    }
    if (ch === ';') {
      if (key)
        out[key.toUpperCase()] = buf
      key = ''
      buf = ''
      inKey = true
      continue
    }
    buf += ch
  }
  if (key)
    out[key.toUpperCase()] = buf
  return out
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s)
  }
  catch {
    return s
  }
}

function query(s: string) {
  const q: Record<string, string> = {}
  const i = s.indexOf('?')
  if (i < 0)
    return q
  for (const pair of s.slice(i + 1).split('&')) {
    const [k, v = ''] = pair.split('=')
    if (k)
      q[k.toLowerCase()] = safeDecode(v.replace(/\+/g, ' '))
  }
  return q
}

/** vCard / iCalendar 的「属性:值」行，忽略参数（如 TEL;TYPE=CELL:） */
function contentLines(text: string) {
  // 以空格开头的行是上一行的续行
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  return lines.map((l) => {
    const i = l.indexOf(':')
    return i < 0 ? null : { name: l.slice(0, i).split(';')[0].toUpperCase(), value: l.slice(i + 1).replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, ' ') }
  }).filter(Boolean) as { name: string, value: string }[]
}

/** 20261011T090000Z → 2026-10-11 09:00 (UTC) */
function icsTime(v: string) {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/)
  if (!m)
    return v
  return `${m[1]}-${m[2]}-${m[3]}${m[4] ? ` ${m[4]}:${m[5]}` : ''}${v.endsWith('Z') ? ' (UTC)' : ''}`
}

export function analyze(raw: string): Analysis {
  const text = raw.trim()
  const lower = text.toLowerCase()

  if (/^https?:\/\/\S+$/i.test(text)) {
    let host = ''
    try {
      host = new URL(text).host
    }
    catch {}
    return { kind: 'url', label: '网址', fields: host ? [{ label: '域名', value: host }] : [], link: text }
  }

  if (lower.startsWith('wifi:')) {
    const f = splitEscaped(text.slice(5))
    const type = (f.T || 'nopass').toUpperCase()
    return {
      kind: 'wifi',
      label: 'Wi-Fi',
      fields: [
        { label: '网络名称', value: f.S ?? '' },
        { label: '密码', value: type === 'NOPASS' ? '（无密码）' : f.P ?? '' },
        { label: '加密方式', value: type === 'NOPASS' ? '无' : type },
        ...(f.H === 'true' ? [{ label: '隐藏网络', value: '是' }] : []),
      ],
    }
  }

  if (lower.startsWith('otpauth://')) {
    const q = query(text)
    const path = text.slice(10)
    const type = path.slice(0, path.indexOf('/')).toUpperCase()
    const label = safeDecode(path.slice(path.indexOf('/') + 1).split('?')[0])
    const [issuer, account] = label.includes(':') ? [label.slice(0, label.indexOf(':')), label.slice(label.indexOf(':') + 1)] : ['', label]
    return {
      kind: 'otpauth',
      label: '两步验证密钥',
      fields: [
        { label: '服务', value: q.issuer || issuer },
        { label: '账号', value: account.trim() },
        { label: '类型', value: type === 'TOTP' ? '基于时间（TOTP）' : type },
        { label: '密钥', value: q.secret ?? '' },
      ].filter(f => f.value),
    }
  }

  if (lower.startsWith('begin:vcard')) {
    const lines = contentLines(text)
    const get = (n: string) => lines.filter(l => l.name === n).map(l => l.value)
    const name = get('FN')[0] || get('N')[0]?.split(';').filter(Boolean).reverse().join(' ') || ''
    return {
      kind: 'vcard',
      label: '名片',
      fields: [
        { label: '姓名', value: name },
        ...get('TEL').map(v => ({ label: '电话', value: v })),
        ...get('EMAIL').map(v => ({ label: '邮箱', value: v })),
        { label: '单位', value: get('ORG')[0]?.replace(/;/g, ' ') ?? '' },
        { label: '职位', value: get('TITLE')[0] ?? '' },
        { label: '地址', value: get('ADR')[0]?.split(';').filter(Boolean).join(' ') ?? '' },
        { label: '网址', value: get('URL')[0] ?? '' },
      ].filter(f => f.value),
    }
  }

  if (lower.startsWith('mecard:')) {
    const f = splitEscaped(text.slice(7))
    return {
      kind: 'mecard',
      label: '名片',
      fields: [
        { label: '姓名', value: (f.N ?? '').split(',').reverse().join(' ').trim() },
        { label: '电话', value: f.TEL ?? '' },
        { label: '邮箱', value: f.EMAIL ?? '' },
        { label: '地址', value: f.ADR ?? '' },
        { label: '网址', value: f.URL ?? '' },
        { label: '备注', value: f.NOTE ?? '' },
      ].filter(x => x.value),
    }
  }

  if (lower.startsWith('begin:vevent') || lower.startsWith('begin:vcalendar')) {
    const lines = contentLines(text)
    const get = (n: string) => lines.find(l => l.name === n)?.value ?? ''
    return {
      kind: 'event',
      label: '日程',
      fields: [
        { label: '标题', value: get('SUMMARY') },
        { label: '开始', value: icsTime(get('DTSTART')) },
        { label: '结束', value: icsTime(get('DTEND')) },
        { label: '地点', value: get('LOCATION') },
        { label: '说明', value: get('DESCRIPTION') },
      ].filter(f => f.value),
    }
  }

  if (lower.startsWith('mailto:') || lower.startsWith('matmsg:')) {
    if (lower.startsWith('matmsg:')) {
      const f = splitEscaped(text.slice(7))
      return { kind: 'email', label: '邮件', fields: [{ label: '收件人', value: f.TO ?? '' }, { label: '主题', value: f.SUB ?? '' }, { label: '正文', value: f.BODY ?? '' }].filter(x => x.value) }
    }
    const q = query(text)
    const to = safeDecode(text.slice(7).split('?')[0])
    return { kind: 'email', label: '邮件', fields: [{ label: '收件人', value: to }, { label: '主题', value: q.subject ?? '' }, { label: '正文', value: q.body ?? '' }].filter(x => x.value), link: text }
  }

  if (lower.startsWith('tel:'))
    return { kind: 'tel', label: '电话', fields: [{ label: '号码', value: text.slice(4) }], link: text }

  if (lower.startsWith('smsto:') || lower.startsWith('sms:')) {
    const body = text.slice(text.indexOf(':') + 1)
    const [num, ...msg] = lower.startsWith('smsto:') ? body.split(':') : [body.split('?')[0]]
    const q = query(text)
    return { kind: 'sms', label: '短信', fields: [{ label: '号码', value: num }, { label: '内容', value: msg.join(':') || q.body || '' }].filter(x => x.value) }
  }

  if (lower.startsWith('geo:')) {
    const [lat, lng] = text.slice(4).split(/[,?;]/)
    return {
      kind: 'geo',
      label: '地理位置',
      fields: [{ label: '纬度', value: lat }, { label: '经度', value: lng }],
      link: `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lng)}#map=15/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}`,
    }
  }

  return { kind: 'text', label: '文本', fields: [] }
}
