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

/**
 * What the current progression allows, read off the 非凡天赋 max curve.
 *
 * Every point of that curve is `180 × points + 1000 × cores`: the talent
 * points granted so far, at Mark 180 each, and the core talents unlocked, at
 * 1000 each. Since 1000 ≡ 100 (mod 180), the remainders for 0–4 cores (0, 100,
 * 20, 120, 40) are all distinct, so each curve value splits exactly one way:
 * divinity 19 reads 10200 = 3 cores + 40 points, divinity 20 reads 11920 =
 * 4 cores + 44 points.
 *
 * A core sits under every node but the first, so `cores + 1` nodes are open.
 * Each node takes 10 levels until the last one opens (divinity 20), and its
 * full `maxLevel` after — 4 nodes × 10 is exactly the 40 points of divinity
 * 19, and 5 × 15 the 75 of divinity 30.
 */
export type TalentLimits = { points: number; nodes: number; levelCap: number }

/** The capped level a node takes before the last node opens. */
export const EARLY_LEVEL_CAP = 10

export function talentLimits(tree: TalentTree, maxBenchmark: number): TalentLimits | null {
  const normal = normalNodes(tree)
  const normalMark = normal[0]?.mark ?? 0
  const coreMark = specialNodes(tree)[0]?.mark ?? 0
  if (normalMark <= 0 || maxBenchmark <= 0) return null
  for (let cores = 0; cores < normal.length; cores++) {
    const rest = maxBenchmark - cores * coreMark
    if (rest < 0 || rest % normalMark !== 0) continue
    const nodes = Math.min(normal.length, cores + 1)
    const full = nodes === normal.length
    return { points: rest / normalMark, nodes, levelCap: full ? Math.max(...normal.map((n) => n.maxLevel)) : EARLY_LEVEL_CAP }
  }
  return null
}

/** The levelled nodes in tree order. */
export function normalNodes(tree: TalentTree): TalentNode[] {
  return tree.nodes.filter((node) => node.type === 'normal').sort((a, b) => a.position - b.position)
}

/** The core (activate-only) nodes, in the order of the node each hangs under. */
export function specialNodes(tree: TalentTree): TalentNode[] {
  const order = new Map(normalNodes(tree).map((node, index) => [node.key, index]))
  return tree.nodes.filter((node) => node.type === 'special')
    .sort((a, b) => (order.get(a.parentKey ?? -1) ?? 99) - (order.get(b.parentKey ?? -1) ?? 99))
}

export type TalentNodeResult = {
  node: TalentNode
  level: number
  /** `mark × level`; for a core node, `mark` when activated. */
  score: number
  /** Not open at this progression, or its previous node is still at 0. */
  locked: boolean
  /** The most this node can take now. */
  cap: number
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
 * Every node of the tree scored from the draft, under the game's rules:
 *
 * - only the first `limits.nodes` levelled nodes are open, each up to
 *   `limits.levelCap`;
 * - a node can be learnt only once the one before it has a level;
 * - a core talent switches on by itself when the node it hangs under has a
 *   level, so the draft carries no choice for it;
 * - the levelled nodes share `limits.points`, spent in node order, so a draft
 *   that over-spends (stored under a higher cap) loses its last levels.
 *
 * Without limits the tree's own caps apply, as before progression was read.
 */
export function evaluateTalents(tree: TalentTree | null, levels: Record<string, number>, limits?: TalentLimits | null): TalentResult {
  if (!tree) return { tree: null, nodes: [], pointsSpent: 0, pointCap: 0, activated: 0, total: 0 }
  const normal = normalNodes(tree)
  const cap = limits ? limits.points : pointCap(tree)
  const open = limits ? limits.nodes : normal.length
  const byKey = new Map<number, TalentNodeResult>()
  let spent = 0
  let previous = 1
  normal.forEach((node, index) => {
    const nodeCapNow = limits ? Math.min(node.maxLevel, limits.levelCap) : node.maxLevel
    const locked = index >= open || previous <= 0
    let level = locked ? 0 : Math.min(nodeCapNow, Math.max(0, Math.trunc(levels[String(node.key)] ?? 0)))
    if (!Number.isFinite(level)) level = 0
    level = Math.min(level, Math.max(0, cap - spent))
    spent += level
    previous = level
    byKey.set(node.key, { node, level, score: node.mark * level, locked, cap: locked ? 0 : nodeCapNow })
  })
  let activated = 0
  for (const node of specialNodes(tree)) {
    const parent = node.parentKey == null ? undefined : byKey.get(node.parentKey)
    const on = parent !== undefined && parent.level > 0
    if (on) activated += 1
    byKey.set(node.key, { node, level: on ? 1 : 0, score: on ? node.mark : 0, locked: !on, cap: 1 })
  }
  const nodes = tree.nodes.map((node) => byKey.get(node.key) ?? { node, level: 0, score: 0, locked: true, cap: 0 })
  return { tree, nodes, pointsSpent: spent, pointCap: cap, activated, total: nodes.reduce((total, entry) => total + entry.score, 0) }
}

/**
 * The one-click allocation: one level in every open node first, so each opens
 * the next and switches its core on, then the rest from the LAST node back.
 * Every level scores the same, but the later nodes carry the better stats.
 */
export function autoAllocate(tree: TalentTree, limits: TalentLimits | null): Record<string, number> {
  const normal = normalNodes(tree)
  const open = normal.slice(0, limits ? limits.nodes : normal.length)
  let left = limits ? limits.points : pointCap(tree)
  const out: Record<string, number> = Object.fromEntries(normal.map((node) => [String(node.key), 0]))
  for (const node of open) {
    if (left <= 0) break
    out[String(node.key)] = 1
    left -= 1
  }
  for (const node of [...open].reverse()) {
    const room = (limits ? Math.min(node.maxLevel, limits.levelCap) : node.maxLevel) - out[String(node.key)]
    const add = Math.min(room, left)
    out[String(node.key)] += add
    left -= add
  }
  return out
}
