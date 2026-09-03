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
  nearestRung,
  maxAffixesFor,
  affixBounds,
  clampAffixValue,
  counterpartFor,
  maxStageFor,
  progressBounds,
  progressOf,
  refineFromProgress,
  scoredSlots,
  statLines,
  suitOf,
  suitScoreFor,
  suitTierFor,
  wholeBodyTier,
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
    { id: 1200001, name: '太阳途径', sequenceName: '歌颂者', description: '', disabled: false, weaponTypeIds: [301] },
    { id: 1200002, name: '空想家途径', sequenceName: '观众', description: '', disabled: false, weaponTypeIds: [302] },
    { id: 1200008, name: '错误途径', sequenceName: '偷盗者', description: '', disabled: true, weaponTypeIds: [] },
  ],
  types: [
    { id: 301, name: '长戟', slot: 1, baseStatKeys: ['AtkMin_N', 'AtkMax_N', 'MaxHp_N'], baseStatLabels: ['攻击', '最大生命'], classLimit: [1200001] },
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
      // The same weapon for the 太阳 pathway: same suit, gear level and quality, other subtype.
      id: 3010623, name: '无声之戟', typeId: 301, slot: 1, quality: 6, icon: '3010623',
      gearLevel: 62, levelRequirement: 60, baseStats: [], baseScore: 2430,
      suitId: 101, setId: 4, brandId: null, flavour: '',
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
      { type: 2, level: 1, mark: 1003, requiredStage: null, requiredPieces: null, requiredAveragePercent: 50, stats: [], effect: '' },
      { type: 2, level: 2, mark: 1755, requiredStage: null, requiredPieces: null, requiredAveragePercent: 75, stats: [], effect: '' },
      { type: 2, level: 4, mark: 3259, requiredStage: null, requiredPieces: null, requiredAveragePercent: 100, stats: [], effect: '' },
      { type: 1, level: 1, mark: 560, requiredStage: 3, requiredPieces: 8, requiredAveragePercent: null, stats: [], effect: '' },
      { type: 1, level: 2, mark: 1122, requiredStage: 5, requiredPieces: 8, requiredAveragePercent: null, stats: [], effect: '' },
      { type: 1, level: 4, mark: 2105, requiredStage: 8, requiredPieces: 8, requiredAveragePercent: null, stats: [], effect: '' },
    ],
    levelScores: { '1': { perLevel: 201, origin: 49 }, '2': { perLevel: 323, origin: 49 } },
  },
  affixes: {
    statKeyByFamily: { 攻击: 'Atk_N', 技能增强: 'SkillPlus_N', 最大生命: 'MaxHp_N', 穿刺: 'Pierce_N' },
    set: 4,
    bySlot: {
      '1': {
        // The live extraordinary ladder (1000 - 65k), not the client table's.
        extraordinary: {
          攻击: [[1000, 382], [935, 357], [870, 332], [805, 308], [740, 283], [675, 258], [610, 233], [545, 208], [480, 183], [415, 159]],
          技能增强: [[1000, 80], [935, 75], [870, 70], [805, 64], [740, 59], [675, 54], [610, 49], [545, 44], [480, 38], [415, 33]],
        },
        normal: { 攻击: [[400, 153], [125, 48]], 穿刺: [[400, 98], [202, 50], [125, 31]] },
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

describe('nearestRung', () => {
  const ladder = ladderFor(EQUIPMENT, 1, 'extraordinary', '攻击')

  it('finds the rung a value sits on', () => {
    expect(nearestRung(ladder, 308)).toEqual([805, 308])
    expect(nearestRung(ladder, 382)).toEqual([1000, 382])
    expect(nearestRung(ladder, 159)).toEqual([415, 159])
  })

  it('takes the nearest rung for a value off the ladder, the richer one on a tie', () => {
    expect(nearestRung(ladder, 310)).toEqual([805, 308])
    expect(nearestRung(ladder, 500)).toEqual([1000, 382])
    // 320 is 12 from both 308 and 332.
    expect(nearestRung(ladder, 320)).toEqual([870, 332])
  })

  it('is null for an empty ladder', () => {
    expect(nearestRung([], 100)).toBeNull()
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

  it('takes the rung\'s own integer Mark, not a rate applied to the value', () => {
    expect(classify('攻击', 308)).toMatchObject({ tier: 'extraordinary', mark: 805 })
    expect(classify('攻击', 357)).toMatchObject({ tier: 'extraordinary', mark: 935 })
    expect(classify('技能增强', 70)).toMatchObject({ tier: 'extraordinary', mark: 870 })
  })

  it('reads a value on the normal ladder as normal', () => {
    expect(classify('攻击', 153)).toMatchObject({ tier: 'normal', mark: 400 })
    expect(classify('攻击', 48)).toMatchObject({ tier: 'normal', mark: 125 })
    expect(classify('穿刺', 50)).toMatchObject({ tier: 'normal', mark: 202 })
  })

  it('reads the lowest extraordinary rung as gold, as the game does', () => {
    // A 4-extraordinary weapon read 攻击 +159 and 技能增强 +33 with gold pips.
    expect(classify('攻击', 159)).toMatchObject({ tier: 'extraordinary', mark: 415 })
    expect(classify('技能增强', 33)).toMatchObject({ tier: 'extraordinary', mark: 415 })
  })

  it('gives the tier whose rung is nearer, the richer on a tie', () => {
    // 156 is 3 from normal 153 and 3 from extraordinary 159.
    expect(classify('攻击', 156)).toMatchObject({ tier: 'extraordinary', mark: 415 })
    expect(classify('攻击', 155)).toMatchObject({ tier: 'normal', mark: 400 })
  })

  it('is normal at any positive value for a family with no extraordinary ladder', () => {
    expect(classify('穿刺', 500)).toMatchObject({ tier: 'normal', mark: 400 })
  })

  it('is extraordinary at any positive value for a family with no normal ladder', () => {
    expect(classify('技能增强', 10)).toMatchObject({ tier: 'extraordinary', mark: 415 })
  })

  it('reads a negative value as contaminated with the contaminated rung\'s Mark', () => {
    expect(classify('攻击', -153)).toMatchObject({ tier: 'contaminated', mark: -400 })
    expect(classify('攻击', -80)).toMatchObject({ tier: 'contaminated', mark: -200 })
  })

  it('negates the normal rung for a family with no contaminated ladder', () => {
    expect(classify('穿刺', -50)).toMatchObject({ tier: 'contaminated', mark: -202 })
  })

  it('is a normal zero for nothing typed', () => {
    expect(classify('攻击', 0)).toMatchObject({ tier: 'normal', mark: 0 })
  })
})

describe('affixBounds / clampAffixValue', () => {
  it('reads the positive span across both ladders and the contaminated span on its own', () => {
    expect(affixBounds(EQUIPMENT, 1, '攻击')).toEqual({ negative: { min: -153, max: -76 }, positive: { min: 48, max: 382 } })
    expect(affixBounds(EQUIPMENT, 1, '穿刺')).toEqual({ negative: null, positive: { min: 31, max: 98 } })
    expect(affixBounds(EQUIPMENT, 1, '未知')).toEqual({ negative: null, positive: null })
  })

  it('pulls a value into the span of its sign', () => {
    expect(clampAffixValue(EQUIPMENT, 1, '攻击', 500)).toBe(382)
    expect(clampAffixValue(EQUIPMENT, 1, '攻击', 20)).toBe(48)
    expect(clampAffixValue(EQUIPMENT, 1, '攻击', 308)).toBe(308)
    expect(clampAffixValue(EQUIPMENT, 1, '攻击', -300)).toBe(-153)
    expect(clampAffixValue(EQUIPMENT, 1, '攻击', -10)).toBe(-76)
  })

  it('leaves 0 alone and flips a sign the family cannot roll', () => {
    expect(clampAffixValue(EQUIPMENT, 1, '攻击', 0)).toBe(0)
    expect(clampAffixValue(EQUIPMENT, 1, '穿刺', -50)).toBe(31)
    expect(clampAffixValue(EQUIPMENT, 1, '未知', 77)).toBe(77)
  })
})

describe('counterpartFor', () => {
  const eye = EQUIPMENT.items[0]

  it('is the item itself when the pathway can wear it', () => {
    expect(counterpartFor(EQUIPMENT, eye, 1200002)?.id).toBe(3020623)
    expect(counterpartFor(EQUIPMENT, eye, null)?.id).toBe(3020623)
  })

  it("swaps a weapon for the other pathway's counterpart", () => {
    expect(counterpartFor(EQUIPMENT, eye, 1200001)?.id).toBe(3010623)
  })

  it('is null when the other pathway has no counterpart', () => {
    // 旧武器 has no 太阳 twin in the fixture.
    expect(counterpartFor(EQUIPMENT, EQUIPMENT.items[2], 1200001)).toBeNull()
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
  it('is 100·n·(n+1) from two extraordinary affixes up, the remainder the game\'s 重塑 tab carries over the affix Marks', () => {
    expect(extraordinaryBonus(0)).toBe(0)
    expect(extraordinaryBonus(1)).toBe(0)
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

  it('treats a tier with no percentage requirement as always met, so the richest such tier wins', () => {
    // The type-1 tiers gate on stages, not on the average percentage; to this lookup they carry no requirement.
    expect(suitTierFor(EQUIPMENT, 1, 0)?.level).toBe(4)
  })
})

describe('suitOf / activeSuits', () => {
  const adventure = EQUIPMENT.items[0]
  const plain = EQUIPMENT.items[2]
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

describe('wholeBodyTier', () => {
  const eight = (stage: number) => Array.from({ length: 8 }, () => stage)

  it('is the richest tier every piece has reached', () => {
    expect(wholeBodyTier(EQUIPMENT, eight(3))?.mark).toBe(560)
    expect(wholeBodyTier(EQUIPMENT, eight(6))?.mark).toBe(1122)
    expect(wholeBodyTier(EQUIPMENT, eight(8))?.mark).toBe(2105)
  })

  it('is held back by the lowest piece', () => {
    expect(wholeBodyTier(EQUIPMENT, [...eight(8).slice(1), 4])?.mark).toBe(560)
    expect(wholeBodyTier(EQUIPMENT, [...eight(8).slice(1), 2])).toBeNull()
  })

  it('needs the whole loadout, not a subset of it', () => {
    expect(wholeBodyTier(EQUIPMENT, [8, 8, 8])).toBeNull()
    expect(wholeBodyTier(EQUIPMENT, [])).toBeNull()
  })
})

describe('suitScoreFor', () => {
  const suit = EQUIPMENT.suits.suits[0]
  const at = (gearLevel: number): typeof EQUIPMENT.items[0] => ({ ...EQUIPMENT.items[0], gearLevel })

  it('runs each piece-count effect at the level of the lowest piece among the highest N', () => {
    // Two 64s, a 62 and the rest 60: a 64 two-piece and a 62 three-piece.
    const { total, effects } = suitScoreFor(EQUIPMENT, suit, [at(64), at(62), at(60), at(64), at(60), null])
    expect(effects).toEqual([
      { pieces: 2, gearLevel: 64, score: 201 * 15 },
      { pieces: 3, gearLevel: 62, score: 323 * 13 },
    ])
    expect(total).toBe(201 * 15 + 323 * 13)
  })

  it('scores only the effects the piece count reaches, and ignores other suits', () => {
    const arena = { ...at(64), suitId: 102 }
    const { effects } = suitScoreFor(EQUIPMENT, suit, [at(64), at(62), arena, arena])
    expect(effects).toEqual([{ pieces: 2, gearLevel: 62, score: 323 * 0 + 201 * 13 }])
    expect(suitScoreFor(EQUIPMENT, suit, [at(64)]).total).toBe(0)
  })

  it('scores nothing without the formulas', () => {
    const bare: Equipment = { ...EQUIPMENT, suits: { ...EQUIPMENT.suits, levelScores: undefined } }
    expect(suitScoreFor(bare, suit, [at(64), at(64), at(64)]).total).toBe(0)
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
    expect(result.affixMark).toBe(3000)
    expect(result.reforgeScore).toBe(4200)
    expect(result.grace?.id).toBe(108)
    expect(result.total).toBe(2430 + 240 + 4200)
  })

  // Four weapons read off the game's own 重塑 tab. Each reproduces exactly:
  // the rungs' integer Marks plus the extraordinary bonus, nothing rounded.
  const reforge = (affixes: [string, number][]) =>
    evaluatePiece(EQUIPMENT, GRACES, {
      slot: 1, itemId: null, enhanceStage: 0, refinePercent: 0,
      affixes: affixes.map(([family, value]) => ({ family, value })),
    }, 101)

  it('reproduces 攻击 +308 +233 +332 reading 3485, and the card\'s three tabs summing to 6155', () => {
    const result = evaluatePiece(EQUIPMENT, GRACES, {
      slot: 1, itemId: 3020623, enhanceStage: 3, refinePercent: 100,
      affixes: [{ family: '攻击', value: 308 }, { family: '攻击', value: 233 }, { family: '攻击', value: 332 }],
    }, 101)
    expect(result.affixMark).toBe(805 + 610 + 870)
    expect(result.reforgeScore).toBe(3485)
    expect(result.grace?.id).toBe(109)
    expect(result.total).toBe(6155)
  })

  it('reproduces 攻击 +283 +283 with 穿刺 +50 reading 2282 — not a multiple of five', () => {
    const result = reforge([['攻击', 283], ['攻击', 283], ['穿刺', 50]])
    expect(result.extraordinaryCount).toBe(2)
    expect(result.reforgeScore).toBe(740 + 740 + 202 + 600)
    expect(result.reforgeScore).toBe(2282)
  })

  it('reproduces 攻击 +357 +283 +283 with 技能增强 +70 reading 5285', () => {
    const result = reforge([['攻击', 357], ['攻击', 283], ['攻击', 283], ['技能增强', 70]])
    expect(result.extraordinaryBonus).toBe(2000)
    expect(result.reforgeScore).toBe(935 + 740 + 740 + 870 + 2000)
    expect(result.reforgeScore).toBe(5285)
  })

  it('reproduces 攻击 +183 +183 +233 with 技能增强 +49 reading 4180', () => {
    const result = reforge([['攻击', 183], ['攻击', 183], ['攻击', 233], ['技能增强', 49]])
    expect(result.reforgeScore).toBe(480 + 480 + 610 + 610 + 2000)
    expect(result.reforgeScore).toBe(4180)
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
    expect(playableProfessions(EQUIPMENT).map((p) => p.id)).toEqual([1200001, 1200002])
  })
})

describe('itemsForSlot', () => {
  it('narrows a class-locked slot to that pathway', () => {
    expect(itemsForSlot(EQUIPMENT, 1, 1200002)).toHaveLength(2)
    expect(itemsForSlot(EQUIPMENT, 1, 1200001)).toHaveLength(1)
    expect(itemsForSlot(EQUIPMENT, 1, 1200009)).toHaveLength(0)
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
    expect(itemsForSlot(armour, 12, 1200009)).toHaveLength(1)
    expect(itemsForSlot(armour, 12, null)).toHaveLength(1)
  })

  it('returns everything when no pathway is chosen', () => {
    expect(itemsForSlot(EQUIPMENT, 1, null)).toHaveLength(3)
  })

  it('sorts by gear level, highest first, then quality', () => {
    expect(itemsForSlot(EQUIPMENT, 1, 1200002).map((i) => i.gearLevel)).toEqual([62, 60])
    const twoAtOnce: Equipment = {
      ...EQUIPMENT,
      items: [{ ...EQUIPMENT.items[0], id: 1, quality: 4 }, { ...EQUIPMENT.items[0], id: 2, quality: 6 }],
    }
    expect(itemsForSlot(twoAtOnce, 1, 1200002).map((i) => i.id)).toEqual([2, 1])
  })
})
