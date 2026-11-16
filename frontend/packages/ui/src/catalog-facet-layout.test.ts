import { expect, it } from 'vitest'
import { balanceFacetRows } from './catalog-facet-layout'

it('keeps a small set on one content-sized row', () => {
  expect(balanceFacetRows([60, 90], 200, 8)).toEqual([[0, 1]])
})

it('moves from two to three rows when content exceeds the width budget', () => {
  expect(balanceFacetRows(Array(6).fill(90), 290, 8)).toEqual([[0, 1, 2], [3, 4, 5]])
  expect(balanceFacetRows(Array(6).fill(90), 280, 8)).toEqual([[0, 1], [2, 3], [4, 5]])
})

it('balances ordered rows instead of leaving one option stranded', () => {
  expect(balanceFacetRows(Array(6).fill(60), 340, 8)).toEqual([[0, 1, 2], [3, 4, 5]])
  expect(balanceFacetRows([100, 70, 80, 40, 80], 240, 8)).toEqual([[0, 1], [2, 3, 4]])
})

it('handles long localized labels and narrow viewports without reordering', () => {
  const widths = [50, 400, 90, 75]
  const rows = balanceFacetRows(widths, 180, 8)
  expect(rows.flat()).toEqual([0, 1, 2, 3])
  for (const row of rows) {
    expect(row.reduce((sum, index) => sum + Math.min(widths[index], 180), 0) + (row.length - 1) * 8).toBeLessThanOrEqual(180)
  }
  expect(balanceFacetRows([], 180, 8)).toEqual([])
})
