import { describe, expect, it } from 'vitest'
import type { RegionInstance } from '@gamemap/data-contract'
import { pointInPolygon, sortRegionsByArea, regionAt } from './subzone'

const square = (id: string, x0: number, y0: number, x1: number, y1: number): RegionInstance => ({
  id,
  name: id,
  type: 'poi',
  borders: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
})

describe('pointInPolygon', () => {
  const ring = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]

  it('accepts an interior point', () => {
    expect(pointInPolygon(5, 5, ring)).toBe(true)
  })

  it('rejects an exterior point', () => {
    expect(pointInPolygon(15, 5, ring)).toBe(false)
    expect(pointInPolygon(5, -1, ring)).toBe(false)
  })

  it('handles a concave ring', () => {
    // An L shape: (0,0)-(10,0)-(10,4)-(4,4)-(4,10)-(0,10)
    const l = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10], [0, 0]]
    expect(pointInPolygon(2, 8, l)).toBe(true)
    expect(pointInPolygon(8, 8, l)).toBe(false)
  })
})

describe('sortRegionsByArea', () => {
  it('orders smallest first so the most specific region wins', () => {
    const sorted = sortRegionsByArea([
      square('big', 0, 0, 100, 100),
      square('small', 10, 10, 20, 20),
      square('mid', 0, 0, 50, 50),
    ])
    expect(sorted.map((r) => r.id)).toEqual(['small', 'mid', 'big'])
  })

  it('sums multi-ring regions', () => {
    const two: RegionInstance = {
      id: 'two', name: 'two', type: 'poi',
      borders: [
        [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
        [[50, 50], [90, 50], [90, 90], [50, 90], [50, 50]],
      ],
    }
    const sorted = sortRegionsByArea([two, square('one', 0, 0, 30, 30)])
    expect(sorted.map((r) => r.id)).toEqual(['one', 'two'])
  })
})

describe('regionAt', () => {
  const sorted = sortRegionsByArea([
    square('big', 0, 0, 100, 100),
    square('small', 10, 10, 20, 20),
  ])

  it('returns the smallest region containing the point', () => {
    expect(regionAt(sorted, 15, 15)?.id).toBe('small')
  })

  it('falls through to the enclosing region', () => {
    expect(regionAt(sorted, 60, 60)?.id).toBe('big')
  })

  it('returns undefined outside every region', () => {
    expect(regionAt(sorted, 500, 500)).toBeUndefined()
  })
})
