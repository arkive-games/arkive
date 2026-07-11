import { useCallback, useEffect, useState } from 'react'

// Completed marker ids per map (marker ids are the tools' stable
// "<map>-<subtype>-<index>" keys), persisted the same way as the
// visible-subtype selection in App.tsx.
const KEY_PREFIX = 'palworld.map.completed.'

/** Read the persisted completed-marker ids for a map; empty set on any error. */
export function readCompleted(mapId: string): Set<string> {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + mapId)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeCompleted(mapId: string, ids: Set<string>) {
  try {
    localStorage.setItem(KEY_PREFIX + mapId, JSON.stringify([...ids]))
  } catch { /* no storage — feature degrades to non-persistent */ }
}

/** Toggle `id` in `ids`; returns a NEW set and persists it. */
export function toggleCompletedId(mapId: string, ids: Set<string>, id: string): Set<string> {
  const next = new Set(ids)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  writeCompleted(mapId, next)
  return next
}

/** Per-map completed-marker set + toggle, reloading when the map switches. */
export function useCompletedMarkers(mapId: string) {
  const [completed, setCompleted] = useState<Set<string>>(() => readCompleted(mapId))
  useEffect(() => { setCompleted(readCompleted(mapId)) }, [mapId])
  const toggleCompleted = useCallback((id: string) => {
    setCompleted((prev) => toggleCompletedId(mapId, prev, id))
  }, [mapId])
  return { completed, toggleCompleted }
}
