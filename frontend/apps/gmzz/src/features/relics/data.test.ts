import { describe, expect, it } from 'vitest'

import {
  displayedValue,
  effectiveAffixCap,
  evaluateRelicSlot,
  k2For,
  markForStat,
  materialScore,
  materialsForGroup,
  poolRungs,
  resonanceKey,
  type Relics,
} from './data'

/**
 * A fixture shaped like the real dataset, carrying the numbers from the one
 * screenshot that pins the whole rule: a 攻击物质 reading 评分 1269 over
 * 攻击 +156 / 破防 +98 / 暴击 +116 at 非凡知识 level 11.
 */
const RELICS: Relics = {
  artifacts: [
    { id: 2085029, name: '公证书', groupId: 1, groupName: '攻击', tag: 1, initialGrade: 3, quality: 4, icon: '2000557', description: '', seasons: [103] },
    { id: 2085001, name: '丧钟', groupId: 1, groupName: '攻击', tag: 2, initialGrade: 3, quality: 4, icon: '2000543', description: '', seasons: [103] },
    { id: 2085004, name: '正义钱包', groupId: 2, groupName: '防御', tag: 3, initialGrade: 3, quality: 4, icon: '2000584', description: '', seasons: [103] },
  ],
  promotion: {
    ladder: [
      { grade: 3, mark: 500, note: '3级封印物最多生效4条词条' },
      { grade: 2, mark: 2500, note: '2级封印物最多生效5条词条' },
      { grade: 1, mark: 4500, note: '' },
      { grade: 0, mark: 6500, note: '' },
    ],
    bestGrade: 0,
    worstGrade: 3,
  },
  risks: [{ id: 1, level: '有一定危险', name: '有一定危险', description: '' }],
  resonance: {
    '103': {
      '101': [{ affixCount: 4, mark: 7662, stats: [['Atk_N', 903]] }],
      '103': [
        { affixCount: 1, mark: 1352, stats: [['Atk_N', 301]] },
        { affixCount: 2, mark: 2704, stats: [['Atk_N', 602]] },
        { affixCount: 3, mark: 4732, stats: [['Atk_N', 903]] },
        { affixCount: 4, mark: 7662, stats: [['Atk_N', 1204]] },
      ],
    },
  },
  knowledge: {
    '103': [
      { level: 0, k1: 0.1, k2: 0.1, roleLevelRequired: 1 },
      { level: 11, k1: 0.32, k2: 0.32, roleLevelRequired: 64 },
    ],
  },
  worths: { '103': { Atk_N: 2.62, DefReduce_N: 4.15, Crit_N: 3.83 } },
  materials: {
    items: [
      { id: 2085103, name: '攻击物质', type: 1, tc: 3, quality: 5, icon: '2085102', description: '', affixCountWeights: [0, 0, 100, 0, 0, 0], poolSet: 5 },
      { id: 2085203, name: '防守物质', type: 2, tc: 3, quality: 5, icon: '2085103', description: '', affixCountWeights: [0, 0, 100, 0, 0, 0], poolSet: 5 },
    ],
    groups: {},
    affixPool: {
      '5': {
        '2': [
          { id: 10004, mark: 1284, stat: 'Atk_N', value: 490, groupId: 101, saturation: 0.6875 },
          { id: 10003, mark: 1167, stat: 'Atk_N', value: 445, groupId: 101, saturation: 0.625 },
          { id: 10304, mark: 1284, stat: 'DefReduce_N', value: 309, groupId: 104, saturation: 0.6875 },
          { id: 10505, mark: 1400, stat: 'Crit_N', value: 365, groupId: 106, saturation: 0.75 },
        ],
      },
    },
  },
  constants: { MainAttributeTipsEntryNumber: [6, 6, 5, 4], XMatMaxWordNum: 6 },
  groupNames: { '1': '攻击', '2': '防御', '3': '特化' },
  scoreRule: 'floor(k2 * sum(affixMark))',
}

describe('k2For', () => {
  it('reads the level off the ladder', () => {
    expect(k2For(RELICS, 11)).toBe(0.32)
    expect(k2For(RELICS, 0)).toBe(0.1)
  })

  it('falls back to the first rung for a level the ladder lacks', () => {
    expect(k2For(RELICS, 99)).toBe(0.1)
  })
})

describe('displayedValue', () => {
  it('reproduces the three affixes in the screenshot', () => {
    // Table values 490 / 309 / 365 at k2 = 0.32 read +156 / +98 / +116 in game.
    expect(displayedValue(490, 0.32)).toBe(156)
    expect(displayedValue(309, 0.32)).toBe(98)
    expect(displayedValue(365, 0.32)).toBe(116)
  })
})

describe('materialScore', () => {
  it('reproduces the screenshot score exactly', () => {
    const affixes = [
      { stat: 'Atk_N', value: 490, mark: 1284 },
      { stat: 'DefReduce_N', value: 309, mark: 1284 },
      { stat: 'Crit_N', value: 365, mark: 1400 },
    ]
    // floor(0.32 * 3968) = floor(1269.76) = 1269
    expect(materialScore(affixes, 0.32)).toBe(1269)
  })

  it('sums before flooring, which is the whole rule', () => {
    // Flooring each affix first gives 1268 here, and the game shows 1269. If
    // this ever passes with the per-affix order, the rule has been inverted.
    const affixes = [
      { stat: 'Atk_N', value: 490, mark: 1284 },
      { stat: 'DefReduce_N', value: 309, mark: 1284 },
      { stat: 'Crit_N', value: 365, mark: 1400 },
    ]
    const perAffix = affixes.reduce((sum, a) => sum + Math.floor(0.32 * a.mark), 0)
    expect(perAffix).toBe(1268)
    expect(materialScore(affixes, 0.32)).toBe(1269)
  })

  it('is 0 with no affixes', () => {
    expect(materialScore([], 0.32)).toBe(0)
  })
})

describe('markForStat', () => {
  it('is the stat amount times the season worth', () => {
    // 490 * 2.62 = 1283.8 -> 1284, the Mark the table actually carries.
    expect(markForStat(RELICS, 'Atk_N', 490)).toBe(1284)
    expect(markForStat(RELICS, 'DefReduce_N', 309)).toBe(1282)
  })

  it('is 0 for a stat with no worth entry', () => {
    expect(markForStat(RELICS, 'NotAStat_N', 100)).toBe(0)
  })
})

describe('effectiveAffixCap', () => {
  it.each([
    [3, 4],
    [2, 5],
    [1, 6],
    [0, 6],
  ])('grade %s caps at %s affixes', (grade, cap) => {
    // Lower grade is better, so the worst grade has the tightest cap.
    expect(effectiveAffixCap(RELICS, grade)).toBe(cap)
  })
})

describe('resonanceKey', () => {
  it('is groupId * 100 + tier, for the real group ids 1/2/3', () => {
    // The table is keyed 101..303. String concatenation would give "13" here
    // and miss every row, which looks like 非凡共鸣 simply being worth zero.
    expect(resonanceKey(1, 3)).toBe('103')
    expect(resonanceKey(2, 1)).toBe('201')
    expect(resonanceKey(3, 2)).toBe('302')
  })

  it('clamps grade 0 onto tier 1, which it shares', () => {
    expect(resonanceKey(1, 0)).toBe('101')
    expect(resonanceKey(1, 1)).toBe('101')
  })
})

describe('materialsForGroup', () => {
  it('routes type 1 to 攻击 and type 2 to 防御', () => {
    expect(materialsForGroup(RELICS, 1).map((m) => m.id)).toEqual([2085103])
    expect(materialsForGroup(RELICS, 2).map((m) => m.id)).toEqual([2085203])
  })

  it('lets 特化 take both, which is what the item text says', () => {
    expect(materialsForGroup(RELICS, 3)).toHaveLength(2)
  })
})

describe('poolRungs', () => {
  it('returns one stat richest-first', () => {
    const pool = RELICS.materials.affixPool['5']['2']
    expect(poolRungs(pool, 'Atk_N').map((r) => r.mark)).toEqual([1284, 1167])
  })
})

describe('evaluateRelicSlot', () => {
  const base = { groupId: 1, artifactId: 2085029, grade: 3, materialId: 2085103, affixes: [] }

  it('adds the three parts', () => {
    const affixes = [
      { stat: 'Atk_N', value: 490, mark: 1284 },
      { stat: 'DefReduce_N', value: 309, mark: 1284 },
      { stat: 'Crit_N', value: 365, mark: 1400 },
    ]
    const result = evaluateRelicSlot(RELICS, { ...base, affixes }, 11, 103)
    expect(result.assemblyScore).toBe(500)
    expect(result.resonanceScore).toBe(4732)
    expect(result.affixScore).toBe(1269)
    expect(result.total).toBe(500 + 4732 + 1269)
  })

  it('stops paying past the grade cap and says how many were dropped', () => {
    // Grade 3 caps at 4; a fifth affix must add nothing.
    const five = Array.from({ length: 5 }, () => ({ stat: 'Atk_N', value: 490, mark: 1284 }))
    const result = evaluateRelicSlot(RELICS, { ...base, affixes: five }, 11, 103)
    expect(result.cappedOut).toBe(1)
    expect(result.affixScore).toBe(Math.floor(0.32 * 1284 * 4))
    expect(result.resonanceScore).toBe(7662)
  })

  it('a better grade pays more assembly and lifts the cap', () => {
    const five = Array.from({ length: 5 }, () => ({ stat: 'Atk_N', value: 490, mark: 1284 }))
    const worst = evaluateRelicSlot(RELICS, { ...base, grade: 3, affixes: five }, 11, 103)
    const better = evaluateRelicSlot(RELICS, { ...base, grade: 2, affixes: five }, 11, 103)
    expect(better.assemblyScore).toBeGreaterThan(worst.assemblyScore)
    expect(better.cappedOut).toBe(0)
    expect(better.affixScore).toBeGreaterThan(worst.affixScore)
  })

  it('is all zeroes with nothing chosen', () => {
    const result = evaluateRelicSlot(RELICS, { ...base, artifactId: null }, 11, 103)
    expect(result.artifact).toBeNull()
    expect(result.affixScore).toBe(0)
    expect(result.resonanceScore).toBe(0)
    // Assembly still pays: an equipped artifact at grade 3 is worth 500.
    expect(result.assemblyScore).toBe(500)
  })
})
