import { describe, expect, it } from 'vitest'

import {
  displayedValue,
  effectiveAffixCap,
  effectiveGrade,
  evaluateRelicSlot,
  k1For,
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
      { grade: 3, mark: 500, note: '3级封印物最多生效4条词条', resonanceTier: 1 },
      { grade: 2, mark: 2500, note: '2级封印物最多生效5条词条', resonanceTier: 2 },
      { grade: 1, mark: 4500, note: '', resonanceTier: 3 },
      { grade: 0, mark: 6500, note: '', resonanceTier: 3 },
    ],
    bestGrade: 0,
    worstGrade: 3,
  },
  risks: [{ id: 1, level: '有一定危险', name: '有一定危险', description: '' }],
  // The real shape: tier x01 plateaus at four affixes, x02 at five, x03 at six.
  resonance: {
    '103': {
      '101': [
        { affixCount: 1, mark: 1352, stats: [['Atk_N', 258]] },
        { affixCount: 2, mark: 2704, stats: [['Atk_N', 516]] },
        { affixCount: 3, mark: 4732, stats: [['Atk_N', 903]] },
        { affixCount: 4, mark: 7662, stats: [['Atk_N', 1462]] },
        { affixCount: 5, mark: 7662, stats: [['Atk_N', 1462]] },
        { affixCount: 6, mark: 7662, stats: [['Atk_N', 1462]] },
      ],
      '102': [
        { affixCount: 4, mark: 7662, stats: [['Atk_N', 1462]] },
        { affixCount: 5, mark: 11268, stats: [['Atk_N', 2150]] },
        { affixCount: 6, mark: 11268, stats: [['Atk_N', 2150]] },
      ],
      '103': [
        { affixCount: 5, mark: 11268, stats: [['Atk_N', 2150]] },
        { affixCount: 6, mark: 15776, stats: [['Atk_N', 3010]] },
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
  constants: {
    MainAttributeTipsEntryNumber: [6, 6, 5, 4],
    XMatMaxWordNum: 6,
    SealEffectBestGradeAtLocalServer: 2,
    SealEffectBestGradeAtCrossServer: 1,
  },
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
  it('is groupId * 100 + the grade\'s tier, which runs the other way from the grade', () => {
    // The table is keyed 101..303. String concatenation would give "13" here
    // and miss every row, which looks like 非凡共鸣 simply being worth zero.
    // And the tier is NOT the grade: the promote rows send the worst grade to
    // x01 and the two best to x03.
    expect(resonanceKey(RELICS, 1, 3)).toBe('101')
    expect(resonanceKey(RELICS, 2, 2)).toBe('202')
    expect(resonanceKey(RELICS, 3, 1)).toBe('303')
    expect(resonanceKey(RELICS, 1, 0)).toBe('103')
  })

  it('falls back to the clamped grade for a dataset without the tier', () => {
    const bare: Relics = {
      ...RELICS,
      promotion: {
        ...RELICS.promotion,
        ladder: RELICS.promotion.ladder.map(({ grade, mark, note }) => ({ grade, mark, note })),
      },
    }
    expect(resonanceKey(bare, 1, 3)).toBe('103')
    expect(resonanceKey(bare, 1, 0)).toBe('101')
  })
})

describe('effectiveGrade', () => {
  it('caps the best grades at the server\'s own, and leaves the rest alone', () => {
    expect(effectiveGrade(RELICS, 0, 'local')).toBe(2)
    expect(effectiveGrade(RELICS, 1, 'local')).toBe(2)
    expect(effectiveGrade(RELICS, 3, 'local')).toBe(3)
    expect(effectiveGrade(RELICS, 0, 'cross')).toBe(1)
    expect(effectiveGrade(RELICS, 2, 'cross')).toBe(2)
  })
})

describe('k1For', () => {
  it('reads k1, not k2, off the ladder', () => {
    expect(k1For(RELICS, 11)).toBe(0.32)
    expect(k1For(RELICS, 99)).toBe(0.1)
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
    // calcSealedEnhanceMark: floor(4732 × k1 0.32) = floor(1514.24)
    expect(result.resonanceScore).toBe(1514)
    expect(result.affixScore).toBe(1269)
    expect(result.total).toBe(500 + 1514 + 1269)
  })

  it('scales resonance by k1 and floors once, as the client does', () => {
    const one = [{ stat: 'Atk_N', value: 490, mark: 1284 }]
    expect(evaluateRelicSlot(RELICS, { ...base, affixes: one }, 0, 103).resonanceScore).toBe(Math.floor(1352 * 0.1))
    expect(evaluateRelicSlot(RELICS, { ...base, affixes: one }, 11, 103).resonanceScore).toBe(Math.floor(1352 * 0.32))
  })

  it('reads a best-grade relic at the server cap: grade 2 locally, grade 1 cross-server', () => {
    const six = Array.from({ length: 6 }, () => ({ stat: 'Atk_N', value: 490, mark: 1284 }))
    const local = evaluateRelicSlot(RELICS, { ...base, grade: 0, affixes: six }, 11, 103, 'local')
    // Capped to grade 2: five words count, tier x02 at five pays 11268.
    expect(local.resonanceGrade).toBe(2)
    expect(local.cappedOut).toBe(1)
    expect(local.resonanceScore).toBe(Math.floor(11268 * 0.32))
    const cross = evaluateRelicSlot(RELICS, { ...base, grade: 0, affixes: six }, 11, 103, 'cross')
    // Capped to grade 1: all six count, tier x03 at six pays 15776.
    expect(cross.resonanceGrade).toBe(1)
    expect(cross.cappedOut).toBe(0)
    expect(cross.resonanceScore).toBe(Math.floor(15776 * 0.32))
    // Assembly is the real grade's Mark either way.
    expect(local.assemblyScore).toBe(6500)
    expect(cross.assemblyScore).toBe(6500)
  })

  it('stops paying past the grade cap and says how many were dropped', () => {
    // Grade 3 caps at 4; a fifth affix must add nothing.
    const five = Array.from({ length: 5 }, () => ({ stat: 'Atk_N', value: 490, mark: 1284 }))
    const result = evaluateRelicSlot(RELICS, { ...base, affixes: five }, 11, 103)
    expect(result.cappedOut).toBe(1)
    expect(result.affixScore).toBe(Math.floor(0.32 * 1284 * 4))
    expect(result.resonanceScore).toBe(Math.floor(7662 * 0.32))
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
