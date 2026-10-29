import { createArkiveThemeStorage } from '@gamemap/ui'
import { type MapViewStore } from '@gamemap/map-shell'
import { browserMemory, defineMemoryRecord, isString, isStringArray, memoryPolicy } from '@gamemap/state-memory'

const mapViewRecord = defineMemoryRecord({
  id: 'view', namespace: 'pbz', surface: 'map',
  ...memoryPolicy.recentActivity('clear-recent-map-view'),
  schemaVersion: '1.0.0', defaultValue: () => '', validate: isString,
})
const visibleRecord = defineMemoryRecord({
  id: 'visible-subtypes', namespace: 'pbz', surface: 'map',
  ...memoryPolicy.userPreference('clear-map-filters'),
  schemaVersion: '1.0.0', defaultValue: () => null as string[] | null,
  validate: (value: unknown): value is string[] | null => value === null || isStringArray(value),
})
const mapIdRecord = defineMemoryRecord({
  id: 'map-id', namespace: 'pbz', surface: 'map',
  ...memoryPolicy.recentActivity('clear-recent-map-view'),
  schemaVersion: '1.0.0', defaultValue: () => '', validate: isString,
})

export const themeStorage = createArkiveThemeStorage()

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

/** The area map last open; '' when none was. */
export const readMapId = (): string => browserMemory.read(mapIdRecord)
export const writeMapId = (id: string): void => { browserMemory.write(mapIdRecord, id) }
