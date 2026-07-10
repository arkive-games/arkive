import { BUILDING_TYPE_LABELS, ITEM_TYPE_LABELS } from '../../catalogStrings'
import type { TypeLabels } from '../../lib/catalog'

// The extractor already strips the `EPal…::` enum prefix, but guard anyway so a
// raw enum never leaks to the UI.
const strip = (s: string): string => s.replace(/^E[A-Za-z]+::/, '')

// Prefer the game's own localized label (from labels.json), then the hardcoded
// English fallback, then the raw typeA key.
export const itemTypeLabel = (typeA: string, labels?: TypeLabels): string => {
  const k = strip(typeA)
  return labels?.[k] ?? ITEM_TYPE_LABELS[k] ?? k
}
export const buildingTypeLabel = (typeA: string, labels?: TypeLabels): string => {
  const k = strip(typeA)
  return labels?.[k] ?? BUILDING_TYPE_LABELS[k] ?? k
}

/** Position of a typeA in the game's category order. labels.json is emitted in
 *  the raw text-table row order (same in every language), so its key order is
 *  the canonical one; types missing from it sort after all known ones. */
export const typeOrder = (typeA: string, labels?: TypeLabels): number => {
  const keys = labels ? Object.keys(labels) : []
  const i = keys.indexOf(strip(typeA))
  return i < 0 ? keys.length : i
}
