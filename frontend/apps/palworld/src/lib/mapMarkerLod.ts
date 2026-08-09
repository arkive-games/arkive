/**
 * Assign a presentation-only LOD tier from a subtype's marker density.
 * Sparse types remain useful in the world overview, while dense resource and
 * collectible sets wait for progressively closer zoom levels.
 */
export function mapMarkerLodTier(subtypeCount: number): 1 | 2 | 3 {
  if (subtypeCount <= 50) return 1
  if (subtypeCount <= 250) return 2
  return 3
}
