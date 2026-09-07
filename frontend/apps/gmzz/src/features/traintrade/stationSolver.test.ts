import { describe, expect, it } from 'vitest'
import {
  createRouteModel,
  getAvailableHints,
  probabilityFor,
  prospectiveRouteCount,
  windowDistribution,
  type StationTotals,
} from './stationSolver'

describe('train-trade station solver', () => {
  it('counts routes without materialising every permutation', () => {
    const totals: StationTotals = { winery: 5, food: 5, trade: 6 }
    const model = createRouteModel(totals, 16, '', [])

    expect(model.count).toBe(2_018_016)
    expect(probabilityFor(model, 0)).toEqual({ winery: 5 / 16, food: 5 / 16, trade: 6 / 16 })
  })

  it('applies a three-station hint and a confirmed station together', () => {
    const totals: StationTotals = { winery: 2, food: 2, trade: 2 }
    const model = createRouteModel(totals, 6, 'equal', [])

    expect(model.count).toBe(36)
    expect(prospectiveRouteCount(model, 0, 'winery', 1, 'food-most')).toBe(4)
    expect(getAvailableHints(model, 1, 0, 'winery')).toEqual(new Set(['food-most', 'trade-most', 'equal']))
    expect(windowDistribution(model, 0).reduce((sum, [, count]) => sum + count, 0)).toBe(model.count)
  })

  it('rejects invalid station quotas and conflicting refinements', () => {
    expect(createRouteModel({ winery: 1, food: 1, trade: 1 }, 4, '', []).count).toBe(0)
    const model = createRouteModel({ winery: 2, food: 2, trade: 2 }, 6, 'equal', [])
    expect(prospectiveRouteCount(model, 0, 'winery', 1, 'winery-most')).toBe(0)
  })
})
