// Relative imports, like the rest of `features/score`: the root vitest config has no `@` alias.
import { dataUrl } from '../../lib/urls'

/**
 * 非凡天赋 — the one 途径 item the package can score.
 *
 * No client script reads `TalentNodeData.Mark`, but the species' benchmark
 * curve is made of nothing else: every tree is five levelled nodes at Mark 180
 * (15 levels each) and four activate-only nodes at Mark 1000, so one tree maxes
 * at `5 × 15 × 180 + 4 × 1000 = 17500`, the species' ceiling at 神性 30, and
 * the curve climbs 360 a step from `1540 = 1000 + 3 × 180`. The score is
 * therefore `Σ mark × level` over the levelled nodes plus `Σ mark` over the
 * activated ones, for the active tree only — the ceiling is one tree's worth.
 * See `tools/apps/gmzz/talents.py`.
 */

export type TalentNodeKind = 'normal' | 'special'

export type TalentNode = {
  key: number
  name: string
  mark: number
  /** 15 for a levelled node; 0 for an activate-only one. */
  maxLevel: number
  type: TalentNodeKind
  parentKey: number | null
  position: number
  description: string
}

export type TalentTree = {
  id: number
  name: string
  tag: string
  description: string
  professionId: number
  /** The tree a fresh character of this pathway starts in. */
  default: boolean
  /** Talent points available at each sequence stage; the last is the cap on levels. */
  pointCapsBySequenceStage: number[]
  maxScore: number
  nodes: TalentNode[]
}

export type Talents = { trees: TalentTree[] }

export async function loadTalents(): Promise<Talents> {
  const response = await fetch(dataUrl('score/talents.json'))
  if (!response.ok) throw new Error(`Unable to load talent trees (${response.status})`)
  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as Talents).trees)) {
    throw new Error('Invalid talent data')
  }
  return payload as Talents
}

/** The player's tree and what they put into it: node key → level (1 for an activated special node). */
export type TalentDraft = {
  treeId: number | null
  levels: Record<string, number>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isTalentDraft(value: unknown): value is TalentDraft {
  return (
    isRecord(value) &&
    (value.treeId === null || (typeof value.treeId === 'number' && Number.isFinite(value.treeId))) &&
    isRecord(value.levels) &&
    Object.values(value.levels).every((level) => typeof level === 'number' && Number.isFinite(level))
  )
}

export function emptyTalentDraft(): TalentDraft {
  return { treeId: null, levels: {} }
}

export function treesFor(talents: Talents, professionId: number | null): TalentTree[] {
  return talents.trees.filter((tree) => tree.professionId === professionId).sort((a, b) => a.id - b.id)
}

/**
 * The tree the draft points at, if it belongs to the pathway; otherwise the
 * pathway's default tree, then its first. A stored tree from another pathway
 * is not honoured — the pathway is the page's choice, the tree follows it.
 */
export function treeFor(talents: Talents, professionId: number | null, treeId: number | null): TalentTree | null {
  const trees = treesFor(talents, professionId)
  return trees.find((tree) => tree.id === treeId) ?? trees.find((tree) => tree.default) ?? trees[0] ?? null
}

/** The level cap on a node: its `maxLevel`, or 1 for an activate-only node. */
export function nodeCap(node: TalentNode): number {
  return node.type === 'special' ? 1 : node.maxLevel
}

export function clampLevel(node: TalentNode, level: number): number {
  if (!Number.isFinite(level)) return 0
  return Math.min(nodeCap(node), Math.max(0, Math.trunc(level)))
}

/** The most levelled-node points a tree takes in total: its last stage cap, else the sum of its nodes. */
export function pointCap(tree: TalentTree): number {
  const caps = tree.pointCapsBySequenceStage
  const fromCaps = caps[caps.length - 1]
  return typeof fromCaps === 'number' && fromCaps > 0
    ? fromCaps
    : tree.nodes.reduce((total, node) => total + (node.type === 'normal' ? node.maxLevel : 0), 0)
}

export type TalentNodeResult = {
  node: TalentNode
  level: number
  /** `mark × level`; for a special node, `mark` when activated. */
  score: number
}

export type TalentResult = {
  tree: TalentTree | null
  nodes: TalentNodeResult[]
  /** Levels spent on levelled nodes. */
  pointsSpent: number
  pointCap: number
  activated: number
  total: number
}

/**
 * Every node of the tree scored from the draft.
 *
 * Levels are clamped to each node's cap, and the levelled nodes' total is
 * clamped to the tree's point cap in node order — a draft that over-spends
 * (stored under a higher cap, or hand-edited) loses its last levels rather
 * than scoring points the game cannot grant.
 */
export function evaluateTalents(tree: TalentTree | null, levels: Record<string, number>): TalentResult {
  if (!tree) return { tree: null, nodes: [], pointsSpent: 0, pointCap: 0, activated: 0, total: 0 }
  const cap = pointCap(tree)
  let spent = 0
  let activated = 0
  const nodes: TalentNodeResult[] = []
  for (const node of tree.nodes) {
    let level = clampLevel(node, levels[String(node.key)] ?? 0)
    if (node.type === 'normal') {
      level = Math.min(level, Math.max(0, cap - spent))
      spent += level
    } else if (level > 0) {
      activated += 1
    }
    nodes.push({ node, level, score: node.mark * level })
  }
  return {
    tree,
    nodes,
    pointsSpent: spent,
    pointCap: cap,
    activated,
    total: nodes.reduce((total, entry) => total + entry.score, 0),
  }
}
