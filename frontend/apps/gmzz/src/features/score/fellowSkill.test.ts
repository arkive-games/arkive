import { describe, expect, it } from 'vitest'

import type { Fellow, FellowRelation } from '../fellows/data'
import {
  carriedFellowSkill,
  fellowBase,
  fellowOptions,
  fellowS,
  fellowSkillScore,
  relationResearchPoints,
  relationTier,
  skillLevelCap,
  starMap, pathwaySkillScore } from './fellowSkill'

/**
 * Every in-game reading, as [skill level, star, relation quality, relation tier, score].
 * Quality 0 / tier 0 is a connection with no relation bonus. The same list is
 * in `docs/gmzz-skill-scores.md`, with who was measured.
 */
const GOLD_READINGS: [number, number, number, number, number][] = [
  [38, 0, 0, 0, 1344], [38, 2, 0, 0, 1612], [38, 5, 0, 0, 2016],
  [38, 5, 1, 6, 2419], [38, 5, 1, 5, 2352], [38, 4, 1, 5, 2217], [38, 4, 1, 4, 2157], [38, 4, 1, 3, 2096],
  [38, 4, 1, 2, 2036], [38, 3, 1, 4, 2016], [38, 3, 1, 3, 1940], [38, 2, 1, 3, 1814],
  [38, 5, 2, 6, 2822], [38, 4, 2, 5, 2520], [38, 4, 2, 4, 2399], [38, 3, 2, 4, 2217],
  [37, 3, 2, 4, 2169], [37, 4, 2, 4, 2347], [37, 4, 1, 5, 2169], [37, 4, 1, 2, 1992],
  [25, 0, 2, 1, 1093], [25, 2, 2, 1, 1263],
  [29, 1, 2, 1, 1303], [29, 2, 2, 1, 1411], [29, 2, 2, 2, 1520], [29, 1, 2, 2, 1384], [29, 0, 1, 1, 1140], [29, 2, 1, 1, 1357],
  [30, 2, 2, 3, 1672], [30, 5, 2, 3, 2007], [30, 0, 0, 0, 1115], [30, 0, 1, 1, 1170], [30, 5, 1, 1, 1728],
]

const fellow = (id: number, quality = 5): Fellow =>
  ({ id, name: `F${id}`, shortName: `F${id}`, quality, order: id, portrait: '', relationIds: [], skill: { name: `S${id}`, icon: '' } }) as unknown as Fellow

const relation = (id: number, quality: number, members: [number, boolean][]): FellowRelation =>
  ({ id, name: `R${id}`, quality, order: id, members: members.map(([fellowId, effect]) => ({ fellowId, effectId: effect ? id : null })) }) as unknown as FellowRelation

describe('connection skill score', () => {
  it('reproduces every gold reading across skill levels 25-38', () => {
    for (const [level, star, quality, tier, score] of GOLD_READINGS) {
      expect(fellowSkillScore(5, star, quality, tier, level).score, `L${level} ${star}★ q${quality} tier ${tier}`).toBe(score)
    }
  })

  it('reproduces the purple full-star readings', () => {
    expect(fellowSkillScore(4, 5, 0, 0, 38).score).toBe(1551)
    expect(fellowSkillScore(4, 5, 0, 0, 16).score).toBe(825)
  })

  it('lands on the client\'s max curve: 5★ at a full quality-1 relation', () => {
    const curve: [number, number][] = [[6, 772], [17, 1337], [24, 1697], [28, 1904], [35, 2264], [38, 2419], [45, 2779]]
    for (const [level, value] of curve) expect(fellowSkillScore(5, 5, 1, 6, level).score).toBe(value)
  })

  it('keeps S independent of skill level, and the base is the 0★ relation-less score', () => {
    expect(fellowBase(5, 38)).toBe(1344)
    expect(fellowBase(4, 38)).toBe(1034)
    expect(fellowS(4, 2, 4).scaled).toBe(1428)
  })

  it('caps the tier at star + 1 and flags the unconfirmed cells', () => {
    expect(fellowS(2, 1, 6).scaled).toBe(fellowS(2, 1, 3).scaled)
    expect(fellowS(4, 1, 2).estimated).toBe(false)
    expect(fellowS(3, 2, 2).estimated).toBe(true)
    expect(fellowS(1, 1, 1).estimated).toBe(true)
    expect(fellowS(3, 1, 3).estimated).toBe(false)
  })
})

describe('connection relations', () => {
  const gold = [fellow(1), fellow(2), fellow(3)]
  const purple = fellow(9, 4)
  const q1 = relation(10, 1, [[1, true], [2, true], [9, false]])
  const q2 = relation(20, 2, [[1, true], [3, true]])
  const q0 = relation(30, 0, [[1, false], [2, false]])

  it('sets a relation\'s tier to its lowest member\'s star plus one, and 0 while any member is missing', () => {
    expect(relationTier(q1, starMap([{ fellowId: 1, star: 5 }, { fellowId: 2, star: 3 }, { fellowId: 9, star: 4 }]))).toBe(4)
    expect(relationTier(q1, starMap([{ fellowId: 1, star: 5 }, { fellowId: 2, star: 3 }]))).toBe(0)
  })

  it('offers only quality-1 and quality-2 relations that hold an effect for the connection, best first', () => {
    const stars = starMap([{ fellowId: 1, star: 4 }, { fellowId: 2, star: 4 }, { fellowId: 3, star: 4 }, { fellowId: 9, star: 3 }])
    const options = fellowOptions(gold[0], [q0, q1, q2], stars, 38)
    expect(options.map((o) => [o.relation?.id, o.tier, o.score])).toEqual([[20, 5, 2520], [10, 4, 2157]])
    // One base per connection, whatever the relation; the relation's share is the rest.
    expect(new Set(options.map((o) => o.base)).size).toBe(1)
    expect(options.every((o) => o.score > o.base)).toBe(true)
    expect(fellowOptions(purple, [q1], stars, 38).map((o) => o.relation)).toEqual([null])
  })

  it('carries the chosen connection with the chosen relation, else the best of everything', () => {
    const entries = [{ fellowId: 1, star: 4 }, { fellowId: 2, star: 4 }, { fellowId: 3, star: 4 }, { fellowId: 9, star: 3 }]
    const all = [...gold, purple]
    expect(carriedFellowSkill(entries, all, [q1, q2], null, null, 38)?.score).toBe(2520)
    expect(carriedFellowSkill(entries, all, [q1, q2], 1, 10, 38)?.relation?.id).toBe(10)
    expect(carriedFellowSkill(entries, all, [q1, q2], 1, 999, 38)?.relation?.id).toBe(20)
    expect(carriedFellowSkill([], all, [q1, q2], 1, null, 38)).toBeNull()
  })
})

describe('history research from relations', () => {
  it('pays each relation its rewards for every grade its tier has reached', () => {
    const rewards = [16, 16, 16, 16, 16, 32].map((value, grade) => ({ grade, gradeName: '', value }))
    const rel = { ...relation(1, 1, [[1, true], [2, true]]), researchRewards: rewards } as FellowRelation
    expect(relationResearchPoints([rel], starMap([{ fellowId: 1, star: 5 }]))).toBe(0)
    expect(relationResearchPoints([rel], starMap([{ fellowId: 1, star: 5 }, { fellowId: 2, star: 2 }]))).toBe(48)
    expect(relationResearchPoints([rel], starMap([{ fellowId: 1, star: 5 }, { fellowId: 2, star: 5 }]))).toBe(112)
  })
})

describe('skill level cap', () => {
  it('reads the skill level back off the connection max curve', () => {
    // [curve value, level]: role 1-39, 40-46, 47-52, divinity 0, 22, 30.
    const points: [number, number][] = [[617, 3], [720, 5], [772, 6], [1440, 19], [2419, 38], [2779, 45]]
    for (const [value, level] of points) expect(skillLevelCap(value)).toBe(level)
    expect(skillLevelCap(1)).toBeNull()
  })
})

describe('pathwaySkillScore', () => {
  it('is 82 x level + 741 once every skill is unlocked, as the game shows', () => {
    // Divinity 23 sits at L38 on a 3854 curve, divinity 24 at L40 on 4018;
    // the panel reads 3857 and 4021, three above the curve.
    expect(pathwaySkillScore(38, 3854, 38)).toBe(3857)
    expect(pathwaySkillScore(40, 4018, 40)).toBe(4021)
    expect(pathwaySkillScore(35, 4018, 40)).toBe(82 * 35 + 741)
    // Never past the cap the progression allows.
    expect(pathwaySkillScore(60, 4018, 40)).toBe(4021)
  })

  it('takes the curve as it is where some skills are still locked', () => {
    // Role level 1-39 (L3) and 40-46 (L5) do not fit the formula.
    expect(pathwaySkillScore(3, 624, 3)).toBe(624)
    expect(pathwaySkillScore(5, 1008, 5)).toBe(1008)
    expect(pathwaySkillScore(5, 1008, null)).toBe(1008)
  })
})
