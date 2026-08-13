import type { EngineMarker, GameMapViewProps } from '@gamemap/map-engine-gl'

type OverlayLines = NonNullable<GameMapViewProps['overlayLines']>
const PATROL_ROUTE_COLOR = '#E5484D'

/** Build the patrol corridor for the one roaming boss currently under the pointer. */
export function buildPatrolRouteLines(
  markers: EngineMarker[],
  visibleSubtypes: Set<string>,
  highlightedMarkerId: string | null,
): OverlayLines {
  if (!highlightedMarkerId) return []
  const marker = markers.find((candidate) => candidate.id === highlightedMarkerId)
  if (!marker?.route || marker.route.length < 2) return []
  if (!visibleSubtypes.has(marker.subtype)) return []

  const highlighted: OverlayLines = []
  for (let index = 1; index < marker.route.length; index += 1) {
    const from = marker.route[index - 1]
    const to = marker.route[index]
    if (from.x === to.x && from.y === to.y) continue
    highlighted.push({
      id: `${marker.id}-route-${index}`,
      from,
      to,
      variant: 'highlight',
      color: PATROL_ROUTE_COLOR,
    })
  }

  return highlighted
}
