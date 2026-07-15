import { describe, it, expect } from 'vitest'

import type { BuildingsBundle, ItemsBundle, TechBundle, TechEntry } from '../../lib/catalog'
import {
  buildRegions,
  groupByLevel,
  makeTechResolvers,
  matchesQuery,
  techImage,
  techType,
  type PalsLike,
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

describe('makeTechResolvers requirements', () => {
  const items: ItemsBundle = { items: [], byId: new Map(), text: {}, typeLabels: {}, areaLabels: {} }
  const buildings: BuildingsBundle = {
    buildings: [],
    byId: new Map(),
    text: {},
    typeLabels: {},
    energyLabels: {},
  }
  const pals: PalsLike = {
    byId: new Map([['Boar', { icon: 'T_Boar_icon_normal' }]]),
    text: { Boar: { name: 'Rushoar' } },
  }
  const egg = tech({ id: 'egg', isBoss: true, requireBoss: 'GrassBoss' })
  const toolbox = tech({ id: 'toolbox', requireResearch: 'Handcraft5' })
  const saddle = tech({ id: 'saddle', requirePal: 'Boar' })
  const pouch = tech({ id: 'pouch', requireTech: 'toolbox' })
  const plain = tech({ id: 'plain' })
  const bundle: TechBundle = {
    techs: [egg, toolbox, saddle, pouch, plain],
    byId: new Map([
      ['egg', egg],
      ['toolbox', toolbox],
      ['saddle', saddle],
      ['pouch', pouch],
      ['plain', plain],
    ]),
    text: {
      egg: { name: 'Egg Incubator', requireBossName: 'Tower of the Rayne Syndicate' },
      toolbox: { name: 'Large Toolbox', requireResearchName: 'Large Toolbox Development' },
      saddle: { name: 'Rushoar Saddle' },
      pouch: { name: 'Feed Bag' },
      plain: { name: 'Plain' },
    },
  }
  const r = makeTechResolvers(items, buildings, bundle, pals)

  it('resolves the localized tower / research names', () => {
    expect(r.requireBossName(egg)).toBe('Tower of the Rayne Syndicate')
    expect(r.requireResearchName(toolbox)).toBe('Large Toolbox Development')
  })

  it('resolves the capture pal to a name + icon ref', () => {
    expect(r.requirePal(saddle)).toEqual({
      id: 'Boar',
      name: 'Rushoar',
      icon: 'T_Boar_icon_normal',
    })
  })

  it('resolves the prerequisite tech entry and name', () => {
    expect(r.requireTechEntry(pouch)).toBe(toolbox)
    expect(r.requireTechName(pouch)).toBe('Large Toolbox')
  })

  it('falls back to the raw id when the locale entry lacks the name', () => {
    const bare = makeTechResolvers(items, buildings, { ...bundle, text: {} }, { byId: new Map(), text: {} })
    expect(bare.requireBossName(egg)).toBe('GrassBoss')
    expect(bare.requireResearchName(toolbox)).toBe('Handcraft5')
    expect(bare.requirePal(saddle)).toEqual({ id: 'Boar', name: 'Boar', icon: undefined })
  })

  it('is undefined when the tech has no such requirement', () => {
    expect(r.requireBossName(plain)).toBeUndefined()
    expect(r.requireResearchName(plain)).toBeUndefined()
    expect(r.requirePal(plain)).toBeUndefined()
    expect(r.requireTechEntry(plain)).toBeUndefined()
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
