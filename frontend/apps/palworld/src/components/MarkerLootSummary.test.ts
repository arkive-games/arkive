import { describe, expect, it } from 'vitest'
import { groupMarkerLootByGrade, markerLootForArea } from './MarkerLootSummary'
import type { ItemEntry, ItemSource, ItemsBundle } from '../lib/catalog'

const item = (
  id: string,
  rarity: number,
  chance: number,
  area = 'Grass',
  kind: ItemSource['kind'] = 'chest',
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

describe('markerLootForArea', () => {
  it('keeps only the requested marker source kind and area', () => {
    const result = markerLootForArea(bundle([
      item('wanted', 1, 10, 'Grass', 'fishing'),
      item('other-area', 4, 100, 'Forest', 'fishing'),
      item('other-kind', 4, 100, 'Grass', 'chest'),
    ]), 'Grass', 'fishing')

    expect(result.map((entry) => entry.item.id)).toEqual(['wanted'])
  })

  it('orders rare items first and uses chance as the tie-break', () => {
    const result = markerLootForArea(bundle([
      item('common', 1, 100),
      item('rare-low', 4, 1),
      item('rare-high', 4, 20),
    ]), 'Grass', 'chest')

    expect(result.map((entry) => entry.item.id)).toEqual([
      'rare-high',
      'rare-low',
      'common',
    ])
  })

  it('groups the visible loot by grade without repeating the grade per item', () => {
    const entries = markerLootForArea(bundle([
      item('grade-three-a', 4, 20),
      item('grade-five', 3, 10),
      item('grade-three-b', 2, 5),
    ]), 'Grass', 'chest')
    entries[1].source.grade = 5

    const groups = groupMarkerLootByGrade(entries)

    expect(groups.map((group) => group.grade)).toEqual([5, 1])
    expect(groups.map((group) => group.entries.length)).toEqual([1, 2])
  })
})
