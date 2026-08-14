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
  panY: number
  arrowX: number
}

function overlapsObstacle(
  left: number,
  top: number,
  size: MarkerDetailPlacementInput["size"],
  obstacle: MarkerDetailRect,
  padding: number,
): boolean {
  const right = left + size.width
  const bottom = top + size.height
  return Math.min(right, obstacle.right + padding) > Math.max(left, obstacle.left - padding)
    && Math.min(bottom, obstacle.bottom + padding) > Math.max(top, obstacle.top - padding)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

export function placeMarkerDetailAbove({
  anchor,
  size,
  boundary,
  obstacles = [],
  gap = 24,
  padding = 12,
}: MarkerDetailPlacementInput): MarkerDetailPlacementResult {
  const desiredLeft = anchor.x - size.width / 2
  const desiredTop = anchor.y - gap - size.height
  const safeLeft = boundary.left + padding
  const safeRight = boundary.right - padding
  const safeTop = boundary.top + padding
  const safeBottom = boundary.bottom - padding
  const maximumLeft = Math.max(safeLeft, safeRight - size.width)
  const maximumTop = Math.max(safeTop, safeBottom - size.height)
  const candidateLefts = [clamp(desiredLeft, safeLeft, maximumLeft)]
  const candidateTops = [clamp(desiredTop, safeTop, maximumTop)]

  for (const obstacle of obstacles) {
    candidateLefts.push(clamp(obstacle.left - padding - size.width, safeLeft, maximumLeft))
    candidateLefts.push(clamp(obstacle.right + padding, safeLeft, maximumLeft))
    candidateTops.push(clamp(obstacle.top - padding - size.height, safeTop, maximumTop))
    candidateTops.push(clamp(obstacle.bottom + padding, safeTop, maximumTop))
  }

  const candidates = candidateLefts.flatMap((left) => candidateTops.map((top) => ({ left, top })))
  const validCandidates = candidates.filter(({ left, top }) => obstacles.every(
    (obstacle) => !overlapsObstacle(left, top, size, obstacle, padding),
  ))
  const { left, top } = (validCandidates.length ? validCandidates : candidates)
    .reduce((best, candidate) => {
      const distance = (candidate.left - desiredLeft) ** 2 + (candidate.top - desiredTop) ** 2
      const bestDistance = (best.left - desiredLeft) ** 2 + (best.top - desiredTop) ** 2
      return distance < bestDistance ? candidate : best
    })
  const panX = desiredLeft - left
  const panY = desiredTop - top

  return { x: -size.width / 2, y: -size.height - gap, panX, panY, arrowX: size.width / 2 }
}
