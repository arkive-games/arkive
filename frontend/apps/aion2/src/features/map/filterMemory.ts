import { browserMemory, defineMemoryRecord, isBoolean, isStringArray, memoryPolicy, parseJson, type MemoryClient } from '@gamemap/state-memory'
import { aionMapSession } from './mapSession'

type Kind = 'subtypes' | 'regions'
const regionContext = defineMemoryRecord({
  id: 'visible-regions', namespace: 'aion2', surface: 'map-context',
  ...memoryPolicy.sessionContext('clear-map-context'), schemaVersion: '1.0.0',
  defaultValue: () => null as string[] | null,
  validate: (value: unknown): value is string[] | null => value === null || isStringArray(value),
})
const migrated = defineMemoryRecord({
  id: 'filter-migration', namespace: 'aion2', surface: 'map',
  ...memoryPolicy.userPreference('reset-map-filter-migration'), schemaVersion: '1.0.0',
  defaultValue: () => false, validate: isBoolean,
})
export const legacyMapFilters = (kind: Kind, legacyKey: string) => defineMemoryRecord({
  id: `visible-${kind}`, namespace: 'aion2', surface: 'map',
  ...memoryPolicy.userPreference('clear-map-filters'), schemaVersion: '1.0.0',
  defaultValue: () => null as string[] | null,
  validate: (value: unknown): value is string[] | null => value === null || isStringArray(value),
  legacyKeys: [legacyKey], migrateLegacy: parseJson,
})
const context = (kind: Kind) => kind === 'subtypes' ? aionMapSession.visibility : regionContext

/** A device flag consumes the legacy seed once without erasing the old choice. */
export function readAionFilters(kind: Kind, map: { id: string; name: string }, legacyKey: string, valid: Set<string>, client: MemoryClient = browserMemory): Set<string> | null {
  const record = context(kind)
  const scope = { partition: map.id }
  const migrationScope = { partition: JSON.stringify([kind, map.id]) }
  let value = client.read(record, scope)
  if (!client.read(migrated, migrationScope)) {
    value ??= client.read(legacyMapFilters(kind, legacyKey), { partition: map.name })
    if (client.write(record, value, scope)) client.write(migrated, true, migrationScope)
  }
  return value === null ? null : new Set(value.filter(id => valid.has(id)))
}

export function writeAionFilters(kind: Kind, mapId: string, value: Set<string>, client: MemoryClient = browserMemory): void {
  client.write(context(kind), [...value], { partition: mapId })
}
