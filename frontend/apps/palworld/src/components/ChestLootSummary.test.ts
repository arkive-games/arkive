import { describe, expect, it } from 'vitest'
import { chestLootForArea, groupChestLootByGrade } from './ChestLootSummary'
import type { ItemEntry, ItemsBundle } from '../lib/catalog'

const item = (
  id: string,
  rarity: number,
  chance: number,
  area = 'Grass',
  kind: 'chest' | 'fishing' = 'chest',
): ItemEntry => ({
  id,
  typeA: 'Material',
  typeB: '',
  sortId: Number(id.replace(/\D/g, '')) || 0,
  rarity,
  rank: 1,
  weight: 1,
  price: 1,
  maxStack: 1,
  handcraft: false,
  sources: [{ kind, area, grade: 1, chance }],
})

const bundle = (items: ItemEntry[]): ItemsBundle => ({
  items,
  byId: new Map(items.map((entry) => [entry.id, entry])),
  text: {},
  typeLabels: {},
  areaLabels: {},
})

describe('chestLootForArea', () => {
  it('keeps only chest sources from the requested area', () => {
    const result = chestLootForArea(bundle([
      item('wanted', 1, 10),
      item('other-area', 4, 100, 'Forest'),
      item('other-kind', 4, 100, 'Grass', 'fishing'),
    ]), 'Grass')

    expect(result.map((entry) => entry.item.id)).toEqual(['wanted'])
  })

  it('orders rare items first and uses chance as the tie-break', () => {
    const result = chestLootForArea(bundle([
      item('common', 1, 100),
      item('rare-low', 4, 1),
      item('rare-high', 4, 20),
    ]), 'Grass')

    expect(result.map((entry) => entry.item.id)).toEqual([
      'rare-high',
      'rare-low',
      'common',
    ])
  })

  it('groups the visible loot by chest grade without repeating the grade per item', () => {
    const entries = chestLootForArea(bundle([
      item('grade-three-a', 4, 20),
      item('grade-five', 3, 10),
      item('grade-three-b', 2, 5),
    ]), 'Grass')
    entries[1].source.grade = 5

    const groups = groupChestLootByGrade(entries)

    expect(groups.map((group) => group.grade)).toEqual([5, 1])
    expect(groups.map((group) => group.entries.length)).toEqual([1, 2])
  })
})
