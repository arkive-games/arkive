import { describe, expect, it } from 'vitest'
import type { MonsterRecord } from './creatureData'
import type { EquipmentRecord, SoulRecord } from './wikiData'
import {
  attributeFormat,
  attributeValue,
  defaultVariant,
  dropChance,
  filterEquipmentGroups,
  filterMonsterGroups,
  groupEquipment,
  groupMonsters,
  pageWindow,
  soulLevelCaps,
  soulPrimaryAt,
  soulSubPool,
  stripPlaceholder,
} from './wikiBoards'

const PLACEHOLDER = '\u65e0\u9700\u7ffb\u8bd1'
const stats = (hp: number) => ({ maxhp: hp, maxsp: 1, atk: 1, matk: 1, def: 1, mdef: 1 })
const monster = (id: number, name: string, level: number, extra: Partial<MonsterRecord> = {}): MonsterRecord => ({
  id, name: { 'zh-CN': name }, level, headIcon: 'h.webp', stats: stats(level), ...extra,
})

describe('pageWindow', () => {
  it('lists every page when there are few', () => {
    expect(pageWindow(0, 5)).toEqual([0, 1, 2, 3, 4])
  })
  it('keeps both ends and the neighbours of the current page', () => {
    expect(pageWindow(0, 20)).toEqual([0, 1, 2, 3, 'gap', 19])
    expect(pageWindow(10, 20)).toEqual([0, 'gap', 9, 10, 11, 'gap', 19])
    expect(pageWindow(19, 20)).toEqual([0, 'gap', 16, 17, 18, 19])
  })
})

describe('groupMonsters', () => {
  it('merges spawns by name, keeps the highest rank and drops duplicates', () => {
    const groups = groupMonsters([
      monster(1, 'Poring', 5),
      monster(2, 'Poring', 1),
      monster(3, 'Poring', 5),
      monster(4, 'Poring', 9, { rank: 'mvp' }),
      monster(5, 'Baphomet', 80, { rank: 'boss' }),
    ])
    expect(groups.map((group) => group.name)).toEqual(['Baphomet', 'Poring'])
    const poring = groups[1]
    expect(poring.rank).toBe('mvp')
    expect(poring.variants.map((variant) => variant.id)).toEqual([2, 1, 4])
    expect([poring.minLevel, poring.maxLevel]).toEqual([1, 9])
  })
  it('skips placeholder names and rows with no stats', () => {
    expect(groupMonsters([
      monster(1, `${PLACEHOLDER}A`, 1),
      monster(2, 'B', 1, { stats: { maxhp: 1 } }),
      monster(3, 'C', 1, { headIcon: undefined }),
    ])).toEqual([])
  })
  it('opens on the first placed row, else the strongest', () => {
    const [placed] = groupMonsters([monster(1, 'A', 1), monster(2, 'A', 2, { maps: [7] }), monster(3, 'A', 3)])
    expect(defaultVariant(placed)).toBe(1)
    const [bare] = groupMonsters([monster(1, 'A', 1), monster(2, 'A', 2)])
    expect(defaultVariant(bare)).toBe(1)
  })
  it('filters by any variant inside the level band', () => {
    const groups = groupMonsters([monster(1, 'A', 10), monster(2, 'A', 40), monster(3, 'B', 60, { element: 3 })])
    const base = { rank: 'all' as const, band: null, element: null, race: null, size: null, query: '' }
    expect(filterMonsterGroups(groups, { ...base, band: [30, 49] }).map((group) => group.name)).toEqual(['A'])
    expect(filterMonsterGroups(groups, { ...base, element: 3 }).map((group) => group.name)).toEqual(['B'])
    expect(filterMonsterGroups(groups, { ...base, query: 'b' }).map((group) => group.name)).toEqual(['B'])
  })
})

describe('drops and attributes', () => {
  it('reads chances as players do', () => {
    expect(dropChance(1)).toBe('sure')
    expect(dropChance(0.0125)).toBe(1.3)
  })
  it('formats percentage attributes in hundredths', () => {
    const format = attributeFormat({ iID: 209, name: { 'zh-CN': 'Crit%' } })
    expect(format).toEqual({ label: 'Crit', percent: true })
    expect(attributeValue(500, true)).toBe('5%')
    expect(attributeValue(1250, false)).toBe('1,250')
  })
  it('strips the no-translation mark', () => {
    expect(stripPlaceholder(`\u3010${PLACEHOLDER}\u3011Bash`)).toBe('Bash')
  })
})

describe('groupEquipment', () => {
  const row = (iID: number, name: string, quality: number, slot = 'weapon', level = 20): EquipmentRecord => ({
    iID, slot, icon: 'i.webp', name: { 'zh-CN': name }, item: { iID, iQuality: quality, iLevelNeed: level },
  })
  it('merges a piece across qualities, one row per quality', () => {
    const groups = groupEquipment([row(1, 'Sword', 4), row(2, 'Sword', 2), row(3, 'Sword', 4), row(4, 'Sword', 3, 'cloak')])
    expect(groups).toHaveLength(2)
    expect(groups[0].qualities).toEqual([2, 4])
    expect(groups[0].variants.map((variant) => variant.iID)).toEqual([2, 1])
  })
  it('skips empty icons and unknown slots, and filters by quality and level', () => {
    const groups = groupEquipment([
      row(1, 'A', 2),
      { ...row(2, 'B', 2), icon: 'icons/equipment/item_null.webp' },
      row(3, 'C', 2, 'mount'),
      row(4, 'D', 5, 'shoes', 999),
    ])
    expect(groups.map((group) => group.name)).toEqual(['A', 'D'])
    const base = { slot: 'all' as const, level: null, quality: null, query: '' }
    expect(filterEquipmentGroups(groups, { ...base, quality: 5 }).map((group) => group.name)).toEqual(['D'])
    expect(filterEquipmentGroups(groups, { ...base, level: 20 }).map((group) => group.name)).toEqual(['A'])
  })
})

describe('souls', () => {
  const soul: SoulRecord = {
    iID: 1,
    primaryAttributes: [{ attributeId: 101, min: 300, max: 300 }],
    primaryAttributeLevelUp: [{ attributeId: 101, min: 60, max: 60 }],
    subAttributes: [
      { attributeId: 209, iMin: 500, iMax: 500 },
      { attributeId: 209, iMin: 300, iMax: 800 },
      { iSubAttriID: 101 },
    ],
  }
  it('grows the primary attributes one step a level', () => {
    expect(soulPrimaryAt(soul, 1)).toEqual([{ id: 101, value: 300, step: 60 }])
    expect(soulPrimaryAt(soul, 10)[0].value).toBe(840)
  })
  it('merges the secondary pool by attribute', () => {
    expect(soulSubPool(soul)).toEqual([{ id: 209, min: 300, max: 800 }, { id: 101, min: undefined, max: undefined }])
  })
  it('reads the level cap per quality', () => {
    const caps = soulLevelCaps([{ iQuality: 3 }, { iQuality: 3, iLv: 1 }, { iQuality: 3, iLv: 10 }, { iQuality: 5, iLv: 20 }])
    expect([...caps]).toEqual([[3, 10], [5, 20]])
  })
})
