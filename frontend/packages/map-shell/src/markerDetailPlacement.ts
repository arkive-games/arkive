export type MarkerDetailRect = {
  left: number
  top: number
  right: number
  bottom: number
}

export type MarkerDetailPlacementInput = {
  anchor: { x: number; y: number }
  size: { width: number; height: number }
  boundary: MarkerDetailRect
  obstacles?: MarkerDetailRect[]
  gap?: number
  padding?: number
}

export type MarkerDetailPlacementResult = {
  x: number
  y: number
  panX: number
  arrowY: number
}

function overlapsHorizontally(left: number, right: number, obstacle: MarkerDetailRect): boolean {
  return Math.min(right, obstacle.right) > Math.max(left, obstacle.left)
}

export function placeMarkerDetailRight({
  anchor,
  size,
  boundary,
  obstacles = [],
  gap = 30,
  padding = 12,
}: MarkerDetailPlacementInput): MarkerDetailPlacementResult {
  const left = anchor.x + gap
  const right = left + size.width
  const safeTop = boundary.top + padding
  const safeBottom = boundary.bottom - padding
  let top = anchor.y - size.height / 2

  for (const obstacle of obstacles) {
    if (!overlapsHorizontally(left, right, obstacle)) continue
    const bottom = top + size.height
    if (Math.min(bottom, obstacle.bottom) <= Math.max(top, obstacle.top)) continue
    top = obstacle.bottom <= anchor.y
      ? obstacle.bottom + padding
      : obstacle.top - padding - size.height
  }

  top = Math.min(Math.max(top, safeTop), Math.max(safeTop, safeBottom - size.height))
  const panX = Math.max(0, right - (boundary.right - padding))
  const arrowY = Math.min(Math.max(anchor.y - top, 20), Math.max(20, size.height - 20))

  return { x: gap, y: top - anchor.y, panX, arrowY }
}
