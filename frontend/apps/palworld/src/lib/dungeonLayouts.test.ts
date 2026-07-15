import { describe, expect, it } from 'vitest'
import {
  layoutBounds,
  layoutsByDungeon,
  pointCounts,
  type DungeonLayoutsFile,
  type LayoutPoint,
} from './dungeonLayouts'

const p = (kind: LayoutPoint['kind'], sub: string | null, x = 0, y = 0, z = 0): LayoutPoint => ({
  kind,
  sub,
  x,
  y,
  z,
})

describe('layoutsByDungeon', () => {
  it('groups layouts preserving emitted order', () => {
    const file: DungeonLayoutsFile = {
      layouts: [
        { dungeon: 'Forest001', variant: '01', points: [] },
        { dungeon: 'Forest001', variant: '02', points: [] },
        { dungeon: 'Grass001', variant: '01', points: [] },
      ],
    }
    const map = layoutsByDungeon(file)
    expect([...map.keys()]).toEqual(['Forest001', 'Grass001'])
    expect(map.get('Forest001')!.map((l) => l.variant)).toEqual(['01', '02'])
  })
})

describe('layoutBounds', () => {
  it('fits the points with proportional padding', () => {
    const b = layoutBounds([p('exit', null, 0, 0), p('exit', null, 100, 50)], 0.1)
    // Larger side 100 → margin 10 on each edge.
    expect(b).toEqual({ minX: -10, minY: -10, width: 120, height: 70 })
  })
  it('degrades to a unit box with no points', () => {
    expect(layoutBounds([])).toEqual({ minX: 0, minY: 0, width: 1, height: 1 })
  })
})

describe('pointCounts', () => {
  it('counts per kind.sub with sub-less kinds plain', () => {
    const counts = pointCounts([
      p('reward', 'easy'),
      p('reward', 'easy'),
      p('reward', 'bonus'),
      p('exit', null),
    ])
    expect(counts.get('reward.easy')).toBe(2)
    expect(counts.get('reward.bonus')).toBe(1)
    expect(counts.get('exit')).toBe(1)
  })
})
