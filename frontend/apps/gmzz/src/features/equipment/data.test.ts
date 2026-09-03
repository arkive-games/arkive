import { describe, expect, it } from 'vitest'

import {
  activeSuits,
  bodyFor,
  classifyAffix,
  itemsForSlot,
  playableProfessions,
  enhanceOf,
  evaluatePiece,
  extraordinaryBonus,
  familiesFor,
  graceFor,
  ladderFor,
  markForValue,
  markRate,
  maxAffixesFor,
  maxStageFor,
  progressBounds,
  progressOf,
  refineFromProgress,
  scoredSlots,
  toNearestFive,
  statLines,
  suitOf,
  suitTierFor,
  type Equipment,
  type Grace,
} from './data'

/**
 * Fixture carrying the real numbers off the game's own three tabs for one
 * weapon: 无形之编排 +3 at 62装等, scored 基础 2430 + 强化 240 + 重塑 3485.
 */
const EQUIPMENT: Equipment = {
  slots: [
    { id: 1, name: '武器', order: 1, seasons: [101] },
    { id: 12, name: '护甲', order: 2, seasons: [101] },
    { id: 3, name: '项链', order: 10, seasons: [201] },
  ],
  professions: [
    { id: 1200002, name: '空想家途径', sequenceName: '观众', description: '', disabled: false, weaponTypeIds: [302] },
    { id: 1200008, name: '错误途径', sequenceName: '偷盗者', description: '', disabled: true, weaponTypeIds: [] },
  ],
  types: [
    { id: 302, name: '龙瞳', slot: 1, baseStatKeys: ['AtkMin_N', 'AtkMax_N', 'MaxHp_N'], baseStatLabels: ['攻击', '最大生命'], classLimit: [1200002] },
  ],
  items: [
    {
      id: 3020623, name: '无形之编排', typeId: 302, slot: 1, quality: 6, icon: '3020623',
      gearLevel: 62, levelRequirement: 60,
      baseStats: [['AtkMin_N', 327], ['AtkMax_N', 607], ['MaxHp_N', 1960]],
      baseScore: 2430, suitId: 101, setId: 4, brandId: 10035, flavour: '',
    },
    {
      id: 3020600, name: '旧武器', typeId: 302, slot: 1, quality: 4, icon: '3020600',
      gearLevel: 60, levelRequirement: 55, baseStats: [], baseScore: 1200,
      suitId: null, setId: 4, brandId: null, flavour: '',
    },
  ],
  brands: [
    { id: 10035, name: '好孩子', effect: '怪物专攻提高150。', story: '', productItemId: null },
    { id: 10032, name: '好孩子', effect: '怪物专攻提高150。', story: '', productItemId: 3020600 },
  ],
  enhancement: {
    bodies: [
      {
        bodyId: 1, slot: 1, season: 100, year: 1,
        stages: [{ stage: 1, mark: 10, stats: [['AtkMin_N', 5]], consume: [], firstConsume: [] }],
      },
      {
        bodyId: 101, slot: 1, season: 101, year: 1,
        stages: Array.from({ length: 8 }, (_unused, i) => ({
          stage: i + 1,
          mark: 80,
          stats: [['AtkMin_N', 20], ['AtkMax_N', 20], ['MaxHp_N', 86]] as [string, number][],
          consume: [],
          firstConsume: [],
        })),
      },
    ],
    markPerStage: [80],
    maxStage: 8,
  },
  suits: {
    suits: [
      { id: 101, name: '灵与知回响', fullName: '[冒险]灵与知回响', tag: '冒险套装', pieceCounts: [2, 3], effect2: '', effect3: '' },
      { id: 102, name: '铁与血誓约', fullName: '[竞技]铁与血誓约', tag: '竞技套装', pieceCounts: [2, 3], effect2: '', effect3: '' },
    ],
    tiers: [
      { type: 2, level: 1, mark: 1003, requiredAveragePercent: 50, stats: [], effect: '' },
      { type: 2, level: 2, mark: 1755, requiredAveragePercent: 75, stats: [], effect: '' },
      { type: 2, level: 4, mark: 3259, requiredAveragePercent: 100, stats: [], effect: '' },
      { type: 1, level: 1, mark: 560, requiredAveragePercent: null, stats: [], effect: '' },
    ],
  },
  affixes: {
    statKeyByFamily: { 攻击: 'Atk_N', 技能增强: 'SkillPlus_N', 最大生命: 'MaxHp_N', 穿刺: 'Pierce_N' },
    set: 4,
    bySlot: {
      '1': {
        extraordinary: {
          攻击: [[1000, 382], [950, 363], [550, 210]],
          技能增强: [[1000, 80], [550, 44]],
        },
        normal: { 攻击: [[400, 153], [125, 48]], 穿刺: [[400, 98], [125, 31]] },
        contaminated: { 攻击: [[-400, -153], [-200, -76]] },
      },
    },
  },
}

const GRACES: Grace[] = [
  {
    id: 108, slot: 1, name: '征服宣言', extraordinaryCount: 3, score: 2000,
    conditions: [
      { count: 2, groupIds: [3991721], stat: '攻击' },
      { count: 1, groupIds: [3991726], stat: '技能增强' },
    ],
    tags: ['普攻'], brief1: '提高攻击540。', brief2: '',
  },
  {
    id: 109, slot: 1, name: '征服宣言', extraordinaryCount: 3, score: 2000,
    conditions: [
      { count: 3, groupIds: [3991721], stat: '攻击' },
      { count: 0, groupIds: [3991726], stat: '技能增强' },
    ],
    tags: ['普攻'], brief1: '提高攻击540。', brief2: '',
  },
  {
    id: 112, slot: 1, name: '血锋', extraordinaryCount: 2, score: 1000,
    conditions: [
      { count: 1, groupIds: [3991721], stat: '攻击' },
      { count: 1, groupIds: [3991726], stat: '技能增强' },
    ],
    tags: ['输出'], brief1: '', brief2: '',
  },
]

describe('bodyFor', () => {
  it('prefers the requested season', () => {
    expect(bodyFor(EQUIPMENT, 1, 100)?.bodyId).toBe(1)
    expect(bodyFor(EQUIPMENT, 1, 101)?.bodyId).toBe(101)
  })

  it('falls back to the latest season, since an older ladder is not the one in play', () => {
    expect(bodyFor(EQUIPMENT, 1)?.bodyId).toBe(101)
    expect(bodyFor(EQUIPMENT, 1, 999)?.bodyId).toBe(101)
  })

  it('is null for a slot with no body', () => {
    expect(bodyFor(EQUIPMENT, 3)).toBeNull()
  })
})

describe('maxStageFor', () => {
  it('is the slot ladder length, not the global maximum', () => {
    expect(maxStageFor(EQUIPMENT, 1, 100)).toBe(1)
    expect(maxStageFor(EQUIPMENT, 1, 101)).toBe(8)
  })

  it('falls back to the global maximum when the slot has no body', () => {
    expect(maxStageFor(EQUIPMENT, 3)).toBe(8)
  })
})

describe('enhanceOf', () => {
  it('reproduces the +3 weapon in game: 240 score, 攻击 +60, 最大生命 +258', () => {
    const body = bodyFor(EQUIPMENT, 1, 101)
    const { score, stats } = enhanceOf(body, 3, 100)
    expect(score).toBe(240)
    expect(Object.fromEntries(stats)).toEqual({ AtkMin_N: 60, AtkMax_N: 60, MaxHp_N: 258 })
  })

  it('counts the current stage by its refinement', () => {
    const body = bodyFor(EQUIPMENT, 1, 101)
    // Stage 3 just reached is worth two stages; half refined, two and a half.
    expect(enhanceOf(body, 3, 0).score).toBe(160)
    expect(enhanceOf(body, 3, 50).score).toBe(200)
    expect(Object.fromEntries(enhanceOf(body, 3, 50).stats)).toEqual({
      AtkMin_N: 50,
      AtkMax_N: 50,
      MaxHp_N: 215,
    })
  })

  it('is 0 at stage 0 whatever the refinement says', () => {
    expect(enhanceOf(bodyFor(EQUIPMENT, 1, 101), 0, 100)).toEqual({ score: 0, stats: [] })
  })

  it('is 0 with no body', () => {
    expect(enhanceOf(null, 5)).toEqual({ score: 0, stats: [] })
  })
})

describe('progressOf', () => {
  it('is stages-done over stages-total — a fully refined +3 of 8 is the 37% the game shows', () => {
    const body = bodyFor(EQUIPMENT, 1, 101)
    expect(progressOf(body, 3, 100)).toBeCloseTo(37.5, 5)
  })

  it('counts the current stage by its refinement', () => {
    const body = bodyFor(EQUIPMENT, 1, 101)
    expect(progressOf(body, 3, 0)).toBeCloseTo(25, 5)
    expect(progressOf(body, 3, 50)).toBeCloseTo(31.25, 5)
  })

  it('is 0 at +0 and 100 at the top of the ladder', () => {
    const body = bodyFor(EQUIPMENT, 1, 101)
    expect(progressOf(body, 0, 100)).toBe(0)
    expect(progressOf(body, 8, 100)).toBe(100)
  })

  it('clamps a nonsense refinement rather than exceeding the stage', () => {
    const body = bodyFor(EQUIPMENT, 1, 101)
    expect(progressOf(body, 8, 500)).toBeCloseTo(100, 5)
    expect(progressOf(body, 3, -20)).toBeCloseTo(25, 5)
  })
})

describe('progressBounds', () => {
  it('gives each stage its window of the badge percentage, floored like the game', () => {
    expect(progressBounds(8, 1)).toEqual({ min: 0, max: 12 })
    // +3 reads 25% just reached and 37% fully refined; 38% would already be +4.
    expect(progressBounds(8, 3)).toEqual({ min: 25, max: 37 })
    expect(progressBounds(8, 4)).toEqual({ min: 37, max: 50 })
    expect(progressBounds(8, 8)).toEqual({ min: 87, max: 100 })
  })

  it('has no refinement at +0', () => {
    expect(progressBounds(8, 0)).toEqual({ min: 0, max: 0 })
  })

  it('does not run past the ladder', () => {
    expect(progressBounds(8, 12)).toEqual({ min: 87, max: 100 })
  })

  it('is empty without a ladder', () => {
    expect(progressBounds(0, 3)).toEqual({ min: 0, max: 0 })
  })
})

describe('refineFromProgress', () => {
  it('inverts progressOf inside every stage window', () => {
    const body = bodyFor(EQUIPMENT, 1, 101)
    for (let stage = 1; stage <= 8; stage += 1) {
      const { min, max } = progressBounds(8, stage)
      for (let badge = min; badge <= max; badge += 1) {
        const refine = refineFromProgress(8, stage, badge)
        expect(refine).toBeGreaterThanOrEqual(1)
        expect(Math.floor(progressOf(body, stage, refine))).toBe(badge)
      }
    }
  })

  it('reads the top of the window as a fully refined stage, so "+3 37%" scores 240', () => {
    expect(refineFromProgress(8, 3, 37)).toBe(100)
    expect(refineFromProgress(8, 1, 12)).toBe(100)
    expect(refineFromProgress(8, 8, 100)).toBe(100)
  })

  it('takes the highest refinement a floored badge can stand for', () => {
    expect(refineFromProgress(8, 3, 25)).toBe(7)
    expect(refineFromProgress(8, 3, 30)).toBe(47)
  })

  it('lands on the stage boundary, not on the neighbouring stage', () => {
    expect(refineFromProgress(8, 3, 10)).toBe(1)
    expect(refineFromProgress(8, 3, 90)).toBe(100)
  })

  it('is 0 at +0 or without a ladder', () => {
    expect(refineFromProgress(8, 0, 0)).toBe(0)
    expect(refineFromProgress(0, 3, 50)).toBe(0)
  })
})

describe('markRate / markForValue', () => {
  it('derives the exchange rate from the ladder', () => {
    // 1000/382, 950/363, 550/210 all land on ~2.62 — the 攻击 worth.
    expect(markRate(ladderFor(EQUIPMENT, 1, 'extraordinary', '攻击'))).toBeCloseTo(2.62, 2)
    expect(markRate(ladderFor(EQUIPMENT, 1, 'extraordinary', '技能增强'))).toBeCloseTo(12.5, 1)
  })

  it('scales a value the ladder does not carry exactly', () => {
    // A 62装等 weapon reads 攻击 +308 where the nearest rung is 306, so the rate
    // has to absorb it rather than snapping to a rung. Asserted as the rate
    // applied, not a literal: the fixture's short ladder averages to a slightly
    // different rate than the shipped 50-rung one, and hardcoding either number
    // would make this test about the fixture instead of the behaviour.
    const ladder = ladderFor(EQUIPMENT, 1, 'extraordinary', '攻击')
    expect(markForValue(ladder, 308)).toBe(Math.round(308 * markRate(ladder)))
    // On the ladder it lands between the 800 and 850 rungs, as it should.
    expect(markForValue(ladder, 308)).toBeGreaterThan(780)
    expect(markForValue(ladder, 308)).toBeLessThan(830)
  })

  it('is exact on a value that is on the ladder', () => {
    const ladder = ladderFor(EQUIPMENT, 1, 'extraordinary', '攻击')
    // 382 is the top rung, worth 1000.
    expect(markForValue(ladder, 382)).toBeGreaterThan(995)
    expect(markForValue(ladder, 382)).toBeLessThan(1005)
  })

  it('is 0 for an empty ladder rather than dividing by zero', () => {
    expect(markRate([])).toBe(0)
    expect(markForValue([], 100)).toBe(0)
  })
})

describe('familiesFor', () => {
  it('lists every family the slot rolls at any tier, normal ones first', () => {
    expect(familiesFor(EQUIPMENT, 1)).toEqual(['攻击', '穿刺', '技能增强'])
    expect(familiesFor(EQUIPMENT, 99)).toEqual([])
  })
})

describe('classifyAffix', () => {
  const classify = (family: string, value: number) => classifyAffix(EQUIPMENT, 1, { family, value })

  it('reads a value above the normal ladder\'s top Mark as extraordinary', () => {
    const affix = classify('攻击', 308)
    expect(affix.tier).toBe('extraordinary')
    expect(affix.mark).toBeGreaterThan(780)
    expect(affix.mark).toBeLessThan(830)
  })

  it('reads a value the normal ladder covers as normal', () => {
    // The fixture's two-rung ladder averages to a hair under the top rung's own
    // rate, so the top value reads a Mark or so under 400 — still normal.
    const top = classify('攻击', 153)
    expect(top.tier).toBe('normal')
    expect(top.mark).toBeGreaterThan(395)
    expect(top.mark).toBeLessThanOrEqual(400)
    expect(classify('攻击', 48).tier).toBe('normal')
  })

  it('draws the line at the normal top, not the extraordinary bottom', () => {
    // The game showed 攻击 +159 as a gold pip on a 4-extraordinary weapon: worth
    // ~416, above the normal 400 yet below the lowest shipped extraordinary rung.
    const affix = classify('攻击', 159)
    expect(affix.tier).toBe('extraordinary')
    expect(affix.mark).toBeGreaterThan(400)
    expect(affix.mark).toBeLessThan(550)
  })

  it('is normal at any positive value for a family with no extraordinary ladder', () => {
    const pierce = classify('穿刺', 50)
    expect(pierce.tier).toBe('normal')
    expect(pierce.mark).toBeGreaterThan(195)
    expect(pierce.mark).toBeLessThan(210)
    expect(classify('穿刺', 500).tier).toBe('normal')
  })

  it('is extraordinary at any positive value for a family with no normal ladder', () => {
    expect(classify('技能增强', 33).tier).toBe('extraordinary')
  })

  it('reads a negative value as contaminated with a negative Mark', () => {
    const affix = classify('攻击', -153)
    expect(affix.tier).toBe('contaminated')
    expect(affix.mark).toBeLessThan(-390)
  })

  it('is a normal zero for nothing typed', () => {
    expect(classify('攻击', 0)).toMatchObject({ tier: 'normal', mark: 0 })
  })
})

describe('toNearestFive', () => {
  it('rounds to the nearest five, as the 重塑 tab prints its total', () => {
    expect(toNearestFive(3616)).toBe(3615)
    expect(toNearestFive(3483)).toBe(3485)
    expect(toNearestFive(-244)).toBe(-245)
    expect(toNearestFive(0)).toBe(0)
  })
})

describe('maxAffixesFor', () => {
  it('allows five affixes on the weapon slot and four elsewhere', () => {
    // Slot 1 is where the pathways' weapon subtype (302) lives.
    expect(maxAffixesFor(EQUIPMENT, 1)).toBe(5)
    expect(maxAffixesFor(EQUIPMENT, 12)).toBe(4)
    expect(maxAffixesFor(EQUIPMENT, 99)).toBe(4)
  })
})

describe('extraordinaryBonus', () => {
  it('is 200 × (1 + … + n), the remainder the game\'s 重塑 tab carries over the affix Marks', () => {
    expect(extraordinaryBonus(0)).toBe(0)
    expect(extraordinaryBonus(1)).toBe(200)
    expect(extraordinaryBonus(2)).toBe(600)
    expect(extraordinaryBonus(3)).toBe(1200)
    expect(extraordinaryBonus(4)).toBe(2000)
  })
})

describe('statLines', () => {
  const item = EQUIPMENT.items[0]

  it('keeps the item\'s value and the enhancement\'s gain apart, the attack pair folded into one 攻击 range', () => {
    const lines = statLines(EQUIPMENT, item.baseStats, enhanceOf(bodyFor(EQUIPMENT, 1, 101), 3, 100).stats)
    expect(lines).toEqual([
      { key: 'Atk_N', label: '攻击', base: { min: 327, max: 607 }, gain: { min: 60, max: 60 } },
      { key: 'MaxHp_N', label: '最大生命', base: { min: 1960, max: 1960 }, gain: { min: 258, max: 258 } },
    ])
  })

  it('is empty for an empty slot however far the sliders are up', () => {
    expect(statLines(EQUIPMENT, null, [['AtkMin_N', 60]])).toEqual([])
  })

  it('shows a stat the enhancement grants but the item lacks, and labels an unknown key by itself', () => {
    expect(statLines(EQUIPMENT, [['Mystery_N', 5]], [['MaxHp_N', 86]])).toEqual([
      { key: 'Mystery_N', label: 'Mystery_N', base: { min: 5, max: 5 }, gain: { min: 0, max: 0 } },
      { key: 'MaxHp_N', label: '最大生命', base: { min: 0, max: 0 }, gain: { min: 86, max: 86 } },
    ])
  })
})

describe('graceFor', () => {
  const x = (family: string) => ({ tier: 'extraordinary' as const, family, value: 300 })

  it('matches 攻击x2 + 技能增强x1', () => {
    expect(graceFor(GRACES, 1, [x('攻击'), x('攻击'), x('技能增强')])?.id).toBe(108)
  })

  it('matches 攻击x3 onto the row written for it, not the 2+1 row', () => {
    expect(graceFor(GRACES, 1, [x('攻击'), x('攻击'), x('攻击')])?.id).toBe(109)
  })

  it('needs two extraordinary affixes before any grace fires', () => {
    expect(graceFor(GRACES, 1, [x('攻击')])).toBeNull()
  })

  it('ignores normal and contaminated affixes when counting', () => {
    const affixes = [
      x('攻击'),
      { tier: 'normal' as const, family: '攻击', value: 150 },
      { tier: 'contaminated' as const, family: '攻击', value: -100 },
    ]
    expect(graceFor(GRACES, 1, affixes)).toBeNull()
  })

  it('is null when no row matches the combination', () => {
    expect(graceFor(GRACES, 1, [x('技能增强'), x('技能增强'), x('技能增强')])).toBeNull()
  })

  it('does not match a grace from another slot', () => {
    expect(graceFor(GRACES, 12, [x('攻击'), x('攻击'), x('技能增强')])).toBeNull()
  })
})

describe('suitTierFor', () => {
  it('returns the best tier the average progress reaches', () => {
    expect(suitTierFor(EQUIPMENT, 2, 100)?.level).toBe(4)
    expect(suitTierFor(EQUIPMENT, 2, 80)?.level).toBe(2)
    expect(suitTierFor(EQUIPMENT, 2, 60)?.level).toBe(1)
  })

  it('returns null below the lowest requirement', () => {
    expect(suitTierFor(EQUIPMENT, 2, 10)).toBeNull()
  })

  it('treats a tier with no requirement as always met', () => {
    expect(suitTierFor(EQUIPMENT, 1, 0)?.level).toBe(1)
  })
})

describe('suitOf / activeSuits', () => {
  const adventure = EQUIPMENT.items[0]
  const plain = EQUIPMENT.items[1]
  const arena = { ...adventure, id: 3020999, suitId: 102 }

  it('names the suit an item belongs to, and nothing for an unaffiliated one', () => {
    expect(suitOf(EQUIPMENT, adventure)?.tag).toBe('冒险套装')
    expect(suitOf(EQUIPMENT, plain)).toBeNull()
    expect(suitOf(EQUIPMENT, null)).toBeNull()
  })

  it('activates a suit once its lowest piece count is worn', () => {
    expect(activeSuits(EQUIPMENT, [adventure, plain, null])).toEqual([])
    expect(activeSuits(EQUIPMENT, [adventure, adventure, plain])).toEqual([
      { suit: EQUIPMENT.suits.suits[0], count: 2 },
    ])
  })

  it('lists both suits when both are worn enough, the fuller one first', () => {
    const active = activeSuits(EQUIPMENT, [adventure, adventure, arena, arena, arena])
    expect(active.map((entry) => [entry.suit.id, entry.count])).toEqual([[102, 3], [101, 2]])
  })
})

describe('scoredSlots', () => {
  it('keeps only slots a grace exists for, in panel order', () => {
    expect(scoredSlots(EQUIPMENT, GRACES).map((s) => s.id)).toEqual([1])
  })
})

describe('evaluatePiece', () => {
  it('adds the item\'s base, enhancement and reforge score', () => {
    const result = evaluatePiece(EQUIPMENT, GRACES, {
      slot: 1,
      itemId: 3020623,
      enhanceStage: 3,
      refinePercent: 100,
      affixes: [
        { family: '攻击', value: 382 },
        { family: '攻击', value: 382 },
        { family: '技能增强', value: 80 },
      ],
    }, 101)

    expect(result.item?.name).toBe('无形之编排')
    expect(result.brand?.name).toBe('好孩子')
    expect(result.baseScore).toBe(2430)
    expect(result.enhanceScore).toBe(240)
    expect(result.affixes.map((affix) => affix.tier)).toEqual(['extraordinary', 'extraordinary', 'extraordinary'])
    expect(result.extraordinaryCount).toBe(3)
    expect(result.extraordinaryBonus).toBe(1200)
    expect(result.reforgeScore).toBe(toNearestFive(result.affixMark + 1200))
    expect(result.reforgeScore % 5).toBe(0)
    expect(result.grace?.id).toBe(108)
    expect(result.total).toBe(2430 + 240 + result.reforgeScore)
  })

  it('reproduces the game\'s 重塑 tab: 攻击 +308 +233 +332 read 3485', () => {
    const result = evaluatePiece(EQUIPMENT, GRACES, {
      slot: 1, itemId: 3020623, enhanceStage: 3, refinePercent: 100,
      affixes: [{ family: '攻击', value: 308 }, { family: '攻击', value: 233 }, { family: '攻击', value: 332 }],
    }, 101)
    // Within the rounding the card's whole-number values allow.
    expect(Math.abs(result.reforgeScore - 3485)).toBeLessThanOrEqual(3)
    expect(result.grace?.id).toBe(109)
    // The three tabs the game shows sum to 6155.
    expect(Math.abs(result.total - 6155)).toBeLessThanOrEqual(3)
  })

  it('reproduces a two-extraordinary weapon: 攻击 +283 +283 with 穿刺 +50 read 2282', () => {
    const result = evaluatePiece(EQUIPMENT, GRACES, {
      slot: 1, itemId: null, enhanceStage: 0, refinePercent: 0,
      affixes: [{ family: '攻击', value: 283 }, { family: '攻击', value: 283 }, { family: '穿刺', value: 50 }],
    }, 101)
    expect(result.extraordinaryCount).toBe(2)
    expect(Math.abs(result.reforgeScore - 2282)).toBeLessThanOrEqual(5)
  })

  it('scores an empty slot with no base', () => {
    const result = evaluatePiece(EQUIPMENT, GRACES, {
      slot: 1, itemId: null, enhanceStage: 3, refinePercent: 100, affixes: [],
    }, 101)
    expect(result.baseScore).toBe(0)
    expect(result.total).toBe(240)
  })

  it('scores the refinement of the current stage', () => {
    const result = evaluatePiece(EQUIPMENT, GRACES, {
      slot: 1, itemId: null, enhanceStage: 3, refinePercent: 50, affixes: [],
    }, 101)
    expect(result.enhanceScore).toBe(200)
    expect(result.total).toBe(200)
    expect(result.progressPercent).toBeCloseTo(31.25, 5)
  })

  it('subtracts a contaminated affix rather than adding it', () => {
    const clean = evaluatePiece(EQUIPMENT, GRACES, {
      slot: 1, itemId: null, enhanceStage: 0, refinePercent: 0, affixes: [],
    }, 101)
    const dirty = evaluatePiece(EQUIPMENT, GRACES, {
      slot: 1, itemId: null, enhanceStage: 0, refinePercent: 0,
      affixes: [{ family: '攻击', value: -153 }],
    }, 101)
    expect(dirty.affixes[0].tier).toBe('contaminated')
    expect(dirty.affixMark).toBeLessThan(clean.affixMark)
    expect(dirty.reforgeScore).toBeLessThan(0)
  })

  it('leaves brand null for an item wearing none', () => {
    const result = evaluatePiece(EQUIPMENT, GRACES, {
      slot: 1, itemId: 3020600, enhanceStage: 0, refinePercent: 0, affixes: [],
    }, 101)
    expect(result.item?.name).toBe('旧武器')
    // A brand whose productItemId is this item is the upgrade link, not a wearer.
    expect(result.brand).toBeNull()
  })
})

describe('playableProfessions', () => {
  it('drops the disabled pathway and any with no weapon', () => {
    // 错误途径 ships disabled, and a pathway with no weapon subtype cannot be
    // the basis of a weapon filter.
    expect(playableProfessions(EQUIPMENT).map((p) => p.id)).toEqual([1200002])
  })
})

describe('itemsForSlot', () => {
  it('narrows a class-locked slot to that pathway', () => {
    expect(itemsForSlot(EQUIPMENT, 1, 1200002)).toHaveLength(2)
    expect(itemsForSlot(EQUIPMENT, 1, 1200001)).toHaveLength(0)
  })

  it('ignores the pathway for a slot with no class restriction', () => {
    // Armour carries no classLimit, so filtering it by pathway would empty
    // every armour list.
    const armour: Equipment = {
      ...EQUIPMENT,
      types: [{ id: 400, name: '重甲', slot: 12, baseStatKeys: [], baseStatLabels: [], classLimit: [] }],
      items: [{
        ...EQUIPMENT.items[0], id: 9001, name: '甲', typeId: 400, slot: 12,
      }],
    }
    expect(itemsForSlot(armour, 12, 1200001)).toHaveLength(1)
    expect(itemsForSlot(armour, 12, null)).toHaveLength(1)
  })

  it('returns everything when no pathway is chosen', () => {
    expect(itemsForSlot(EQUIPMENT, 1, null)).toHaveLength(2)
  })

  it('sorts by quality, best first', () => {
    expect(itemsForSlot(EQUIPMENT, 1, 1200002).map((i) => i.quality)).toEqual([6, 4])
  })
})
