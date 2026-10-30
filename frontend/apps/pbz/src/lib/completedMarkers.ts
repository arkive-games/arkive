import { useCallback, useEffect, useState } from 'react'
import { browserMemory, defineMemoryRecord, isStringArray, memoryPolicy } from '@gamemap/state-memory'

// Completed marker ids per map. The ids are content hashes of each pickup's
// save GUID and position (tools/apps/pbz/maps/emit.py), so they survive a
// re-emit and progress keeps across data updates.
const completedRecord = defineMemoryRecord({
  id: 'completed-markers', namespace: 'pbz', surface: 'map',
  ...memoryPolicy.durableProgress('clear-map-progress'),
  schemaVersion: '1.0.0', defaultValue: () => [] as string[],
  validate: (value: unknown): value is string[] => isStringArray(value) && value.length <= 10_000,
})

/** The persisted completed-marker ids for a map; empty on any error. */
export function readCompleted(mapId: string): Set<string> {
  return new Set(browserMemory.read(completedRecord, { partition: mapId }))
}

function writeCompleted(mapId: string, ids: Set<string>) {
  browserMemory.write(completedRecord, [...ids], { partition: mapId })
}

/** Toggle `id` in `ids`; returns a NEW set and persists it. */
export function toggleCompletedId(mapId: string, ids: Set<string>, id: string): Set<string> {
  const next = new Set(ids)
  if (next.has(id)) next.delete(id); else next.add(id)
  writeCompleted(mapId, next)
  return next
}

/** Clear every completed marker on one map and persist the empty set. */
export function clearCompletedIds(mapId: string): Set<string> {
  const next = new Set<string>()
  writeCompleted(mapId, next)
  return next
}

/** Per-map completed-marker set + actions, reloading when the map switches. */
export function useCompletedMarkers(mapId: string) {
  const [completed, setCompleted] = useState<Set<string>>(() => readCompleted(mapId))
  useEffect(() => { setCompleted(readCompleted(mapId)) }, [mapId])
  const toggleCompleted = useCallback((id: string) => {
    setCompleted((prev) => toggleCompletedId(mapId, prev, id))
  }, [mapId])
  const clearCompleted = useCallback(() => {
    setCompleted(clearCompletedIds(mapId))
  }, [mapId])
  return { completed, toggleCompleted, clearCompleted }
}
