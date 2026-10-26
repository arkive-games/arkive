import { describe, expect, it } from 'vitest'

import {
  affixValue,
  displayedValue,
  effectiveAffixCap,
  effectiveGrade,
  evaluateRelicSlot,
  formatStat,
  k1For,
  k2For,
  markForStat,
  materialScore,
  poolRungs,
  poolStats,
  rareAffixes,
  rareEffect,
  resonanceKey,
  activeMaterialIndexes,
  gradeOptions,
  inactiveAffixes,
  materialName,
  materialTypeAt,
  gradeQuality,
  relicTotals,
  usedGroups,
  statName,
  typePool,
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
    SealBestGrade: 1,
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

describe('material positions', () => {
  it('fixes 攻击 and 防御 to their own type and gives 特化 one of each', () => {
    expect([materialTypeAt(1, 0), materialTypeAt(1, 1)]).toEqual([1, 1])
    expect([materialTypeAt(2, 0), materialTypeAt(2, 1)]).toEqual([2, 2])
    expect([materialTypeAt(3, 0), materialTypeAt(3, 1)]).toEqual([1, 2])
  })

  it('counts 填充二 only on the strategic server, and only the equipped 特化 material', () => {
    expect(activeMaterialIndexes({ groupId: 1 }, 'local')).toEqual([0])
    expect(activeMaterialIndexes({ groupId: 2 }, 'cross')).toEqual([0, 1])
    expect(activeMaterialIndexes({ groupId: 3, materialType: 2 }, 'cross')).toEqual([1])
    expect(activeMaterialIndexes({ groupId: 3 }, 'local')).toEqual([0])
  })
})

describe('gradeOptions', () => {
  it('offers 3, 2, 1 worst first and never grade 0', () => {
    expect(gradeOptions(RELICS)).toEqual([3, 2, 1])
  })
})

describe('inactiveAffixes', () => {
  it('switches off from the last affix backwards, past the cap', () => {
    const affixes = [1284, 934, 1867, 1284, 1400].map((mark) => ({ stat: 'Atk_N', value: 0, mark }))
    expect(inactiveAffixes(affixes, 4)).toEqual([false, false, false, false, true])
    expect(inactiveAffixes(affixes, 3)).toEqual([false, false, false, true, true])
    expect(inactiveAffixes(affixes, 6)).toEqual([false, false, false, false, false])
  })

  it('never switches off a rare word, taking the next ordinary one instead', () => {
    const affixes = [1, 2, 3, 4, 5].map((affixId) => ({ stat: 'Atk_N', value: 0, mark: 0, affixId }))
    const rare = (affix: { affixId?: number }) => affix.affixId === 5
    expect(inactiveAffixes(affixes, 4, rare)).toEqual([false, false, false, true, false])
  })
})

describe('usedGroups', () => {
  it('reports the groups taken and whether a rare word is present', () => {
    const pool = RELICS.materials.affixPool['5']['2']
    const taken = usedGroups(pool, [{ stat: 'Atk_N', value: 490, mark: 1284, affixId: 10004 }])
    expect([...taken.groups]).toEqual([101])
    expect(taken.rare).toBe(false)
  })
})

describe('typePool', () => {
  // Two attack items over different pools that repeat one rung, plus a rare word.
  const MIXED: Relics = {
    ...RELICS,
    materials: {
      ...RELICS.materials,
      items: [
        ...RELICS.materials.items,
        { id: 2085401, name: '攻击物质', type: 1, tc: 31, quality: 5, icon: null, description: '', affixCountWeights: [100, 0, 0, 0, 0, 0], poolSet: 31 },
        { id: 2085101, name: '攻击物质', type: 1, tc: 1, quality: 5, icon: null, description: '', affixCountWeights: [100, 0, 0, 0, 0, 0], poolSet: 1 },
      ],
      affixPool: {
        ...RELICS.materials.affixPool,
        '1': {
          '1': [{ id: 20001, mark: 467, stat: 'AllControlAcc_N', value: 13, groupId: 109, saturation: 0.5 }],
          '2': [{ id: 9004, mark: 1284, stat: 'Atk_N', value: 490, groupId: 101, saturation: 0.6875 }],
        },
        '31': {
          '4': [{
            id: 101, mark: 7640, stat: 'SkillMulti_N', value: 0.05, groupId: 1, saturation: 1, scaled: false, tag: 4,
            name: '愚者', effect: '使封印物负面效果失效，所有技能等级+1，伤害加深提升%s', skillLevelPlus: 1, rarest: true,
          }],
        },
      },
    },
    statNames: {
      Atk_N: { name: '攻击', format: 'number' },
      SkillMulti_N: { name: '伤害加深', format: 'percent' },
    },
  }

  it('merges every item of a type, one entry per rung, and keeps the lowest id', () => {
    const pool = typePool(MIXED, 1)
    // The 490 / 1284 攻击 rung sits in both pools; the lower id wins.
    expect(pool.filter((a) => a.stat === 'Atk_N' && a.value === 490).map((a) => a.id)).toEqual([9004])
    expect(typePool(MIXED, 2)).toHaveLength(4)
    expect(typePool(MIXED, 2).every((a) => a.tag === 2)).toBe(true)
  })

  it('orders main stats before secondary ones and splits out the rare words', () => {
    const pool = typePool(MIXED, 1)
    expect(poolStats(pool)).toEqual(['Atk_N', 'DefReduce_N', 'Crit_N', 'AllControlAcc_N'])
    expect(rareAffixes(pool).map((a) => a.name)).toEqual(['愚者'])
    expect(poolRungs(pool, 'SkillMulti_N')).toEqual([])
  })

  it('shows a flat rare word unscaled, as a percentage, inside its effect line', () => {
    const fool = rareAffixes(typePool(MIXED, 1))[0]
    expect(affixValue(fool, 0.32)).toBe(0.05)
    expect(rareEffect(MIXED, fool, 0.32)).toBe('使封印物负面效果失效，所有技能等级+1，伤害加深提升5%')
    // An ordinary word still takes k2.
    expect(affixValue({ value: 490 }, 0.32)).toBe(156)
  })

  it('names stats in Chinese and falls back to the key', () => {
    expect(statName(MIXED, 'Atk_N')).toBe('攻击')
    expect(statName(MIXED, 'Pierce_N')).toBe('Pierce_N')
    expect(formatStat(MIXED, 'Atk_N', 156)).toBe('156')
  })
})

describe('poolRungs', () => {
  it('returns one stat richest-first', () => {
    const pool = RELICS.materials.affixPool['5']['2']
    expect(poolRungs(pool, 'Atk_N').map((r) => r.mark)).toEqual([1284, 1167])
  })
})

describe('evaluateRelicSlot', () => {
  const base = { groupId: 1, artifactId: 2085029, grade: 3 }
  const at = (mark: number) => ({ stat: 'Atk_N', value: 490, mark })
  const three = [
    { stat: 'Atk_N', value: 490, mark: 1284 },
    { stat: 'DefReduce_N', value: 309, mark: 1284 },
    { stat: 'Crit_N', value: 365, mark: 1400 },
  ]

  it('keeps every part unfloored, assembly scaled by k2', () => {
    const result = evaluateRelicSlot(RELICS, { ...base, materials: [three, []] }, 11, 103)
    expect(result.assemblyScore).toBeCloseTo(500 * 0.32)
    expect(result.resonanceScore).toBeCloseTo(4732 * 0.32)
    expect(result.affixScore).toBeCloseTo(3968 * 0.32)
    // One relic alone still floors to the screenshot's 1269.
    expect(Math.floor(result.affixScore)).toBe(1269)
  })

  it('switches off the last affix past the cap', () => {
    // Grade 3 caps at 4: the fifth affix pays nothing, whatever its Mark.
    const five = [at(1284), at(934), at(1284), at(1284), at(1867)]
    const result = evaluateRelicSlot(RELICS, { ...base, materials: [five, []] }, 11, 103)
    expect(result.materials[0].inactive).toEqual([false, false, false, false, true])
    expect(result.materials[0].activeCount).toBe(4)
    expect(result.affixScore).toBeCloseTo(0.32 * (1284 * 3 + 934))
    expect(result.resonanceScore).toBeCloseTo(7662 * 0.32)
  })

  it('reads one resonance per relic, off the material in effect with more active affixes', () => {
    const slot = { ...base, materials: [[at(1284)], [at(1284), at(1284), at(1284)]] }
    const cross = evaluateRelicSlot(RELICS, slot, 11, 103, 'cross')
    expect(cross.materials.map((m) => m.resonates)).toEqual([false, true])
    expect(cross.resonanceScore).toBeCloseTo(4732 * 0.32)
    // Affix scores still add up across both materials.
    expect(cross.affixScore).toBeCloseTo(0.32 * 1284 * 4)
    const local = evaluateRelicSlot(RELICS, slot, 11, 103, 'local')
    expect(local.materials.map((m) => m.resonates)).toEqual([true, false])
    expect(local.resonanceScore).toBeCloseTo(1352 * 0.32)
  })

  it('scores grade 1 as grade 2 off the strategic server, assembly included', () => {
    const six = Array.from({ length: 6 }, () => at(1284))
    const local = evaluateRelicSlot(RELICS, { ...base, grade: 1, materials: [six, []] }, 11, 103, 'local')
    expect(local.resonanceGrade).toBe(2)
    expect(local.materials[0].activeCount).toBe(5)
    expect(local.resonanceScore).toBeCloseTo(11268 * 0.32)
    expect(local.assemblyScore).toBeCloseTo(2500 * 0.32)
    const cross = evaluateRelicSlot(RELICS, { ...base, grade: 1, materials: [six, []] }, 11, 103, 'cross')
    expect(cross.materials[0].activeCount).toBe(6)
    expect(cross.resonanceScore).toBeCloseTo(15776 * 0.32)
    expect(cross.assemblyScore).toBeCloseTo(4500 * 0.32)
  })

  it('matches the game at knowledge 39: grade 3 assembles 440, grade 2 2200', () => {
    const k = (grade: number) => evaluateRelicSlot(RELICS, { ...base, grade, materials: [[], []] }, 39, 103).assemblyScore
    const withLevel: Relics = { ...RELICS, knowledge: { '103': [...RELICS.knowledge['103'], { level: 39, k1: 0.88, k2: 0.88, roleLevelRequired: 1 }] } }
    const at39 = (grade: number) => evaluateRelicSlot(withLevel, { ...base, grade, materials: [[], []] }, 39, 103).assemblyScore
    expect(Math.floor(at39(3) + 1e-9)).toBe(440)
    expect(Math.floor(at39(2) + 1e-9)).toBe(2200)
    expect(k(3)).toBeCloseTo(50)
  })

  it('counts 填充二 on the strategic server only', () => {
    const slot = { ...base, materials: [three, three] }
    const local = evaluateRelicSlot(RELICS, slot, 11, 103, 'local')
    expect(local.materials[1].applies).toBe(false)
    expect(local.affixScore).toBeCloseTo(3968 * 0.32)
    const cross = evaluateRelicSlot(RELICS, slot, 11, 103, 'cross')
    expect(cross.affixScore).toBeCloseTo(3968 * 0.32 * 2)
  })

  it('scores only the equipped 特化 material', () => {
    const slot = { groupId: 3, artifactId: null, grade: 3, materialType: 2, materials: [three, [at(1284)]] }
    const result = evaluateRelicSlot(RELICS, slot, 11, 103, 'cross')
    expect(result.materials.map((m) => m.applies)).toEqual([false, true])
    expect(result.affixScore).toBeCloseTo(0.32 * 1284)
  })
})

describe('relicTotals', () => {
  it('adds the relics up first and floors each item once', () => {
    const slot = (groupId: number) => ({ groupId, artifactId: null, grade: 3, materials: [[at3()], []] })
    const at3 = () => ({ stat: 'Atk_N', value: 490, mark: 1284 })
    const results = [1, 2, 3].map((g) => evaluateRelicSlot(RELICS, slot(g), 11, 103))
    // 1284 × 0.32 = 410.88 each: three floored apart give 1230, together 1232.
    expect(results.reduce((sum, r) => sum + Math.floor(r.affixScore), 0)).toBe(1230)
    const totals = relicTotals(results)
    expect(totals.affix).toBe(1232)
    expect(totals.total).toBe(totals.assembly + totals.resonance + totals.affix)
  })
})

describe('materialName', () => {
  const rules = [
    { id: 1, type: 1, name: '异变物质', rule: 'HasWordType', args: [4, 1], expect: true },
    { id: 2, type: 1, name: '异变物质', rule: 'HasWordType', args: [3, 1], expect: true },
    { id: 3, type: 1, name: '劲攻物质', rule: 'SameWordTypeCount', args: [2, 4], expect: true },
    { id: 4, type: 1, name: '攻击物质', rule: 'Quality', args: [5], expect: true },
    { id: 5, type: 1, name: '基础物质', rule: 'LowQuality', args: [], expect: true },
  ]
  const named: Relics = { ...RELICS, materials: { ...RELICS.materials, nameRules: rules } }
  const pool = [
    { id: 1, mark: 1, stat: 'Atk_N', value: 1, groupId: 101, saturation: 1, tag: 2 },
    { id: 2, mark: 1, stat: 'Crit_N', value: 1, groupId: 106, saturation: 1, tag: 2 },
    { id: 3, mark: 1, stat: 'Pierce_N', value: 1, groupId: 103, saturation: 1, tag: 2 },
    { id: 4, mark: 1, stat: 'Dex_N', value: 1, groupId: 108, saturation: 1, tag: 2 },
    { id: 5, mark: 1, stat: 'AllControlAcc_N', value: 1, groupId: 109, saturation: 1, tag: 1 },
    { id: 6, mark: 1, stat: 'Atk_N', value: 1, groupId: 2, saturation: 1, tag: 3, name: '战争主教' },
  ]
  const pick = (...ids: number[]) => ids.map((id) => ({ stat: 'x', value: 0, mark: 0, affixId: id }))

  it('takes the first rule that holds, in the client\'s order', () => {
    expect(materialName(named, 1, pool, pick(1, 5))).toBe('攻击物质')
    expect(materialName(named, 1, pool, pick(1, 2, 3, 4))).toBe('劲攻物质')
    expect(materialName(named, 1, pool, pick(1, 2, 3, 4, 6))).toBe('异变物质')
  })

  it('is null for a dataset without rules', () => {
    expect(materialName(RELICS, 1, pool, pick(1))).toBeNull()
  })
})

describe('gradeQuality', () => {
  it('is purple, gold and orange for grades 3, 2 and 1', () => {
    expect([3, 2, 1].map(gradeQuality)).toEqual([4, 5, 6])
  })
})
