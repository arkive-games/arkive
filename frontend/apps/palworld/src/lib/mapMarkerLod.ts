/**
 * Assign a presentation-only LOD tier from a subtype's marker density.
 * Sparse types remain useful in the world overview, while dense resource and
 * collectible sets wait for progressively closer zoom levels.
 *
 * `isOverviewPriority` floors the result at tier 1. Density alone is the wrong
 * signal for a layer curated for the overview: MainWorld's
 * `fastTravel` has 137 markers, which put the whole fast-travel network in tier 2
 * and therefore hid it at the opening zoom. Boss categories also belong together
 * at that zoom even when one subtype happens to contain more than 50 markers.
 */
export function mapMarkerLodTier(
  subtypeCount: number,
  isOverviewPriority = false,
): 1 | 2 | 3 {
  if (isOverviewPriority) return 1
  if (subtypeCount <= 50) return 1
  if (subtypeCount <= 250) return 2
  return 3
}
