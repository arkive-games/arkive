import { describe, expect, it } from 'vitest'

import type { HistoryResearchRank } from '../fellows/data'
import type { PartnerScoring, SecretPartner } from '../secretpartners/data'
import {
  activeAttributes,
  carriedPuppetSkill,
  clampSlots,
  clampStage,
  DEFAULT_DEPLOY_SLOTS,
  evaluatePuppets,
  puppetSkillScore,
  skillTier,
  hasMarks,
  historyRankFor,
  historyScore,
  isBondsDraft,
  panelFloor,
  puppetLevelCap,
  roundHalfUp,
  talentMark,
} from './bonds'

const SCORING: PartnerScoring = {
  inDominateRate: 1,
  nonDominateRate: 0.35,
  initialDominateSlots: 1,
  maxDominateSlots: 8,
  maxStar: 50,
}

/** A puppet whose two ladders are the client's 20/stage and 16/stage shapes. */
function partner(id: number, perStage: number[] = [20, 16]): SecretPartner {
  const ladder = (step: number) => Array.from({ length: 50 }, (_, i) => step * (i + 1))
  return {
    id,
    name: `Puppet ${id}`,
    quality: 6,
    description: '',
    portrait: String(id),
    category: '',
    attributes: perStage.map((step, index) => ({
      key: `Stat${index}`,
      name: `Stat ${index}`,
      format: 'number',
      values: ladder(0.001),
      marks: ladder(step),
    })),
    skill: { id: 1, name: '', tags: [], cooldown: null, description: '', brief: '', hasFormula: false, castTargets: [] },
    upgrades: [],
  }
}

const RANKS: HistoryResearchRank[] = [
  { id: 1, rank: 1, subRank: 1, name: '混沌', score: 1, mark: 165, attributes: [] },
  { id: 2, rank: 1, subRank: 2, name: '蒙启', score: 30, mark: 941, attributes: [] },
  { id: 3, rank: 1, subRank: 3, name: '觅径', score: 65, mark: 1828, attributes: [] },
]

describe('puppet attribute score', () => {
  it('sums the attribute Marks at the stage', () => {
    expect(talentMark(partner(1), 1)).toBe(36)
    expect(talentMark(partner(1), 50)).toBe(1800)
  })

  it('scores nothing for a puppet whose dataset has no Mark ladder', () => {
    const bare = partner(1)
    delete bare.attributes[0].marks
    expect(hasMarks(bare)).toBe(false)
    expect(talentMark(bare, 50)).toBe(0)
  })

  it('weights dominated puppets in full and the rest by the non-dominate rate, then rounds half up', () => {
    const result = evaluatePuppets(
      [
        { partnerId: 1, stage: 10, dominated: true },
        { partnerId: 2, stage: 10, dominated: false },
      ],
      [partner(1), partner(2)],
      SCORING,
      8,
    )
    // 360 + 360 × 0.35 = 486. The per-row figure is a double (360 × 0.35 is
    // not exactly 126); only the total is rounded, as in the client.
    expect(result.rows[0].score).toBe(360)
    expect(result.rows[1].score).toBeCloseTo(126, 9)
    expect(result.total).toBe(486)
    expect(result.dominated).toBe(1)
  })

  it('honours dominate in list order up to the slot count', () => {
    const result = evaluatePuppets(
      [
        { partnerId: 1, stage: 1, dominated: true },
        { partnerId: 2, stage: 1, dominated: true },
      ],
      [partner(1), partner(2)],
      SCORING,
      1,
    )
    expect(result.rows.map((row) => row.dominated)).toEqual([true, false])
    // 36 + 12.6 = 48.6: the panel truncates to 48 where the lineup preview would show 49.
    expect(result.total).toBe(48)
  })

  it('drops entries whose puppet left the dataset and clamps a stored stage', () => {
    const result = evaluatePuppets(
      [
        { partnerId: 9, stage: 3, dominated: true },
        { partnerId: 1, stage: 99, dominated: false },
      ],
      [partner(1)],
      SCORING,
      null,
    )
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].mark).toBe(talentMark(partner(1), 50))
    expect(result.slots).toBe(DEFAULT_DEPLOY_SLOTS)
  })

  it('leaves out a puppet at level 0, which is not owned', () => {
    const result = evaluatePuppets([{ partnerId: 1, stage: 0, dominated: true }], [partner(1)], SCORING, null)
    expect(result.rows).toHaveLength(0)
    expect(result.dominated).toBe(0)
  })

  it('sums the active attributes by key, each puppet at its deploy rate', () => {
    const result = evaluatePuppets(
      [
        { partnerId: 1, stage: 10, dominated: true },
        { partnerId: 2, stage: 20, dominated: false },
        { partnerId: 3, stage: 0, dominated: false },
      ],
      [partner(1), partner(2), partner(3)],
      SCORING,
      8,
    )
    const totals = activeAttributes(result, SCORING)
    expect(totals.map((total) => total.key)).toEqual(['Stat0', 'Stat1'])
    // 0.010 in full plus 0.020 × 0.35; the unowned puppet adds nothing.
    expect(totals[0].value).toBeCloseTo(0.017, 9)
    expect(totals[0].sources).toBe(2)
  })

  it('rounds the total the way the client does', () => {
    expect(roundHalfUp(12.5)).toBe(13)
    expect(roundHalfUp(12.49)).toBe(12)
    expect(clampStage(-3, SCORING)).toBe(0)
    expect(clampStage(Number.NaN, SCORING)).toBe(0)
    expect(clampSlots(99, SCORING)).toBe(8)
    expect(clampSlots(null, SCORING)).toBe(3)
  })
})

describe('puppet skill score', () => {
  const TIERS = [1, 10, 20, 30, 40, 50].map((requiredStage, index) => ({ tier: index + 1, requiredStage, description: '' }))
  const withQuality = (quality: number): SecretPartner => ({ ...partner(1), quality, upgrades: TIERS })

  it('maps a puppet level to its skill tier, which alone moves the score', () => {
    expect(skillTier(withQuality(6), 0)).toBe(0)
    expect(skillTier(withQuality(6), 9)).toBe(1)
    expect(skillTier(withQuality(6), 10)).toBe(2)
    expect(skillTier(withQuality(6), 50)).toBe(6)
    expect(puppetSkillScore(withQuality(6), 11).score).toBe(puppetSkillScore(withQuality(6), 19).score)
  })

  it('reproduces every in-game reading at skill level 38', () => {
    const at = (quality: number, tier: number) => puppetSkillScore(withQuality(quality), TIERS[tier - 1].requiredStage).score
    expect([1, 2, 3, 4, 5].map((tier) => at(6, tier))).toEqual([1613, 1959, 2306, 2653, 3000])
    expect([2, 3, 4, 5].map((tier) => at(5, tier))).toEqual([1569, 1847, 2125, 2403])
    expect([4, 5].map((tier) => at(4, tier))).toEqual([1700, 1923])
    expect(at(7, 1)).toBe(2016)
  })

  it('caps the skill level at the client\'s 75 DeltaLv columns', () => {
    expect(puppetSkillScore(withQuality(6), 40, 99999).score).toBe(puppetSkillScore(withQuality(6), 40, 75).score)
    expect(puppetSkillScore(withQuality(6), 40, Number.NaN).score).toBe(3000)
  })

  it('follows the skill level as floor(k × (L + 9)), floored before the tier multiplier', () => {
    // Orange tier 2 read at skill level 16.
    expect(puppetSkillScore(withQuality(6), 10, 16).score).toBe(1042)
    // Gold tier 3 at L38 is 1847 only when the base (1292.5) is floored first.
    expect(puppetSkillScore(withQuality(5), 20, 38).score).toBe(1847)
  })

  it('reproduces the max curve: orange at the tier the season allows', () => {
    // Skill level → (tier the curve assumes, the curve's value), from rating.json.
    const curve: [number, number, number][] = [[6, 2, 624], [11, 2, 833], [12, 3, 1029], [22, 3, 1520], [23, 4, 1806], [35, 4, 2483], [37, 5, 2935], [41, 5, 3191], [43, 6, 3701], [45, 6, 3844]]
    for (const [level, tier, value] of curve) expect(puppetSkillScore(withQuality(6), TIERS[tier - 1].requiredStage, level).score).toBe(value)
  })

  it('marks only red past tier 1 as an estimate', () => {
    expect(puppetSkillScore(withQuality(6), 50).estimated).toBe(false)
    expect(puppetSkillScore(withQuality(6), 40, 20).estimated).toBe(false)
    expect(puppetSkillScore(withQuality(7), 1).estimated).toBe(false)
    expect(puppetSkillScore(withQuality(7), 10).estimated).toBe(true)
  })

  it('carries the chosen owned puppet, or else the best-scoring one', () => {
    const red = { ...withQuality(7), id: 7 }
    const orange = { ...withQuality(6), id: 6 }
    const entries = [
      { partnerId: 6, stage: 40, dominated: false },
      { partnerId: 7, stage: 1, dominated: false },
    ]
    expect(carriedPuppetSkill(entries, [red, orange], SCORING, null, null)?.partner.id).toBe(6)
    expect(carriedPuppetSkill(entries, [red, orange], SCORING, 7, null)?.partner.id).toBe(7)
    expect(carriedPuppetSkill([], [red], SCORING, null, null)).toBeNull()
  })
})

describe('history research score', () => {
  it('finds the highest rank whose threshold the points meet', () => {
    expect(historyRankFor(RANKS, 0)).toBeNull()
    expect(historyRankFor(RANKS, 1)?.id).toBe(1)
    expect(historyRankFor(RANKS, 29)?.id).toBe(1)
    expect(historyRankFor(RANKS, 30)?.id).toBe(2)
    expect(historyRankFor(RANKS, 1000)?.id).toBe(3)
  })

  it('scores the rank by its Mark, and nothing before the first rank', () => {
    expect(historyScore(RANKS, 0)).toBe(0)
    expect(historyScore(RANKS, 30)).toBe(941)
    expect(historyScore(RANKS, 31)).toBe(941)
  })
})

describe('bonds draft validation', () => {
  it('accepts the stored shape and rejects a malformed one', () => {
    expect(isBondsDraft({ puppets: [{ partnerId: 1, stage: 3, dominated: true }], dominateSlots: null, historyRankId: 4 })).toBe(true)
    expect(isBondsDraft({ puppets: [{ partnerId: 1, stage: '3', dominated: true }], dominateSlots: null, historyRankId: 4 })).toBe(false)
    expect(isBondsDraft({ puppets: [], dominateSlots: 'all', historyRankId: null })).toBe(false)
    expect(isBondsDraft(null)).toBe(false)
  })
})

describe('puppetLevelCap', () => {
  const days = [0, 0, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 7, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81, 84, 87]
  const scoring = { ...SCORING, levelUnlockDays: days }

  it('opens the levels whose day has come', () => {
    expect(puppetLevelCap(scoring, 0)).toBe(2)
    expect(puppetLevelCap(scoring, 67)).toBe(43)
    expect(puppetLevelCap(scoring, 69)).toBe(44)
    expect(puppetLevelCap(scoring, 500)).toBe(50)
  })

  it('falls back to the table maximum without a schedule', () => {
    expect(puppetLevelCap(SCORING, 0)).toBe(50)
  })
})

describe('panelFloor', () => {
  it('truncates as the rating panel does, and survives float drift', () => {
    expect(panelFloor(9902.6)).toBe(9902)
    expect(panelFloor(0.1 * 3 * 10)).toBe(3)
    expect(panelFloor(4.9999999999)).toBe(5)
  })
})
