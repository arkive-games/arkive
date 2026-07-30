import type { RegionInstance } from '@gamemap/data-contract'

/**
 * Ray-casting point-in-polygon. Both the point and the ring are in MAP-PIXEL
 * space — region borders ship as pixel polygons, so a marker or cursor in world
 * coordinates must be projected with `worldToPixel` before it gets here.
 */
export function pointInPolygon(x: number, y: number, poly: number[][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function ringArea(ring: number[][]): number {
  let s = 0
  for (let i = 0; i < ring.length - 1; i++) {
    s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  return Math.abs(s) / 2
}

/**
 * Regions ordered by total area ascending. V Rising's POI outlines and territory
 * outlines overlap heavily (a territory can contain several POIs), so a point
 * lookup must return the SMALLEST containing region to be useful. Sorting once
 * makes the lookup a first-hit scan.
 */
export function sortRegionsByArea(regions: RegionInstance[]): RegionInstance[] {
  return [...regions]
    .map((r) => ({ r, a: r.borders.reduce((sum, ring) => sum + ringArea(ring), 0) }))
    .sort((x, y) => x.a - y.a)
    .map((x) => x.r)
}

/** The smallest region containing the map-pixel point, if any. */
export function regionAt(
  sorted: RegionInstance[],
  x: number,
  y: number,
): RegionInstance | undefined {
  for (const r of sorted) {
    if (r.borders.some((ring) => pointInPolygon(x, y, ring))) return r
  }
  return undefined
}
