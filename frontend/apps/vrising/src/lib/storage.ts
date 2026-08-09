import { createArkiveThemeStorage } from '@gamemap/ui'
import { type MapViewStore } from '@gamemap/map-shell'
import { browserMemory, defineMemoryRecord, isString, isStringArray, parseJson } from '@gamemap/state-memory'

const VISIBLE_KEY = 'vrising.map.visibleSubtypes'
const VIEW_KEY = 'vrising.map.view'
const mapViewRecord = defineMemoryRecord({
  id: 'view', namespace: 'vrising', surface: 'map', stateClass: 'device_preference',
  schemaVersion: '1.0.0', defaultValue: () => '', validate: isString,
  legacyKeys: [VIEW_KEY], migrateLegacy: (raw: string) => raw,
})
const visibleRecord = defineMemoryRecord({
  id: 'visible-subtypes', namespace: 'vrising', surface: 'map', stateClass: 'device_preference',
  schemaVersion: '1.0.0', defaultValue: () => null as string[] | null,
  validate: (value: unknown): value is string[] | null => value === null || isStringArray(value),
  legacyKeys: [VISIBLE_KEY], migrateLegacy: parseJson,
})

export const themeStorage = createArkiveThemeStorage({ legacyKeys: ['vrising.theme'] })

/** Per-map camera + selection persistence, injected into useMapViewMemory. */
export const mapViewStore: MapViewStore = {
  get: () => browserMemory.read(mapViewRecord) || null,
  set: (raw) => { browserMemory.write(mapViewRecord, raw) },
}

/** Visible marker subtypes; null when the user has never chosen (use defaults). */
export function readVisibleSubtypes(): Set<string> | null {
  const ids = browserMemory.read(visibleRecord)
  return ids === null ? null : new Set(ids)
}

export function writeVisibleSubtypes(ids: Set<string>): void {
  browserMemory.write(visibleRecord, [...ids])
}
