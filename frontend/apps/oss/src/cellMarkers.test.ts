import { expect, it } from 'vitest'
import { indexCellMarkers } from './cellMarkers'

it('keeps an occupied cell at its original coordinates without losing its visible peers', () => {
  const points = ['entrance', 'spawner', 'rock'].map(id => ({ id, subtype: id, x: -10, y: 30 }))
  const visible = new Set(['entrance', 'rock'])
  const cells = indexCellMarkers(points, visible, new Set(), null)
  expect(cells.representatives).toEqual([points[0]])
  expect(cells.peers.get('entrance')).toEqual([points[0], points[2]])
  expect(indexCellMarkers(points, visible, new Set(['spawner']), null).representatives).toEqual([points[1]])
  expect(indexCellMarkers(points, visible, new Set(['spawner']), 'rock').representatives).toEqual([points[2]])
})
