import { createArkiveThemeStorage } from '@gamemap/ui'
import { browserMemory, createMapViewStore, defineMemoryRecord, isStringArray, memoryPolicy, parseJson } from '@gamemap/state-memory'

const VISIBLE_KEY = 'vrising.map.visibleSubtypes'
const VIEW_KEY = 'vrising.map.view'
const visibleRecord = defineMemoryRecord({
  id: 'visible-subtypes', namespace: 'vrising', surface: 'map',
  // Read-only migration seed for tab-local map filters; preserve existing data.
  ...memoryPolicy.userPreference('clear-map-filters'),
  schemaVersion: '1.0.0', defaultValue: () => null as string[] | null,
  validate: (value: unknown): value is string[] | null => value === null || isStringArray(value),
  legacyKeys: [VISIBLE_KEY], migrateLegacy: parseJson,
})

export const themeStorage = createArkiveThemeStorage({ legacyKeys: ['vrising.theme'] })

/** Per-map camera + selection persistence, injected into useMapViewMemory. */
export const mapViewStore = createMapViewStore('vrising', { legacyKeys: [VIEW_KEY] })

/** Visible marker subtypes; null when the user has never chosen (use defaults). */
export function readVisibleSubtypes(): Set<string> | null {
  const ids = browserMemory.read(visibleRecord)
  return ids === null ? null : new Set(ids)
}
