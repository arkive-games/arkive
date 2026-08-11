import { describe, expect, it } from 'vitest'
import type { PalEntry, PalStats } from '../../lib/pals'
import { EMPTY_FILTER, filterPals, isFilterActive } from './useFilteredPals'

const STATS: PalStats = {
  hp: 0, meleeAttack: 0, shotAttack: 0, defense: 0, support: 0, craftSpeed: 0, stamina: 0,
  foodAmount: 0, maxFullStomach: 0, captureRate: 0, expRatio: 0, price: 0, maleProbability: 50,
  slowWalkSpeed: 0, walkSpeed: 0, runSpeed: 0, rideSprintSpeed: 0,
  transportSpeed: 0, swimSpeed: 0,
}

let seq = 0
/** A minimal roster entry; only the fields the filter reads vary per test. */
function pal(over: Partial<PalEntry> & { id: string }): PalEntry {
  seq += 1
  return {
    zukanIndex: seq,
    zukanIndexSuffix: '',
    icon: '',
    elements: ['Normal'],
    genus: '',
    size: 'M',
    rarity: 1,
    egg: '',
    nocturnal: false,
    reaction: 'Escape',
    stats: STATS,
    work: {},
    bestWork: 'Handcraft',
    partnerSkill: {},
    activeSkills: [],
    passives: [],
    drops: [],
    summonable: false,
    ...over,
  }
}

const bundleOf = (pals: PalEntry[], powers: Record<string, number> = {}) => ({
  pals,
  text: {},
  breedingPower: new Map(Object.entries(powers)),
})

describe('filterPals - breeding-power search', () => {
  it('orders nearby breeding powers and excludes values outside the distance window', () => {
    const roster = [
      pal({ id: 'Far', zukanIndex: 1 }),
      pal({ id: 'Exact', zukanIndex: 2 }),
      pal({ id: 'NearHigh', zukanIndex: 3 }),
      pal({ id: 'NearLow', zukanIndex: 4 }),
    ]
    const out = filterPals(
      bundleOf(roster, { Far: 1000, Exact: 1230, NearHigh: 1240, NearLow: 1220 }),
      { ...EMPTY_FILTER, query: '1230' },
    )
    expect(out.map((p) => p.id)).toEqual(['Exact', 'NearHigh', 'NearLow'])
  })

  it('returns an empty roster when a numeric target is outside every breeding-power window', () => {
    const roster = [
      pal({ id: 'Low', zukanIndex: 1 }),
      pal({ id: 'High', zukanIndex: 2 }),
    ]
    const out = filterPals(
      bundleOf(roster, { Low: 10, High: 3100 }),
      { ...EMPTY_FILTER, query: '9999' },
    )

    expect(out).toEqual([])
  })

  it('pins an exact Paldeck number before breeding-power proximity results', () => {
    const roster = [
      pal({ id: 'ExactPower', zukanIndex: 7 }),
      pal({ id: 'ExactPaldeck', zukanIndex: 123 }),
      pal({ id: 'NearPower', zukanIndex: 8 }),
    ]
    const out = filterPals(
      bundleOf(roster, { ExactPower: 123, ExactPaldeck: 500, NearPower: 124 }),
      { ...EMPTY_FILTER, query: '123' },
    )

    expect(out.map((p) => p.id)).toEqual(['ExactPaldeck', 'ExactPower', 'NearPower'])
  })

  it('applies facets before breeding-power ordering', () => {
    const roster = [
      pal({ id: 'FireExact', zukanIndex: 1, elements: ['Fire'] }),
      pal({ id: 'WaterNear', zukanIndex: 2, elements: ['Water'] }),
      pal({ id: 'FireFar', zukanIndex: 3, elements: ['Fire'] }),
    ]
    const out = filterPals(
      bundleOf(roster, { FireExact: 1230, WaterNear: 1231, FireFar: 1300 }),
      { ...EMPTY_FILTER, query: '1230', elements: ['Fire'] },
    )
    expect(out.map((p) => p.id)).toEqual(['FireExact', 'FireFar'])
  })

  it('keeps explicit No. queries as exact Paldeck lookups', () => {
    const roster = [
      pal({ id: 'Wanted', zukanIndex: 123 }),
      pal({ id: 'Neighbour', zukanIndex: 124 }),
    ]
    const out = filterPals(
      bundleOf(roster, { Wanted: 500, Neighbour: 123 }),
      { ...EMPTY_FILTER, query: 'No.123' },
    )
    expect(out.map((p) => p.id)).toEqual(['Wanted'])
  })
})

describe('filterPals — size filter', () => {
  it('keeps only pals whose size is selected (OR within the group)', () => {
    const roster = [
      pal({ id: 'A', size: 'XS' }),
      pal({ id: 'B', size: 'M' }),
      pal({ id: 'C', size: 'XL' }),
    ]
    const out = filterPals(bundleOf(roster), { ...EMPTY_FILTER, sizes: ['XS', 'XL'] })
    expect(out.map((p) => p.id)).toEqual(['A', 'C'])
  })

  it('applies no size filtering when none selected', () => {
    const roster = [pal({ id: 'A', size: 'XS' }), pal({ id: 'B', size: 'L' })]
    expect(filterPals(bundleOf(roster), EMPTY_FILTER)).toHaveLength(2)
  })

  it('ANDs sizes with the other filter groups', () => {
    const roster = [
      pal({ id: 'FireXS', size: 'XS', elements: ['Fire'] }),
      pal({ id: 'FireL', size: 'L', elements: ['Fire'] }),
      pal({ id: 'WaterXS', size: 'XS', elements: ['Water'] }),
    ]
    const out = filterPals(bundleOf(roster), {
      ...EMPTY_FILTER,
      sizes: ['XS'],
      elements: ['Fire'],
    })
    expect(out.map((p) => p.id)).toEqual(['FireXS'])
  })

  it('counts sizes toward isFilterActive', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false)
    expect(isFilterActive({ ...EMPTY_FILTER, sizes: ['M'] })).toBe(true)
  })

  it('keeps pre-sizes stored filters valid via the EMPTY_FILTER merge', () => {
    // Simulates PalListPage.readStoredFilter: an old stored object without
    // `sizes`, spread onto EMPTY_FILTER, must yield a usable filter.
    const legacy = {
      query: '', elements: [], works: [], reactions: [], nocturnal: false, loot: null,
    }
    const merged = { ...EMPTY_FILTER, ...legacy }
    expect(merged.sizes).toEqual([])
    expect(isFilterActive(merged)).toBe(false)
  })
})
