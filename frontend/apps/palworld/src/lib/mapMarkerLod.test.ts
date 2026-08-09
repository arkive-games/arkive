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

  it('floors a default-active subtype at tier 1 whatever its density', () => {
    // MainWorld's fastTravel is 137 markers, which by density alone landed in
    // tier 2 and hid the whole fast-travel network at the opening zoom.
    expect(mapMarkerLodTier(137, true)).toBe(1)
    expect(mapMarkerLodTier(137, false)).toBe(2)
    expect(mapMarkerLodTier(9999, true)).toBe(1)
  })
})
