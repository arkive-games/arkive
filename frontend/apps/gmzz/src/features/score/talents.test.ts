import { describe, expect, it } from 'vitest'

import {
  autoAllocate,
  carryTalents,
  clampLevel,
  talentLimits,
  evaluateTalents,
  formatTalentStat,
  nodeStatsAt,
  talentStats,
  isTalentDraft,
  pointCap,
  treeFor,
  treesFor,
  type Talents,
  type TalentTree,
} from './talents'
import { pathwayFormula, LEVEL_MODULE, SKILL_MODULE, TALENT_MODULE } from './pathwayFormulas'
import type { Rating, SpeciesResult } from './data'
import type { TFunction } from 'i18next'

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

describe('carryTalents', () => {
  it('moves the levels to the same tree position and node positions of the new pathway', () => {
    const draft = { treeId: 101, levels: { 10100: 5, 10101: 3 } }
    const carried = carryTalents(TALENTS, draft, 1200001, 1200002)
    expect(carried.treeId).toBe(201)
    expect(carried.levels[20100]).toBe(5)
    expect(carried.levels[20101]).toBe(3)
    // The old keys stay, so switching back restores them.
    expect(carryTalents(TALENTS, carried, 1200002, 1200001).levels[10100]).toBe(5)
  })
})

describe('pathwayFormula', () => {
  // Keys and their arguments, so each assertion reads what the text would carry.
  const t = ((key: string, args?: Record<string, unknown>) => (args ? `${key} ${JSON.stringify(args)}` : key)) as unknown as TFunction
  const rating = { maxRoleLevel: 70, maxDivinityLevel: 30 } as Rating
  const item = (module: string, score: number) => ({ species: { module }, score } as unknown as SpeciesResult)

  it('reads the talent tree the calculator scores', () => {
    const tree101 = TALENTS.trees[0]
    const limits = talentLimits(tree101, 10200)
    const result = evaluateTalents(tree101, autoAllocate(tree101, limits), limits)
    const text = String(pathwayFormula(item(TALENT_MODULE, result.total), { rating, talents: result, limits }, t))
    expect(text).toContain('"points":40')
    expect(text).toContain('"cores":3')
    expect(text).toContain(`"score":"${(10200).toLocaleString()}"`)
  })

  it('tells the fitted pathway-skill line from the curve value', () => {
    const live = String(pathwayFormula(item(SKILL_MODULE, 82 * 38 + 741), { rating, talents: null, limits: null }, t))
    expect(live).toContain('pathway.eqSkill')
    expect(live).toContain('"level":38')
    // 1394 is a curve value before every skill unlocks: never 741 modulo 82.
    const curve = String(pathwayFormula(item(SKILL_MODULE, 1394), { rating, talents: null, limits: null }, t))
    expect(curve).toContain('pathway.eqSkillCurve')
  })

  it('states the level as its benchmark', () => {
    const text = String(pathwayFormula(item(LEVEL_MODULE, 5000), { rating, talents: null, limits: null }, t))
    expect(text).toContain('pathway.eqLevel')
    expect(text).toContain('"score":"' + (5000).toLocaleString() + '"')
    expect(pathwayFormula(item('Other', 1), { rating, talents: null, limits: null }, t)).toBeNull()
  })
})

describe('talent stats', () => {
  const ladder = (key: string, name: string, per: number) =>
    ({ key, name, format: 'number' as const, values: Array.from({ length: 15 }, (_, i) => per * (i + 1)) })
  // Node i grants 攻击 (10 × (i + 1)) per level; the first also grants 防御.
  const statTree = (): TalentTree => {
    const base = tree(101, 1200001, true)
    return {
      ...base,
      nodes: base.nodes.map((node, i) =>
        node.type === 'normal'
          ? { ...node, stats: [ladder('Atk_N', '攻击', 10 * (i + 1)), ...(i === 0 ? [ladder('Def_N', '防御', 7)] : [])] }
          : { ...node, stats: [] },
      ),
    }
  }

  it('reads a node\'s ladder as the total at that level, and nothing at level 0', () => {
    const node = statTree().nodes[0]
    expect(nodeStatsAt(node, 0)).toEqual([])
    expect(nodeStatsAt(node, 3)).toEqual([
      { key: 'Atk_N', name: '攻击', format: 'number', value: 30 },
      { key: 'Def_N', name: '防御', format: 'number', value: 21 },
    ])
  })

  it('sums every levelled node at its scored level, in the order stats first appear', () => {
    const t = statTree()
    const result = evaluateTalents(t, { 10100: 2, 10101: 3 })
    expect(talentStats(result)).toEqual([
      { key: 'Atk_N', name: '攻击', format: 'number', value: 10 * 2 + 20 * 3 },
      { key: 'Def_N', name: '防御', format: 'number', value: 7 * 2 },
    ])
  })

  it('counts nothing a node cannot hold: locked nodes and over-cap levels drop out', () => {
    const t = statTree()
    // Node 2 is locked behind an empty node 1; node 0 is clamped to the limits' level cap.
    const result = evaluateTalents(t, { 10100: 15, 10102: 5 }, { points: 40, nodes: 4, levelCap: 10 })
    expect(talentStats(result)).toEqual([
      { key: 'Atk_N', name: '攻击', format: 'number', value: 10 * 10 },
      { key: 'Def_N', name: '防御', format: 'number', value: 7 * 10 },
    ])
  })

  it('is empty with no tree, and for data without stat ladders', () => {
    expect(talentStats(null)).toEqual([])
    expect(talentStats(evaluateTalents(tree(101, 1200001), { 10100: 5 }))).toEqual([])
  })

  it('formats a bonus with its sign, a percentage as a percentage', () => {
    expect(formatTalentStat({ format: 'number', value: 1234 }, 'en-US')).toBe('+1,234')
    expect(formatTalentStat({ format: 'percent', value: 0.073 }, 'zh-CN')).toBe('+7.3%')
  })
})
