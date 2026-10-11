import { CATEGORIES, convert, formatNumber, groupDigits } from './units'

describe('convert', () => {
  it.each([
    [1, 'km', 'm', 'length', 1000],
    [1, 'in', 'cm', 'length', 2.54],
    [1, 'mi', 'km', 'length', 1.609344],
    [3, 'chi', 'm', 'length', 1],
    [1, 'ha', 'mu', 'area', 15],
    [1, 'jin', 'g', 'mass', 500],
    [1, 'lb', 'kg', 'mass', 0.45359237],
    [100, 'Mbps', 'MBps', 'rate', 12.5],
    [1, 'TB', 'GiB', 'data', 931.32257461548],
    [1, 'kWh', 'kcal', 'energy', 860.42065009560],
    [1, 'atm', 'kPa', 'pressure', 101.325],
    [Math.PI, 'rad', 'deg', 'angle', 180],
    [1, 'd', 'min', 'time', 1440],
    [100, 'kmh', 'ms', 'speed', 27.77777777777778],
  ])('%d %s → %s', (v, from, to, cat, expected) => {
    expect(convert(v, from, to, cat)).toBeCloseTo(expected, 9)
  })

  it.each([
    [100, 'C', 'F', 212],
    [-40, 'C', 'F', -40],
    [32, 'F', 'C', 0],
    [0, 'C', 'K', 273.15],
    [0, 'K', 'C', -273.15],
    [491.67, 'R', 'C', 0],
  ])('温度 %d %s → %s', (v, from, to, expected) => {
    expect(convert(v, from, to, 'temperature')).toBeCloseTo(expected, 9)
  })

  it('同类别内任意两单位互换可还原', () => {
    for (const cat of CATEGORIES) {
      for (const a of cat.units) {
        for (const b of cat.units)
          expect(convert(convert(123.456, a.id, b.id, cat.id), b.id, a.id, cat.id)).toBeCloseTo(123.456, 6)
      }
    }
  })

  it('单位 id 在类别内唯一', () => {
    for (const cat of CATEGORIES) {
      expect(new Set(cat.units.map(x => x.id)).size).toBe(cat.units.length)
      expect(cat.units.some(x => x.id === cat.defaultUnit)).toBe(true)
    }
  })
})

describe('formatNumber', () => {
  it.each([
    [0.1 + 0.2, '0.3'],
    [1000, '1000'],
    [2.54, '2.54'],
    [1 / 3, '0.333333333333'],
    [0.0000001, '0.0000001'],
    [1.5e-12, '1.5e-12'],
    [9460730472580800, '9.46073047258e15'],
    [-12.5, '-12.5'],
    [0, '0'],
  ])('%d → %s', (n, s) => {
    expect(formatNumber(n)).toBe(s)
  })
})

describe('groupDigits', () => {
  it('千分位', () => {
    expect(groupDigits('1234567.891')).toBe('1,234,567.891')
    expect(groupDigits('-1234')).toBe('-1,234')
    expect(groupDigits('123')).toBe('123')
    expect(groupDigits('1.5e-12')).toBe('1.5e-12')
  })
})
