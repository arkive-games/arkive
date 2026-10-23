import { describe, expect, it } from 'vitest'

import {
  clampLevel,
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
