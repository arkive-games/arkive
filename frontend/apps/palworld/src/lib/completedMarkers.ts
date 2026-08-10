import { useCallback, useEffect, useState } from 'react'
import { browserMemory, defineMemoryRecord, memoryPolicy, parseJson } from '@gamemap/state-memory'

// Completed marker ids per map (marker ids are the tools' stable
// "<map>-<subtype>-<index>" keys), persisted the same way as the
// visible-subtype selection in App.tsx.
const KEY_PREFIX = 'palworld.map.completed.'

const completedRecord = (mapId: string) => defineMemoryRecord({
  id: 'completed-markers',
  namespace: 'palworld',
  surface: 'map',
  ...memoryPolicy.durableProgress('clear-map-progress'),
  schemaVersion: '1.0.0',
  defaultValue: () => [] as string[],
  validate: (value: unknown): value is string[] =>
    Array.isArray(value) && value.length <= 10_000 && value.every((item) => typeof item === 'string'),
  legacyKeys: [KEY_PREFIX + mapId],
  migrateLegacy: (raw: string) => {
    const value = parseJson(raw)
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  },
})

/** Read the persisted completed-marker ids for a map; empty set on any error. */
export function readCompleted(mapId: string): Set<string> {
  return new Set(browserMemory.read(completedRecord(mapId), { partition: mapId }))
}

function writeCompleted(mapId: string, ids: Set<string>) {
  browserMemory.write(completedRecord(mapId), [...ids], { partition: mapId })
}

/** Toggle `id` in `ids`; returns a NEW set and persists it. */
export function toggleCompletedId(mapId: string, ids: Set<string>, id: string): Set<string> {
  const next = new Set(ids)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  writeCompleted(mapId, next)
  return next
}

/** Clear every completed marker for one map and persist the empty set. */
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
