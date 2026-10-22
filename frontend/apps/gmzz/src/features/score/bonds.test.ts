import { describe, expect, it } from 'vitest'

import type { HistoryResearchRank } from '../fellows/data'
import type { PartnerScoring, SecretPartner } from '../secretpartners/data'
import {
  clampSlots,
  clampStage,
  evaluatePuppets,
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
    expect(result.slots).toBe(SCORING.initialDominateSlots)
  })

  it('rounds the total the way the client does', () => {
    expect(roundHalfUp(12.5)).toBe(13)
    expect(roundHalfUp(12.49)).toBe(12)
    expect(clampStage(0, SCORING)).toBe(1)
    expect(clampStage(Number.NaN, SCORING)).toBe(1)
    expect(clampSlots(99, SCORING)).toBe(8)
    expect(clampSlots(null, SCORING)).toBe(1)
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
