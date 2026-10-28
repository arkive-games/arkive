import { describe, expect, it } from 'vitest'
import { classRow, cumulativeCosts, gateBranches, nodeLevelRows, seasonPath, treeLabel } from './talentCatalog'
import type { TalentLevelRecord, TalentNodeRecord } from './wikiData'

const node = (iId: number, iType: number, extra: Partial<TalentNodeRecord> = {}): TalentNodeRecord => ({
  iId,
  iType,
  iTalentTreeID: 1,
  ...extra,
})

describe('talent catalog', () => {
  it('labels trees with a middle dot', () => {
    expect(treeLabel('Ⅱ+-1')).toBe('Ⅱ+·1')
    expect(treeLabel('Ⅲ')).toBe('Ⅲ')
  })

  it('caps level rows at the node maximum, lowest level first', () => {
    const levels = new Map<number, TalentLevelRecord>([
      [1, { iId: 1, iLevel: 2 }],
      [2, { iId: 2, iLevel: 1 }],
      [3, { iId: 3, iLevel: 3 }],
    ])
    expect(nodeLevelRows(node(9, 1, { iMaxLevel: 2, levels: [1, 2, 3] }), levels).map((row) => row.iId)).toEqual([2, 1])
  })

  it('sums per-level costs up to the chosen level', () => {
    const rows: TalentLevelRecord[] = [
      { iId: 1, kCosts: [[1250900, 10], [2, 100]] },
      { iId: 2, kCosts: [[1250900, 10], [2, 150]] },
      { iId: 3, kCosts: [[1250900, 20]] },
    ]
    expect(cumulativeCosts(rows, 1)).toEqual([[1250900, 20], [2, 250]])
    expect(cumulativeCosts(rows, 2)).toEqual([[1250900, 40], [2, 250]])
  })

  it('finds a job talent row by the class top-rank job id', () => {
    const levels = new Map<number, TalentLevelRecord>([
      [1, { iId: 1, iJobId: [5400, 5300, 5200] }],
      [2, { iId: 2, iJobId: [1400, 1300, 1200] }],
    ])
    const head = node(10, 6, { levels: [1, 2] })
    expect(classRow(head, levels, 1400)?.iId).toBe(2)
    expect(classRow(head, levels, 2400)).toBeUndefined()
  })

  it('walks the season path from its start and snakes it along four rows', () => {
    const chain = [3, 1, 2, 4, 5, 6, 7, 8, 9].map((id) => node(id, 1, {
      iIsStartPoint: id === 1 ? 1 : undefined,
      kAfterids: id < 9 ? [id + 1] : [],
    }))
    const cells = seasonPath(chain).map(({ node: entry, column, row }) => `${entry.iId}:${column}${row}`)
    // Nine nodes over four rows take three columns; odd rows run back.
    expect(cells).toEqual(['1:00', '2:10', '3:20', '4:21', '5:11', '6:01', '7:02', '8:12', '9:22'])
  })

  it('opens a gate into released branch heads and their children', () => {
    const nodes = [
      node(1, 5, { kAfterids: [2, 3, 4] }),
      node(2, 1, { levels: [1] }),
      node(3, 6, { levels: [1], kAfterids: [5, 6] }),
      node(4, 6, { kAfterids: [] }),
      node(5, 7, { levels: [1] }),
      node(6, 7),
    ]
    const byId = new Map(nodes.map((entry) => [entry.iId, entry]))
    const branches = gateBranches(byId.get(1)!, byId)
    expect(branches.map((branch) => branch.head.iId)).toEqual([3])
    expect(branches[0].children.map((child) => child.iId)).toEqual([5])
  })
})
