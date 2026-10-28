import type { TalentLevelRecord, TalentNodeRecord } from './wikiData'

/** Node kinds in the season tree, by iType. */
export const GATE_TYPE = 5
export const BRANCH_HEAD_TYPE = 6
export const BRANCH_CHILD_TYPE = 7

/**
 * The classes job talents are written for. A row's iJobId lists one job id per
 * advancement (1400/1300/1200 for the knight line), so the class is matched by
 * the id of its top rank. Swordsmen split into knight and crusader here.
 */
export const TALENT_CLASSES = [
  { stageId: 'knight', jobId: 1400 },
  { stageId: 'crusader', jobId: 1410 },
  { stageId: 'wizard', jobId: 2400 },
  { stageId: 'hunter', jobId: 3400 },
  { stageId: 'priest', jobId: 4400 },
  { stageId: 'assassin', jobId: 5400 },
  { stageId: 'blacksmith', jobId: 6400 },
] as const

export type TalentClass = (typeof TALENT_CLASSES)[number]

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
