import { describe, expect, it } from 'vitest'
import { mapMarkerLodTier } from './mapMarkerLod'

describe('mapMarkerLodTier', () => {
  it('keeps sparse subtypes in the overview', () => {
    expect(mapMarkerLodTier(1)).toBe(1)
    expect(mapMarkerLodTier(50)).toBe(1)
  })

  it('defers medium and dense subtypes to closer zoom levels', () => {
    expect(mapMarkerLodTier(51)).toBe(2)
    expect(mapMarkerLodTier(250)).toBe(2)
    expect(mapMarkerLodTier(251)).toBe(3)
  })
})
