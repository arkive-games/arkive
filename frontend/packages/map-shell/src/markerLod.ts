/**
 * Whether level-of-detail culling is safe to enable for a marker set.
 *
 * Both engines drop a marker with no `tier` while LOD is on
 * (`GameMapView`: `if (m.tier == null) continue`, `markerLayer`: the same test),
 * and only tier 1 is visible at the default mount zoom of -3. A set that assigns
 * no tiers -- or a map whose markers all sit in tier 2 and above -- therefore
 * renders a completely empty map the moment LOD is switched on.
 *
 * Gating on the data rather than on a per-app flag means a dataset switches
 * itself on as soon as its pipeline starts emitting tiers, with no code change
 * and no chance of a blank map in between.
 */
export function canUseLodTiers(markers: readonly { tier?: number | null }[]): boolean {
  return markers.some((marker) => marker.tier === 1)
}
