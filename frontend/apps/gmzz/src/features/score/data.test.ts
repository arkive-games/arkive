import { describe, expect, it } from 'vitest'

import {
  bandFor,
  benchmarkAt,
  completion,
  evaluate,
  headroom,
  materialsFor,
  type Rating,
  type Species,
} from './data'

const BANDS = [
  { id: 1, percentage: 49, label: '推荐提升' },
  { id: 2, percentage: 75, label: '稳步增长' },
  { id: 3, percentage: 99, label: '趋于完善' },
  { id: 4, percentage: 100, label: '登峰造极' },
]

function curve(byLevel: number[], byDivinity: number[]) {
  return { byLevel, byDivinity }
}

function species(overrides: Partial<Species> & Pick<Species, 'id'>): Species {
  return {
    name: '等级',
    genusId: 1,
    module: 'Player_Level',
    priority: 1,
    expectedScoreColumn: 0,
    maxScoreColumn: 0,
    expectedFormulaId: 1,
    maxFormulaId: 1,
    // levels 1..3 then divinity 0..2, with maxRoleLevel 4 in the fixtures.
    expected: curve([10, 20, 30], [40, 50, 60]),
    max: curve([100, 200, 300], [400, 500, 600]),
    materialItemIds: [],
    ...overrides,
  }
}

const RATING: Rating = {
  genus: [
    { id: 1, name: '途径', module: 'Player', priority: 1, icon: 'a' },
    { id: 2, name: '装备', module: 'Equip', priority: 2, icon: 'b' },
  ],
  species: [
    species({ id: 1, genusId: 1, priority: 1 }),
    species({ id: 2, genusId: 1, priority: 2, name: '非凡天赋' }),
    species({ id: 3, genusId: 2, priority: 1, name: '装备基础', materialItemIds: [2000184] }),
  ],
  bands: BANDS,
  materials: [
    { itemId: 2000184, name: '秘晶·归来', quality: 4, icon: '2000184', description: '强化装备所需的材料。' },
  ],
  maxRoleLevel: 4,
  maxDivinityLevel: 2,
  percentFormula: 'return Min(1, Min(1, $1/$2) * 0.9 + Min(1, $1/$3) * 0.1)',
}

describe('benchmarkAt', () => {
  it('reads the level list below the cap and ignores divinity there', () => {
    // The client's divinity branches sit behind `elseif $1 < 70`, so a player
    // short of the cap gets the same benchmark whatever their divinity.
    expect(benchmarkAt(RATING.species[0].expected, 2, 0, 4)).toBe(20)
    expect(benchmarkAt(RATING.species[0].expected, 2, 2, 4)).toBe(20)
  })

  it('switches to the divinity list at the level cap', () => {
    expect(benchmarkAt(RATING.species[0].expected, 4, 0, 4)).toBe(40)
    expect(benchmarkAt(RATING.species[0].expected, 4, 2, 4)).toBe(60)
  })

  it('clamps both inputs rather than reading past the domain', () => {
    // Divinity past the cap matches no branch in the client and falls through to
    // an unrelated default, so it must never be looked up.
    expect(benchmarkAt(RATING.species[0].expected, 99, 99, 4)).toBe(60)
    expect(benchmarkAt(RATING.species[0].expected, 0, -5, 4)).toBe(10)
  })
})

describe('completion', () => {
  it('weighs the expected benchmark nine times the max', () => {
    // Meeting expected but not max is 0.9 plus the max term's share.
    expect(completion(100, 100, 200)).toBeCloseTo(0.95, 10)
  })

  it('is 1 only when the max benchmark is met', () => {
    expect(completion(200, 100, 200)).toBe(1)
  })

  it('clamps at 1 rather than rewarding overshoot', () => {
    expect(completion(10_000, 100, 200)).toBe(1)
  })

  it('is 0 at no score', () => {
    expect(completion(0, 100, 200)).toBe(0)
  })
})

describe('bandFor', () => {
  it.each([
    [0, '推荐提升'],
    [0.49, '推荐提升'],
    [0.5, '稳步增长'],
    [0.9, '趋于完善'],
    [1, '登峰造极'],
  ])('%s -> %s', (percent, label) => {
    expect(bandFor(BANDS, percent)?.label).toBe(label)
  })

  it('bands on the displayed percentage, not the raw fraction', () => {
    // 99.06% renders as "99%". Banding the raw value would label it 登峰造极
    // beside a 99% figure, which reads as a bug.
    expect(bandFor(BANDS, 0.9906)?.label).toBe('趋于完善')
    expect(Math.round(0.9906 * 100)).toBe(99)
  })
})

describe('evaluate', () => {
  it('groups by genus in priority order and totals each', () => {
    const result = evaluate(RATING, 4, 2, { 1: 60, 2: 30, 3: 0 })
    expect(result.groups.map((g) => g.genus.name)).toEqual(['途径', '装备'])
    expect(result.groups[0].items.map((i) => i.species.id)).toEqual([1, 2])
    expect(result.groups[0].score).toBe(90)
    expect(result.groups[0].expected).toBe(120)
  })

  it('reports the gap to each benchmark, floored at zero', () => {
    const result = evaluate(RATING, 4, 2, { 1: 60, 2: 0, 3: 0 })
    const [first, second] = result.groups[0].items
    expect(first.toExpected).toBe(0)
    expect(first.toMax).toBe(540)
    expect(second.toExpected).toBe(60)
  })

  it('does not let one item overflow into another', () => {
    // Species 1 at ten times its own benchmark, species 2 at nothing. Dividing
    // summed score by summed benchmark would read 0.95 here, because the
    // overflow is compared against the pair's combined benchmark. Grading each
    // item on its own gives the honest half.
    const result = evaluate(RATING, 4, 2, { 1: 600, 2: 0, 3: 0 })
    expect(result.groups[0].items[0].percent).toBe(1)
    expect(result.groups[0].items[1].percent).toBe(0)
    expect(result.groups[0].percent).toBe(0.5)
    expect(result.groups[0].score).toBe(600)
  })

  it('treats a missing or negative score as zero', () => {
    const result = evaluate(RATING, 1, 0, { 1: -50 })
    expect(result.groups[0].items[0].score).toBe(0)
    expect(result.groups[0].items[1].score).toBe(0)
  })
})

describe('headroom', () => {
  it('ranks by the gap to expected and drops the items already there', () => {
    // Every item's expected benchmark is 60 at level 4 / divinity 2, so
    // species 1 is already there and must not be listed.
    const result = evaluate(RATING, 4, 2, { 1: 60, 2: 10, 3: 0 })
    expect(headroom(result).map((i) => [i.species.id, i.toExpected])).toEqual([
      [3, 60],
      [2, 50],
    ])
  })
})

describe('materialsFor', () => {
  it('resolves an item id to its material, and skips ids with no row', () => {
    expect(materialsFor(RATING, RATING.species[2]).map((m) => m.name)).toEqual(['秘晶·归来'])
    expect(materialsFor(RATING, RATING.species[0])).toEqual([])
  })
})
