import { describe, expect, it } from 'vitest'
import type { PalEntry, PalStats } from '../../lib/pals'
import { EMPTY_FILTER, filterPals, isFilterActive } from './useFilteredPals'

const STATS: PalStats = {
  hp: 0, meleeAttack: 0, shotAttack: 0, defense: 0, craftSpeed: 0, stamina: 0,
  foodAmount: 0, maxFullStomach: 0, captureRate: 0, price: 0, maleProbability: 50,
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

const bundleOf = (pals: PalEntry[]) => ({ pals, text: {} })

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
