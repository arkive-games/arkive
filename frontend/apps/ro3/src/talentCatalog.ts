import type { TalentLevelRecord, TalentNodeRecord } from './wikiData'

/** Node kinds in the season tree, by iType. */
export const GATE_TYPE = 5
export const BRANCH_HEAD_TYPE = 6
export const BRANCH_CHILD_TYPE = 7

export interface TalentClass {
  stageId: string
  jobId: number
}

/**
 * The classes job talents are written for, under the same six lines as the
 * skill board. A row's iJobId lists one job id per advancement (1400/1300/1200
 * for the knight), so a class is matched by the id of its top rank. Only the
 * swordsman line splits, into knight and crusader.
 */
export const TALENT_LINES: ReadonlyArray<{ lineId: string; classes: readonly TalentClass[] }> = [
  { lineId: 'swordman', classes: [{ stageId: 'knight', jobId: 1400 }, { stageId: 'crusader', jobId: 1410 }] },
  { lineId: 'magician', classes: [{ stageId: 'wizard', jobId: 2400 }] },
  { lineId: 'archer', classes: [{ stageId: 'hunter', jobId: 3400 }] },
  { lineId: 'acolyte', classes: [{ stageId: 'priest', jobId: 4400 }] },
  { lineId: 'thief', classes: [{ stageId: 'assassin', jobId: 5400 }] },
  { lineId: 'merchant', classes: [{ stageId: 'blacksmith', jobId: 6400 }] },
]

/** The most nodes a season row holds, the same on every tree. */
export const BOARD_COLUMNS = 6

/**
 * The season tree is one path from its start node. It is walked in order and
 * laid out `columns` to a row, left to right along one row and back along the
 * next, so every link joins neighbouring cells.
 */
export function seasonPath<T extends { iId: number; iIsStartPoint?: number; kAfterids?: number[]; kPosition?: number[] }>(nodes: T[], columns: number): Array<{ node: T; column: number; row: number }> {
  const byId = new Map(nodes.map((node) => [node.iId, node]))
  const ordered: T[] = []
  const seen = new Set<number>()
  let next = nodes.find((node) => node.iIsStartPoint) ?? nodes[0]
  while (next && !seen.has(next.iId)) {
    seen.add(next.iId)
    ordered.push(next)
    next = (next.kAfterids ?? []).map((id) => byId.get(id)).find((node): node is T => !!node && !seen.has(node.iId))!
  }
  // Anything off the path still shows, in the game's left-to-right order.
  ordered.push(...nodes.filter((node) => !seen.has(node.iId)).sort((a, b) => (a.kPosition?.[0] ?? 0) - (b.kPosition?.[0] ?? 0)))
  return ordered.map((node, index) => {
    const row = Math.floor(index / columns)
    const step = index % columns
    return { node, column: row % 2 === 0 ? step : columns - 1 - step, row }
  })
}

/** `Ⅱ+-1` reads better as `Ⅱ+·1`. */
export function treeLabel(name: string): string {
  return name.replace('-', '·')
}

/**
 * The level rows a stat node steps through, lowest first. Some nodes carry
 * more rows than their cap allows; the extra ones are never reachable.
 */
export function nodeLevelRows(node: TalentNodeRecord, levelById: Map<number, TalentLevelRecord>): TalentLevelRecord[] {
  const rows = (node.levels ?? []).flatMap((id) => levelById.get(id) ?? [])
    .sort((a, b) => (a.iLevel ?? 1) - (b.iLevel ?? 1))
  return node.iMaxLevel ? rows.slice(0, node.iMaxLevel) : rows
}

/** A job talent's row for one class, if the game has written one. */
export function classRow(
  node: TalentNodeRecord,
  levelById: Map<number, TalentLevelRecord>,
  jobId: number,
): TalentLevelRecord | undefined {
  return (node.levels ?? []).map((id) => levelById.get(id)).find((row) => row?.iJobId?.includes(jobId))
}

/** kCosts are per level, so the total to reach a level sums every row up to it. */
export function cumulativeCosts(rows: TalentLevelRecord[], index: number): Array<[number, number]> {
  const totals = new Map<number, number>()
  for (const row of rows.slice(0, index + 1)) {
    for (const [id, value] of row.kCosts ?? []) totals.set(id, (totals.get(id) ?? 0) + value)
  }
  return [...totals]
}

export interface TalentBranch {
  head: TalentNodeRecord
  children: TalentNodeRecord[]
}

/**
 * A gate opens three job branches: each head (type 6) leads to three children
 * (type 7). Nodes with no rows at all are unreleased and left out.
 */
export function gateBranches(gate: TalentNodeRecord, nodeById: Map<number, TalentNodeRecord>): TalentBranch[] {
  const released = (id: number, type: number) => {
    const node = nodeById.get(id)
    return node && node.iType === type && node.levels?.length ? [node] : []
  }
  return (gate.kAfterids ?? []).flatMap((id) => released(id, BRANCH_HEAD_TYPE)).map((head) => ({
    head,
    children: (head.kAfterids ?? []).flatMap((id) => released(id, BRANCH_CHILD_TYPE)),
  }))
}
