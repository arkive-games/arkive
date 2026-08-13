// Dynamic clustering for embedded mini-maps (PalSpawnMap, RegionDetailPage):
// dense point sets cluster into count-badged pins when zoomed out and split
// apart as you zoom in. Clusters are square grid buckets in map-image px; a
// cell renders at `cell * 2^zoom` screen px, so each tier's cell keeps cluster
// pins ≥ ~44px apart (one pin width) at the tier's minimum zoom. `cell: 0` =
// no clustering, every exact point shows.
//
// The tiers are pure math and the embed reports its zoom through
// `GameMapEmbed`'s `onZoom`, so nothing here needs a map instance: feed
// `tierFor(zoom)` into the owning component's state and re-cluster from it. The
// value only changes at a tier boundary, so a continuous smooth-wheel glide
// re-renders the markers at most once per crossing.
export const CLUSTER_TIERS = [
  { minZoom: -Infinity, cell: 704 },
  { minZoom: -3, cell: 352 },
  { minZoom: -2, cell: 176 },
  { minZoom: -1, cell: 88 },
  { minZoom: 0, cell: 0 },
]

export function tierFor(zoom: number): number {
  let tier = 0
  for (let i = 1; i < CLUSTER_TIERS.length; i++) if (zoom >= CLUSTER_TIERS[i].minZoom) tier = i
  return tier
}

/**
 * Grid-bucket key for a point.
 *
 * The coordinates MUST be map-image pixels, not DATA space — the cell sizes above
 * are pixel distances chosen against a pin's on-screen width, while palworld's
 * DATA space is world centimetres, where a 704 "cell" would bucket half the map
 * into one blob. Callers project with `dataToPoint` first and convert a cluster's
 * centroid back with `pointToData`.
 */
export function cellKey(px: number, py: number, cell: number): string {
  return `${Math.floor(px / cell)}:${Math.floor(py / cell)}`
}
