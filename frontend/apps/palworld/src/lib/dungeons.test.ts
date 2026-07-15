import { describe, it, expect } from 'vitest'

import {
  dungeonLevelRange,
  notableDrops,
  type DungeonEntry,
  type DungeonsFile,
} from './dungeons'

const entry = (over: Partial<DungeonEntry>): DungeonEntry => ({
  id: 'Test001',
  bonusExpRate: 1.2,
  bossRewards: [],
  ...over,
})

describe('dungeonLevelRange', () => {
  it('spans min/max across all spawn buckets', () => {
    const d = entry({
      enemies: {
        normal: [{ pal: 'A', lvMin: 12, lvMax: 15 }],
        boss: [{ pal: 'B', lvMin: 18, lvMax: 19 }],
        fishing: [{ pal: 'C', lvMin: 10, lvMax: 11 }],
      },
    })
    expect(dungeonLevelRange(d)).toEqual({ min: 10, max: 19 })
  })

  it('returns null when the dungeon has no enemies', () => {
    expect(dungeonLevelRange(entry({}))).toBeNull()
    expect(dungeonLevelRange(entry({ enemies: {} }))).toBeNull()
  })
})

describe('notableDrops', () => {
  const file: DungeonsFile = {
    dungeons: [],
    eggPools: {},
    cagePools: {},
    lotteries: {
      chestLot: [
        {
          prob: 100,
          items: [
            { item: 'Common', weight: 90, min: 1, max: 1, grade: 1 },
            { item: 'Rare', weight: 10, min: 1, max: 1, grade: 5 },
          ],
        },
      ],
      bossLot: [
        {
          prob: 50,
          items: [
            { item: 'Epic', weight: 50, min: 1, max: 1, grade: 6 },
            { item: 'Rare', weight: 50, min: 1, max: 1, grade: 5 },
          ],
        },
      ],
    },
  }
  const d = entry({
    chests: { normal: 'chestLot' },
    bossRewards: [
      { tier: 'Easy01', entries: [{ kind: 'chest', weight: 1, lottery: 'bossLot' }] },
    ],
  })

  it('ranks unique items by grade desc, then chance desc', () => {
    expect(notableDrops(file, d).map((x) => x.item)).toEqual(['Epic', 'Rare', 'Common'])
  })

  it('keeps the best roll for an item seen in several lotteries', () => {
    // Rare: chest slot 100% × 10% = 10; boss slot 50% × 50% = 25 → 25 wins.
    const rare = notableDrops(file, d).find((x) => x.item === 'Rare')!
    expect(rare.grade).toBe(5)
    expect(rare.chance).toBe(25)
  })

  it('caps the list', () => {
    expect(notableDrops(file, d, 2)).toHaveLength(2)
  })
})
