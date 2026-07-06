import { describe, it, expect } from 'vitest'

import type { TechEntry } from '../../lib/catalog'
import {
  buildRegions,
  groupByLevel,
  matchesQuery,
  techImage,
  techType,
} from './techModel'

function tech(over: Partial<TechEntry> & { id: string }): TechEntry {
  return {
    level: 1,
    cost: 1,
    isBoss: false,
    unlockItems: [],
    unlockBuildings: [],
    ...over,
  }
}

describe('techType', () => {
  it('is "item" when it unlocks any item', () => {
    expect(techType(tech({ id: 'a', unlockItems: ['Bat'] }))).toBe('item')
  })
  it('is "item" when it unlocks both an item and a building (item wins)', () => {
    expect(techType(tech({ id: 'a', unlockItems: ['Bat'], unlockBuildings: ['Wall'] }))).toBe(
      'item',
    )
  })
  it('is "structure" when it unlocks only buildings', () => {
    expect(techType(tech({ id: 'a', unlockBuildings: ['Wall'] }))).toBe('structure')
  })
  it('is "structure" when it unlocks nothing', () => {
    expect(techType(tech({ id: 'a' }))).toBe('structure')
  })
})

describe('techImage', () => {
  it('prefers the first unlocked item', () => {
    expect(techImage(tech({ id: 'a', unlockItems: ['Bat', 'Axe'], unlockBuildings: ['Wall'] }))).toEqual(
      { kind: 'item', id: 'Bat' },
    )
  })
  it('falls back to the first unlocked building', () => {
    expect(techImage(tech({ id: 'a', unlockBuildings: ['Wall', 'Roof'] }))).toEqual({
      kind: 'building',
      id: 'Wall',
    })
  })
  it('is null when nothing is unlocked', () => {
    expect(techImage(tech({ id: 'a' }))).toBeNull()
  })
})

describe('matchesQuery', () => {
  it('matches everything for a blank query', () => {
    expect(matchesQuery('Metal Axe', '')).toBe(true)
    expect(matchesQuery('Metal Axe', '   ')).toBe(true)
  })
  it('is case-insensitive substring', () => {
    expect(matchesQuery('Metal Axe', 'axe')).toBe(true)
    expect(matchesQuery('Metal Axe', 'METAL')).toBe(true)
    expect(matchesQuery('Metal Axe', 'pick')).toBe(false)
  })
})

describe('groupByLevel', () => {
  it('orders levels ascending and preserves input order within a level', () => {
    const groups = groupByLevel([
      tech({ id: 'b', level: 2 }),
      tech({ id: 'a', level: 2 }),
      tech({ id: 'c', level: 1 }),
    ])
    expect(groups.map((g) => g.level)).toEqual([1, 2])
    // Input order kept (b before a) — NOT alphabetized.
    expect(groups[1].techs.map((t) => t.id)).toEqual(['b', 'a'])
  })
})

describe('buildRegions', () => {
  const nameOf = (t: TechEntry) => t.id
  const sample = [
    tech({ id: 'axe', level: 1, unlockItems: ['Axe'] }),
    tech({ id: 'bench', level: 1, unlockBuildings: ['Workbench'] }),
    tech({ id: 'grapple', level: 12, isBoss: true, unlockItems: ['Grapple'] }),
  ]

  it('splits normal vs. ancient by isBoss', () => {
    const { normal, ancient } = buildRegions(sample, nameOf)
    expect(normal.flatMap((g) => g.techs).map((t) => t.id).sort()).toEqual(['axe', 'bench'])
    expect(ancient.flatMap((g) => g.techs).map((t) => t.id)).toEqual(['grapple'])
  })

  it('applies the search filter to both regions', () => {
    const { normal, ancient } = buildRegions(sample, nameOf, 'grap')
    expect(normal).toEqual([])
    expect(ancient.flatMap((g) => g.techs).map((t) => t.id)).toEqual(['grapple'])
  })

  it('drops empty levels after filtering', () => {
    const { normal } = buildRegions(sample, nameOf, 'axe')
    expect(normal.map((g) => g.level)).toEqual([1])
    expect(normal[0].techs.map((t) => t.id)).toEqual(['axe'])
  })
})
