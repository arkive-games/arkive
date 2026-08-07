import type { GameMapMeta, MarkerPinVariant, MarkerTypeSubtype, RegionInstance } from '@gamemap/data-contract'
import { dataUrl } from './urls'

const j = async <T>(url: string): Promise<T> => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return r.json() as Promise<T>
}

// Re-export so MapPage can use GameMapMeta without importing data-contract.
export type { GameMapMeta as MapMeta }

export interface Taxonomy {
  categories: { id: string }[]
  /** MarkerTypeSubtype requires `name`; supplied from the locale at load time. */
  subtypes: MarkerTypeSubtype[]
}

export interface MarkerRow {
  id: string
  subtype: string
  category?: string
  /** RAW WORLD coordinates — the engine projects them via the map's worldBounds. */
  x: number
  y: number
  z?: number
  /** Region polygon this marker belongs to (regions/<map>.json id). */
  region?: string
  indexInSubtype: number
  resourceKind?: string
  resourceDetail?: string
  movement?: 'fixed' | 'roaming'
  route?: { x: number; y: number; z?: number }[]
  routePrecision?: 'chunk-corridor'
  bossPrefab?: string
  bossLevel?: number | null
  bossAct?: string | null
  bossRegion?: string | null
  icon?: string
  images?: string[]
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
    subtypes: {
      id: string
      icon?: string
      color?: string
      iconScale?: number
      pinVariant?: MarkerPinVariant
      defaultActive?: boolean
      canComplete?: boolean
    }[]
  }[]
}

export async function loadStatic(lng: string) {
  const [mapsFile, typesFile, mapsL10n, typesL10n] = await Promise.all([
    j<{ maps: GameMapMeta[] }>(dataUrl('maps.json')),
    j<TypesFile>(dataUrl('types.json')),
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
        // Locale name when present, else the id so the required field is set.
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
  return {
    markers: markersFile.markers,
    l10n,
  }
}

/** Region polygons (PIXEL space) + their labels. Best-effort: the map renders
 *  without them, so a missing file degrades to an empty overlay. */
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
