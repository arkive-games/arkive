import { describe, expect, it } from 'vitest'
import type { EngineMarker } from '@gamemap/map-engine'
import { buildPatrolRouteLines } from './patrolRoutes'

function marker(id: string, subtype: string, route: EngineMarker['route']): EngineMarker {
  return {
    id,
    subtype,
    x: 0,
    y: 0,
    route,
    images: [],
    contributors: [],
    indexInSubtype: 0,
    localizedName: id,
    subtypeLabel: subtype,
  }
}

describe('buildPatrolRouteLines', () => {
  const alpha = marker('alpha', 'boss-roaming', [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ])
  const beta = marker('beta', 'boss-roaming', [
    { x: 20, y: 20 },
    { x: 30, y: 20 },
  ])

  it('shows only the hovered route', () => {
    const lines = buildPatrolRouteLines(
      [alpha, beta],
      new Set(['boss-roaming']),
      'alpha',
    )

    expect(lines.map((line) => [line.id, line.variant, line.color])).toEqual([
      ['alpha-route-1', 'highlight', '#E5484D'],
      ['alpha-route-3', 'highlight', '#E5484D'],
    ])
  })

  it('hides every route when hover ends', () => {
    const lines = buildPatrolRouteLines(
      [alpha, beta],
      new Set(['boss-roaming']),
      null,
    )

    expect(lines).toEqual([])
  })

  it('does not leak a stale hovered route through a hidden subtype', () => {
    const lines = buildPatrolRouteLines([alpha, beta], new Set(), 'alpha')

    expect(lines).toEqual([])
  })
})
