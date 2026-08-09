import { describe, it, expect } from 'vitest'

import { compareZukan, formatPalId, palIdText } from './palId'

describe('formatPalId', () => {
  it('formats catalogued Paldeck ids into structured parts', () => {
    expect(formatPalId(1)).toEqual({ text: 'No.001', accent: undefined })
    expect(formatPalId(1, '')).toEqual({ text: 'No.001', accent: undefined })
    expect(formatPalId(37)).toEqual({ text: 'No.037', accent: undefined })
    expect(formatPalId(37, 'B')).toEqual({ text: 'No.037', accent: 'B' })
    expect(formatPalId(204)).toEqual({ text: 'No.204', accent: undefined })
  })

  it('returns undefined for uncatalogued values', () => {
    expect(formatPalId(undefined)).toBeUndefined()
    expect(formatPalId(0)).toBeUndefined()
    expect(formatPalId(-1)).toBeUndefined()
  })
})

describe('palIdText', () => {
  it('flattens the id (with suffix) to a plain string', () => {
    expect(palIdText(formatPalId(37, 'B'))).toBe('No.037B')
    expect(palIdText(formatPalId(1))).toBe('No.001')
    expect(palIdText(undefined)).toBeUndefined()
  })
})

describe('compareZukan', () => {
  const pals = [
    { id: 'Pal32B', zukanIndex: 32, zukanIndexSuffix: 'B' },
    { id: 'Uncatalogued', zukanIndex: 0 },
    { id: 'Pal185', zukanIndex: 185 },
    { id: 'Pal1', zukanIndex: 1 },
    { id: 'Pal32', zukanIndex: 32 },
  ]

  it('orders numbered pals ascending and keeps uncatalogued pals last', () => {
    expect([...pals].sort((a, b) => compareZukan(a, b, 'ascending')).map((pal) => pal.id)).toEqual([
      'Pal1',
      'Pal32',
      'Pal32B',
      'Pal185',
      'Uncatalogued',
    ])
  })

  it('orders numbered pals descending and still keeps uncatalogued pals last', () => {
    expect([...pals].sort((a, b) => compareZukan(a, b, 'descending')).map((pal) => pal.id)).toEqual([
      'Pal185',
      'Pal32B',
      'Pal32',
      'Pal1',
      'Uncatalogued',
    ])
  })
})
