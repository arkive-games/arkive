import { describe, expect, it } from 'vitest'

import type { HistoryResearchRank } from '../fellows/data'
import type { PartnerScoring, SecretPartner } from '../secretpartners/data'
import {
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
    expect(result.total).toBe(roundHalfUp(36 + 36 * 0.35))
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

  it('marks tier 6 and other skill levels as estimates', () => {
    expect(puppetSkillScore(withQuality(6), 40).estimated).toBe(false)
    expect(puppetSkillScore(withQuality(6), 50).estimated).toBe(true)
    expect(puppetSkillScore(withQuality(6), 40, 39).estimated).toBe(true)
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
    expect(historyScore(RANKS, null)).toBe(0)
    expect(historyScore(RANKS, 2)).toBe(941)
    expect(historyScore(RANKS, 42)).toBe(0)
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
