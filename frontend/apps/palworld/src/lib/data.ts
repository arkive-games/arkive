import type { GameMapMeta, MarkerPinVariant, MarkerTypeSubtype, RegionInstance } from '@gamemap/data-contract'
import { dataUrl } from './urls'

const j = async <T>(url: string): Promise<T> => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return r.json() as Promise<T>
}

// Re-export so App.tsx can use GameMapMeta directly without importing data-contract
export type { GameMapMeta as MapMeta }

export interface Taxonomy {
  categories: { id: string }[]
  // MarkerTypeSubtype requires name; we supply it from the locale at load time
  subtypes: MarkerTypeSubtype[]
}
export interface MarkerRow {
  zukanIndex?: number
  zukanIndexSuffix?: string
  id: string; subtype: string; category?: string; x: number; y: number; z?: number
  icon?: string; indexInSubtype: number
  /** Named region containing this marker (regions/<map>.json id); absent when
   *  the marker sits outside every region volume. */
  region?: string
  /** Game illustration stem (notes) → resource `notes/<image>.webp`. */
  image?: string
  /** Spawn points merged into this cluster marker (absent/1 = not a cluster). */
  count?: number
  /** Night-restricted spawn (every merged point has spawner OnlyTime=Night). */
  nightOnly?: boolean
  /** Ancient Shrine reward: gear schematic (item id + count) + Dog Coins. */
  reward?: { item: string; count: number; dogCoin?: number }
  /** Linked catchable pal (fieldBoss/predator) — backs the popup drop badges. */
  pal?: string
  /** Kill drops carried directly (wanted criminals — no pal to look up). */
  drops?: { item: string; rate: number; min: number; max: number }[]
  /** Warp altars: the partner marker this one teleports to (map-qualified —
   *  the World Tree entrance/exit pair spans maps). */
  warpTo?: { map: string; id: string }
  /** Dungeon portals: the dungeon SpawnAreaId (keys dungeons.json loot). */
  dungeonArea?: string
  /** Loot spawners (chest/fishing/supply/camp/oilrigTreasure): the blueprint-
   *  sources area key their lottery pool belongs to (areas.json index). */
  lootArea?: string
}
export type MarkerLocale = Record<string, { name?: string; description?: string }>
export interface TypesLocale {
  categories: Record<string, { name: string }>
  subtypes: Record<string, { name: string; description?: string }>
}
export type MapsLocale = Record<string, { name: string; shortName?: string }>
export type RegionLocale = Record<string, { name: string }>

interface TypesFile {
  categories: {
    id: string
    pinVariant?: MarkerPinVariant
    subtypes: { id: string; icon?: string; color?: string; iconScale?: number; pinVariant?: MarkerPinVariant; defaultActive?: boolean; canComplete?: boolean }[]
  }[]
}

export async function loadStatic(lng: string) {
  const [mapsFile, typesFile, mapsL10n, typesL10n] = await Promise.all([
    j<{ maps: GameMapMeta[] }>(dataUrl(`maps.json`)),
    j<TypesFile>(dataUrl(`types.json`)),
    j<MapsLocale>(dataUrl(`locales/${lng}/maps.json`)),
    j<TypesLocale>(dataUrl(`locales/${lng}/types.json`)),
  ])
  const types: Taxonomy = {
    categories: typesFile.categories.map((c) => ({ id: c.id })),
    subtypes: typesFile.categories.flatMap((c) =>
      c.subtypes.map((s): MarkerTypeSubtype => ({
        ...s,
        category: c.id,
        pinVariant: s.pinVariant ?? c.pinVariant,
        // Use locale name if available; fall back to id so the required `name` field is always set
        name: typesL10n.subtypes[s.id]?.name ?? s.id,
      }))),
  }
  return { maps: mapsFile.maps, types, mapsL10n, typesL10n }
}

export async function loadMarkers(mapId: string, lng: string) {
  const [markersFile, l10n] = await Promise.all([
    j<{ markers: MarkerRow[] }>(dataUrl(`markers/${mapId}.json`)),
    j<MarkerLocale>(dataUrl(`locales/${lng}/markers/${mapId}.json`)),
  ])
  return { markers: markersFile.markers, l10n }
}

/** Named regions for one map + their localized names. Best-effort: a map with
 *  no regions/<map>.json (or an old data build without one) yields empty. */
export async function loadRegions(
  mapId: string,
  lng: string,
): Promise<{ regions: RegionInstance[]; l10n: RegionLocale }> {
  const [regionsFile, l10n] = await Promise.all([
    j<{ regions: RegionInstance[] }>(dataUrl(`regions/${mapId}.json`)).catch(() => ({ regions: [] })),
    j<RegionLocale>(dataUrl(`locales/${lng}/regions/${mapId}.json`)).catch(() => ({})),
  ])
  return { regions: regionsFile.regions, l10n }
}
