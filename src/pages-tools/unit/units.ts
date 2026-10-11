/** 单位换算：各类别的单位定义与换算（纯函数，便于单测） */

export interface Unit {
  id: string
  name: string
  symbol: string
  /** 1 个该单位 = factor 个基准单位；温度不用此字段 */
  factor: number
}

export interface UnitCategory {
  id: string
  name: string
  icon: string
  units: Unit[]
  /** 默认的输入单位 */
  defaultUnit: string
  note?: string
}

const u = (id: string, name: string, symbol: string, factor: number): Unit => ({ id, name, symbol, factor })

export const CATEGORIES: UnitCategory[] = [
  {
    id: 'length',
    name: '长度',
    icon: 'i-carbon-ruler',
    defaultUnit: 'm',
    units: [
      u('km', '千米', 'km', 1000),
      u('m', '米', 'm', 1),
      u('dm', '分米', 'dm', 0.1),
      u('cm', '厘米', 'cm', 0.01),
      u('mm', '毫米', 'mm', 0.001),
      u('um', '微米', 'μm', 1e-6),
      u('nm', '纳米', 'nm', 1e-9),
      u('li', '里', '里', 500),
      u('zhang', '丈', '丈', 10 / 3),
      u('chi', '尺', '尺', 1 / 3),
      u('cun', '寸', '寸', 1 / 30),
      u('mi', '英里', 'mi', 1609.344),
      u('yd', '码', 'yd', 0.9144),
      u('ft', '英尺', 'ft', 0.3048),
      u('in', '英寸', 'in', 0.0254),
      u('nmi', '海里', 'nmi', 1852),
      u('au', '天文单位', 'au', 149597870700),
      u('ly', '光年', 'ly', 9460730472580800),
    ],
    note: '市制：1 里 = 500 米，1 尺 = 1/3 米，1 寸 = 1/10 尺',
  },
  {
    id: 'area',
    name: '面积',
    icon: 'i-carbon-area',
    defaultUnit: 'm2',
    units: [
      u('km2', '平方千米', 'km²', 1e6),
      u('ha', '公顷', 'ha', 1e4),
      u('mu', '亩', '亩', 10000 / 15),
      u('m2', '平方米', 'm²', 1),
      u('dm2', '平方分米', 'dm²', 0.01),
      u('cm2', '平方厘米', 'cm²', 1e-4),
      u('mm2', '平方毫米', 'mm²', 1e-6),
      u('mi2', '平方英里', 'mi²', 2589988.110336),
      u('acre', '英亩', 'acre', 4046.8564224),
      u('yd2', '平方码', 'yd²', 0.83612736),
      u('ft2', '平方英尺', 'ft²', 0.09290304),
      u('in2', '平方英寸', 'in²', 0.00064516),
    ],
    note: '1 亩 = 10000/15 ≈ 666.67 平方米，15 亩 = 1 公顷',
  },
  {
    id: 'volume',
    name: '体积',
    icon: 'i-carbon-chart-3d',
    defaultUnit: 'L',
    units: [
      u('m3', '立方米', 'm³', 1),
      u('L', '升', 'L', 0.001),
      u('dL', '分升', 'dL', 1e-4),
      u('mL', '毫升', 'mL', 1e-6),
      u('cm3', '立方厘米', 'cm³', 1e-6),
      u('tbsp', '汤匙', 'tbsp', 1.5e-5),
      u('tsp', '茶匙', 'tsp', 5e-6),
      u('galUS', '美制加仑', 'gal', 0.003785411784),
      u('galUK', '英制加仑', 'gal(UK)', 0.00454609),
      u('qt', '美制夸脱', 'qt', 0.000946352946),
      u('pt', '美制品脱', 'pt', 0.000473176473),
      u('cup', '美制杯', 'cup', 0.0002365882365),
      u('floz', '美制液量盎司', 'fl oz', 2.95735295625e-5),
      u('ft3', '立方英尺', 'ft³', 0.028316846592),
      u('in3', '立方英寸', 'in³', 1.6387064e-5),
    ],
    note: '汤匙、茶匙按公制 15 mL、5 mL 计算',
  },
  {
    id: 'mass',
    name: '质量',
    icon: 'i-carbon-scales',
    defaultUnit: 'kg',
    units: [
      u('t', '吨', 't', 1000),
      u('kg', '千克', 'kg', 1),
      u('g', '克', 'g', 0.001),
      u('mg', '毫克', 'mg', 1e-6),
      u('ug', '微克', 'μg', 1e-9),
      u('dan', '担', '担', 50),
      u('jin', '斤', '斤', 0.5),
      u('liang', '两', '两', 0.05),
      u('qian', '钱', '钱', 0.005),
      u('lb', '磅', 'lb', 0.45359237),
      u('oz', '盎司', 'oz', 0.028349523125),
      u('ozt', '金衡盎司', 'oz t', 0.0311034768),
      u('st', '英石', 'st', 6.35029318),
      u('ct', '克拉', 'ct', 0.0002),
      u('ton', '短吨（美）', 'ton', 907.18474),
      u('lt', '长吨（英）', 'LT', 1016.0469088),
    ],
    note: '市制：1 斤 = 10 两 = 500 克；黄金常用金衡盎司',
  },
  {
    id: 'temperature',
    name: '温度',
    icon: 'i-carbon-temperature',
    defaultUnit: 'C',
    units: [
      u('C', '摄氏度', '°C', 1),
      u('F', '华氏度', '°F', 1),
      u('K', '开尔文', 'K', 1),
      u('R', '兰氏度', '°R', 1),
    ],
  },
  {
    id: 'speed',
    name: '速度',
    icon: 'i-carbon-dashboard',
    defaultUnit: 'kmh',
    units: [
      u('ms', '米/秒', 'm/s', 1),
      u('kmh', '千米/时', 'km/h', 1 / 3.6),
      u('mph', '英里/时', 'mph', 0.44704),
      u('kn', '节', 'kn', 1852 / 3600),
      u('fts', '英尺/秒', 'ft/s', 0.3048),
      u('mach', '马赫（海平面 15°C）', 'Ma', 340.294),
      u('c', '光速', 'c', 299792458),
    ],
  },
  {
    id: 'time',
    name: '时间',
    icon: 'i-carbon-time',
    defaultUnit: 'h',
    units: [
      u('ns', '纳秒', 'ns', 1e-9),
      u('us', '微秒', 'μs', 1e-6),
      u('ms', '毫秒', 'ms', 0.001),
      u('s', '秒', 's', 1),
      u('min', '分钟', 'min', 60),
      u('h', '小时', 'h', 3600),
      u('d', '天', 'd', 86400),
      u('wk', '周', 'wk', 604800),
      u('mo', '月（平均）', 'mo', 2629746),
      u('yr', '年（平均）', 'yr', 31556952),
    ],
    note: '月、年按公历平均值计算：1 年 = 365.2425 天',
  },
  {
    id: 'data',
    name: '数据大小',
    icon: 'i-carbon-data-base',
    defaultUnit: 'GB',
    units: [
      u('bit', '比特', 'bit', 1 / 8),
      u('B', '字节', 'B', 1),
      u('KB', '千字节', 'KB', 1e3),
      u('MB', '兆字节', 'MB', 1e6),
      u('GB', '吉字节', 'GB', 1e9),
      u('TB', '太字节', 'TB', 1e12),
      u('PB', '拍字节', 'PB', 1e15),
      u('KiB', 'KiB', 'KiB', 1024),
      u('MiB', 'MiB', 'MiB', 1024 ** 2),
      u('GiB', 'GiB', 'GiB', 1024 ** 3),
      u('TiB', 'TiB', 'TiB', 1024 ** 4),
      u('PiB', 'PiB', 'PiB', 1024 ** 5),
    ],
    note: '硬盘厂商按 1000 进制（GB），Windows 显示的「GB」实际是 1024 进制（GiB），所以 1 TB 硬盘显示约 931 GB',
  },
  {
    id: 'rate',
    name: '网速',
    icon: 'i-carbon-wifi',
    defaultUnit: 'Mbps',
    units: [
      u('bps', '比特/秒', 'bps', 1),
      u('Kbps', '千比特/秒', 'Kbps', 1e3),
      u('Mbps', '兆比特/秒', 'Mbps', 1e6),
      u('Gbps', '吉比特/秒', 'Gbps', 1e9),
      u('Bps', '字节/秒', 'B/s', 8),
      u('KBps', '千字节/秒', 'KB/s', 8e3),
      u('MBps', '兆字节/秒', 'MB/s', 8e6),
      u('GBps', '吉字节/秒', 'GB/s', 8e9),
      u('MiBps', 'MiB/秒', 'MiB/s', 8 * 1024 ** 2),
    ],
    note: '宽带标称的「100M」是 100 Mbps，理论下载速度 = 100 ÷ 8 = 12.5 MB/s',
  },
  {
    id: 'pressure',
    name: '压强',
    icon: 'i-carbon-meter',
    defaultUnit: 'kPa',
    units: [
      u('Pa', '帕', 'Pa', 1),
      u('hPa', '百帕', 'hPa', 100),
      u('kPa', '千帕', 'kPa', 1000),
      u('MPa', '兆帕', 'MPa', 1e6),
      u('bar', '巴', 'bar', 1e5),
      u('mbar', '毫巴', 'mbar', 100),
      u('atm', '标准大气压', 'atm', 101325),
      u('mmHg', '毫米汞柱', 'mmHg', 133.322387415),
      u('psi', '磅力/平方英寸', 'psi', 6894.757293168),
      u('kgfcm2', '千克力/平方厘米', 'kgf/cm²', 98066.5),
      u('mH2O', '米水柱', 'mH₂O', 9806.65),
    ],
    note: '血压常用 mmHg，胎压常用 bar / psi / kPa',
  },
  {
    id: 'energy',
    name: '能量',
    icon: 'i-carbon-lightning',
    defaultUnit: 'kcal',
    units: [
      u('J', '焦耳', 'J', 1),
      u('kJ', '千焦', 'kJ', 1000),
      u('MJ', '兆焦', 'MJ', 1e6),
      u('cal', '卡', 'cal', 4.184),
      u('kcal', '千卡（大卡）', 'kcal', 4184),
      u('Wh', '瓦时', 'Wh', 3600),
      u('kWh', '千瓦时（度）', 'kWh', 3.6e6),
      u('eV', '电子伏', 'eV', 1.602176634e-19),
      u('BTU', '英热单位', 'BTU', 1055.05585262),
    ],
    note: '食品标签上的能量：1 千卡 = 4.184 千焦',
  },
  {
    id: 'power',
    name: '功率',
    icon: 'i-carbon-flash',
    defaultUnit: 'kW',
    units: [
      u('W', '瓦', 'W', 1),
      u('kW', '千瓦', 'kW', 1000),
      u('MW', '兆瓦', 'MW', 1e6),
      u('PS', '公制马力', 'PS', 735.49875),
      u('hp', '英制马力', 'hp', 745.69987158227),
      u('BTUh', '英热单位/时', 'BTU/h', 0.29307107017),
      u('P', '匹（空调）', '匹', 735.49875),
    ],
    note: '空调的「匹」源自马力，按 735 W 输入功率换算；实际选购一般看制冷量（1 匹约 2500 W 制冷量）',
  },
  {
    id: 'angle',
    name: '角度',
    icon: 'i-carbon-rotate',
    defaultUnit: 'deg',
    units: [
      u('deg', '度', '°', 1),
      u('rad', '弧度', 'rad', 180 / Math.PI),
      u('grad', '百分度', 'gon', 0.9),
      u('arcmin', '角分', '′', 1 / 60),
      u('arcsec', '角秒', '″', 1 / 3600),
      u('turn', '圈', 'turn', 360),
    ],
  },
]

/** 温度先换成开尔文再换出 */
function toKelvin(v: number, unit: string) {
  switch (unit) {
    case 'C':
      return v + 273.15
    case 'F':
      return (v - 32) * 5 / 9 + 273.15
    case 'R':
      return v * 5 / 9
    default:
      return v
  }
}

function fromKelvin(k: number, unit: string) {
  switch (unit) {
    case 'C':
      return k - 273.15
    case 'F':
      return (k - 273.15) * 9 / 5 + 32
    case 'R':
      return k * 9 / 5
    default:
      return k
  }
}

export function getCategory(id: string) {
  return CATEGORIES.find(c => c.id === id)
}

export function convert(value: number, from: string, to: string, categoryId: string) {
  const cat = getCategory(categoryId)
  if (!cat)
    throw new Error(`未知类别：${categoryId}`)
  if (categoryId === 'temperature')
    return fromKelvin(toKelvin(value, from), to)
  const f = cat.units.find(x => x.id === from)
  const t = cat.units.find(x => x.id === to)
  if (!f || !t)
    throw new Error('未知单位')
  return (value * f.factor) / t.factor
}

/** 格式化：最多 12 位有效数字，去掉浮点误差与末尾的 0；过大或过小时用科学计数法 */
export function formatNumber(n: number) {
  if (!Number.isFinite(n))
    return '—'
  if (n === 0)
    return '0'
  const abs = Math.abs(n)
  if (abs >= 1e15 || abs < 1e-9)
    return n.toExponential(11).replace(/\.?0+e/, 'e').replace('e+', 'e')
  const s = Number(n.toPrecision(12)).toString()
  // toString 对 1e-7 之类仍会输出科学计数法，这里统一转成小数
  if (s.includes('e')) {
    const digits = Math.min(20, Math.max(0, 11 - Math.floor(Math.log10(abs))))
    return n.toFixed(digits).replace(/\.?0+$/, '')
  }
  return s
}

/** 千分位分组，仅用于展示 */
export function groupDigits(s: string) {
  if (s.includes('e'))
    return s
  const [int, dec] = s.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dec ? `${grouped}.${dec}` : grouped
}
