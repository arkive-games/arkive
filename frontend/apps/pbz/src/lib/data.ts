import type { GameMapMeta, MarkerPinVariant, MarkerTypeSubtype } from '@gamemap/data-contract'
import { dataUrl } from './urls'

const j = async <T>(url: string): Promise<T> => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return r.json() as Promise<T>
}

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
  /** Image pixels: these maps carry no worldBounds (see tools/apps/pbz/maps/emit.py). */
  x: number
  y: number
  /** World height, for the readout only. */
  z?: number
  indexInSubtype: number
  tier?: number
  /** Per-marker icon (boss portraits); the subtype icon otherwise. */
  icon?: string
}

/** `description` lists what a placed pickup holds, already localized. */
export type MarkerLocale = Record<string, { name?: string; description?: string }>
export interface TypesLocale {
  categories: Record<string, { name: string }>
  subtypes: Record<string, { name: string }>
}
export type MapsLocale = Record<string, { name: string; shortName?: string }>

interface TypesFile {
  categories: {
    id: string
    pinVariant?: MarkerPinVariant
    subtypes: {
      id: string
      icon?: string
      color?: string
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
        name: typesL10n.subtypes[s.id]?.name ?? s.id,
      }))),
  }
  return { maps: mapsFile.maps.filter((m) => m.isVisible), types, mapsL10n, typesL10n }
}

export async function loadMarkers(mapId: string, lng: string) {
  const [markersFile, l10n] = await Promise.all([
    j<{ markers: MarkerRow[] }>(dataUrl(`markers/${mapId}.json`)),
    j<MarkerLocale>(dataUrl(`locales/${lng}/markers/${mapId}.json`)),
  ])
  return { markers: markersFile.markers, l10n }
}
