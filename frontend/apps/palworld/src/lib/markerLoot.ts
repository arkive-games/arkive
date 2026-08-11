import type { ItemSource } from './catalog'

export const MARKER_LOOT_KIND = {
  chest: 'chest',
  fishing: 'fishing',
  supply: 'supply',
  camp: 'camp',
  oilrigTreasure: 'oilrig',
} as const satisfies Record<string, ItemSource['kind']>

export type MarkerLootKind = (typeof MARKER_LOOT_KIND)[keyof typeof MARKER_LOOT_KIND]

export function markerLootKind(subtype: string): MarkerLootKind | undefined {
  if (!Object.hasOwn(MARKER_LOOT_KIND, subtype)) return undefined
  return MARKER_LOOT_KIND[subtype as keyof typeof MARKER_LOOT_KIND]
}
