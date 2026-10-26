import { describe, expect, it } from 'vitest'

import {
  autoAllocate,
  clampLevel,
  talentLimits,
  evaluateTalents,
  isTalentDraft,
  pointCap,
  treeFor,
  treesFor,
  type Talents,
  type TalentTree,
} from './talents'

function tree(id: number, professionId: number, isDefault = false): TalentTree {
  const normal = Array.from({ length: 5 }, (_, i) => ({
    key: id * 100 + i,
    name: `n${i}`,
    mark: 180,
    maxLevel: 15,
    type: 'normal' as const,
    parentKey: i === 0 ? null : id * 100 + i - 1,
    position: i,
    description: '',
  }))
  const special = Array.from({ length: 4 }, (_, i) => ({
    key: id * 100 + 5 + i,
    name: `s${i}`,
    mark: 1000,
    maxLevel: 0,
    type: 'special' as const,
    parentKey: id * 100 + 1 + i,
    position: 11 + i * 10,
    description: '',
  }))
  return {
    id,
    name: `tree ${id}`,
    tag: '',
    description: '',
    professionId,
    default: isDefault,
    pointCapsBySequenceStage: [10, 40, 75],
    maxScore: 17500,
    nodes: [...normal, ...special],
  }
}

const TALENTS: Talents = { trees: [tree(101, 1200001, true), tree(102, 1200001), tree(201, 1200002)] }

describe('tree selection', () => {
  it('offers only the pathway\'s trees, and resolves the stored one or the default', () => {
    expect(treesFor(TALENTS, 1200001).map((t) => t.id)).toEqual([101, 102])
    expect(treeFor(TALENTS, 1200001, 102)?.id).toBe(102)
    expect(treeFor(TALENTS, 1200001, null)?.id).toBe(101)
    // A tree from another pathway is not honoured.
    expect(treeFor(TALENTS, 1200001, 201)?.id).toBe(101)
    expect(treeFor(TALENTS, 1200002, null)?.id).toBe(201)
    expect(treeFor(TALENTS, 9, null)).toBeNull()
  })
})

describe('evaluateTalents', () => {
  const t = TALENTS.trees[0]

  it('is mark × level for levelled nodes and mark per activated special node', () => {
    const result = evaluateTalents(t, { 10100: 15, 10101: 3, 10105: 1, 10106: 0 })
    expect(result.nodes.map((n) => n.score)).toEqual([2700, 540, 0, 0, 0, 1000, 0, 0, 0])
    expect(result.total).toBe(4240)
    expect(result.pointsSpent).toBe(18)
    expect(result.activated).toBe(1)
  })

  it('reaches the species ceiling with every node maxed', () => {
    const levels = Object.fromEntries(t.nodes.map((n) => [n.key, n.type === 'normal' ? 15 : 1]))
    expect(evaluateTalents(t, levels).total).toBe(17500)
  })

  it('clamps a node past its cap and the tree past its point cap, in node order', () => {
    const result = evaluateTalents(t, { 10100: 99, 10101: 15, 10102: 15, 10103: 15, 10104: 15, 10105: 7 })
    expect(result.nodes[0].level).toBe(15)
    expect(result.pointsSpent).toBe(75)
    expect(result.nodes[4].level).toBe(15)
    // Over-spent drafts lose their LAST levels: 15×5 = 75 fits exactly here.
    const over = evaluateTalents({ ...t, pointCapsBySequenceStage: [10, 40, 60] }, { 10100: 15, 10101: 15, 10102: 15, 10103: 15, 10104: 15 })
    expect(over.nodes.map((n) => n.level).slice(0, 5)).toEqual([15, 15, 15, 15, 0])
    expect(over.pointCap).toBe(60)
    // A special node is on or off.
    expect(result.nodes[5].level).toBe(1)
    expect(result.nodes[5].score).toBe(1000)
  })

  it('scores nothing without a tree', () => {
    expect(evaluateTalents(null, { 1: 5 }).total).toBe(0)
  })

  it('falls back to the sum of node levels when the tree carries no caps', () => {
    expect(pointCap({ ...t, pointCapsBySequenceStage: [] })).toBe(75)
    expect(clampLevel(t.nodes[0], Number.NaN)).toBe(0)
    expect(clampLevel(t.nodes[5], 9)).toBe(1)
  })
})

describe('talent draft validation', () => {
  it('accepts the stored shape and rejects a malformed one', () => {
    expect(isTalentDraft({ treeId: 101, levels: { '10100': 3 } })).toBe(true)
    expect(isTalentDraft({ treeId: null, levels: {} })).toBe(true)
    expect(isTalentDraft({ treeId: '101', levels: {} })).toBe(false)
    expect(isTalentDraft({ treeId: 101, levels: { '10100': '3' } })).toBe(false)
    expect(isTalentDraft(null)).toBe(false)
  })
})

describe('progression limits', () => {
  const t = TALENTS.trees[0]

  it('splits the max curve into points, open nodes and the level cap', () => {
    // Divinity 19: 10200 = 3 cores + 40 points, four nodes at Lv10.
    expect(talentLimits(t, 10200)).toEqual({ points: 40, nodes: 4, levelCap: 10 })
    // Divinity 20: 11920 = 4 cores + 44 points, the last node opens and caps lift to 15.
    expect(talentLimits(t, 11920)).toEqual({ points: 44, nodes: 5, levelCap: 15 })
    expect(talentLimits(t, 17500)).toEqual({ points: 75, nodes: 5, levelCap: 15 })
    // Role level 1: 1540 = 1 core + 3 points, two nodes open.
    expect(talentLimits(t, 1540)).toEqual({ points: 3, nodes: 2, levelCap: 10 })
  })

  it('opens a node only after the one before it has a level, and switches its core on by itself', () => {
    const limits = talentLimits(t, 10200)
    const gap = evaluateTalents(t, { 10100: 5, 10101: 0, 10102: 5 }, limits)
    expect(gap.nodes[2].locked).toBe(true)
    expect(gap.nodes[2].level).toBe(0)
    const chain = evaluateTalents(t, { 10100: 1, 10101: 1, 10102: 1 }, limits)
    // Each core hangs under nodes 1..4; nodes 1 and 2 are learnt, so two cores are on.
    expect(chain.activated).toBe(2)
    expect(chain.total).toBe(3 * 180 + 2 * 1000)
  })

  it('never takes a node past the progression level cap, nor the fifth node before it opens', () => {
    const limits = talentLimits(t, 10200)
    const result = evaluateTalents(t, { 10100: 15, 10101: 15, 10102: 15, 10103: 15, 10104: 15 }, limits)
    expect(result.nodes.slice(0, 5).map((n) => n.level)).toEqual([10, 10, 10, 10, 0])
    expect(result.total).toBe(40 * 180 + 3 * 1000)
  })

  it('allocates one level everywhere first, then fills from the last node back', () => {
    const limits = talentLimits(t, 11920)
    const levels = autoAllocate(t, limits)
    expect([10100, 10101, 10102, 10103, 10104].map((k) => levels[k])).toEqual([1, 1, 12, 15, 15])
    expect(evaluateTalents(t, levels, limits).total).toBe(11920)
    const early = autoAllocate(t, talentLimits(t, 10200))
    expect([10100, 10101, 10102, 10103, 10104].map((k) => early[k])).toEqual([10, 10, 10, 10, 0])
  })
})
