import { decode, encode, findInvisible } from './escape'

const off = { nonAscii: false }
const on = { nonAscii: true }

describe('hTML', () => {
  it('编码', () => {
    expect(encode('html', '<a href="x">Tom & \'Jerry\'</a>', off)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;')
    expect(encode('html', '你好😀', on)).toBe('&#20320;&#22909;&#128512;')
  })
  it('解码命名与数字实体', () => {
    expect(decode('html', '&lt;p&gt;&copy; 2026 &amp;&nbsp;&#20320;&#x597D;&#x1F600; &unknown;')).toBe('<p>© 2026 & 你好😀 &unknown;')
  })
})

describe('unicode', () => {
  it('编码非 ASCII', () => {
    expect(encode('unicode', 'a中😀', off)).toBe('a\\u4E2D\\uD83D\\uDE00')
    expect(encode('unicode', 'ab', on)).toBe('\\u0061\\u0062')
  })
  it('解码多种写法', () => {
    expect(decode('unicode', '\\u4e2d\\u6587 \\u{1F600} U+4F60 &#x597D; \\n')).toBe('中文 😀 你 好 \\n')
    expect(decode('unicode', '\\uD83D\\uDE00')).toBe('😀')
  })
})

describe('jS', () => {
  it('往返', () => {
    const s = `He said "hi"\n\tIt's \`ok\` \\ \u0001 ${String.fromCharCode(0x2028)}`
    const e = encode('js', s, off)
    expect(e).toBe('He said \\"hi\\"\\n\\tIt\\\'s \\`ok\\` \\\\ \\x01 \\u2028')
    expect(decode('js', e)).toBe(s)
  })
  it('解码 \\x 与 \\u{}', () => {
    expect(decode('js', '\\x41\\u{4F60}\\q')).toBe('A你q')
  })
})

describe('jSON', () => {
  it('编码', () => {
    expect(encode('json', 'a"b\\c\n中', off)).toBe('a\\"b\\\\c\\n中')
    expect(encode('json', '中', on)).toBe('\\u4E2D')
  })
  it('解码', () => {
    expect(decode('json', 'a\\"b\\\\c\\n\\u4e2d')).toBe('a"b\\c\n中')
    expect(decode('json', '"带引号"')).toBe('带引号')
    expect(() => decode('json', 'a"b')).toThrow('不是有效的 JSON')
  })
})

describe('正则 / SQL / XML', () => {
  it('正则', () => {
    const raw = 'a.b*c (1+1) [x] {2} ^$ | \\ /'
    const e = encode('regex', raw, off)
    expect(new RegExp(e, 'u').test(raw)).toBe(true)
    expect(decode('regex', e)).toBe(raw)
    expect(decode('regex', '\\d+\\.')).toBe('\\d+.')
  })
  it('sQL', () => {
    expect(encode('sql', 'O\'Brien', off)).toBe('O\'\'Brien')
    expect(decode('sql', 'O\'\'Brien')).toBe('O\'Brien')
  })
  it('xML', () => {
    expect(encode('xml', '<a b=\'1\'>&</a>', off)).toBe('&lt;a b=&apos;1&apos;&gt;&amp;&lt;/a&gt;')
    expect(decode('xml', '&lt;&apos;&copy;')).toBe('<\'&copy;')
  })
})

describe('findInvisible', () => {
  it('找出零宽与全角空格', () => {
    expect(findInvisible('a​b　c​\n')).toEqual([
      { code: 'U+200B', name: '零宽空格', count: 2 },
      { code: 'U+3000', name: '全角空格', count: 1 },
    ])
  })
})
