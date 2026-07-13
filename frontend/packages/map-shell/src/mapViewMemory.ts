import { useCallback, useMemo } from "react"

/** DATA-space map center + Leaflet zoom, as saved/restored across reloads. */
export type MapViewState = { x: number; y: number; zoom: number }

/**
 * Persistence adapter injected by the app — the shell stays storage-free
 * (same contract as ThemeStorage). `get`/`set` move the raw JSON string of
 * the whole per-map record; the app owns the storage key. Adapter errors are
 * swallowed here, so apps may pass bare adapters.
 */
export type MapViewStore = {
  get: () => string | null
  set: (raw: string) => void
}

/**
 * Stored per map: the last view and/or the last selected marker. The two are
 * written independently (a marker can be saved before any pan happens), so
 * each field validates on its own when read back.
 */
type StoredEntry = {
  x?: unknown
  y?: unknown
  zoom?: unknown
  marker?: unknown
}

type ViewRecord = Record<string, StoredEntry>

function readRecord(store: MapViewStore): ViewRecord {
  try {
    const raw = store.get()
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {}
    return parsed as ViewRecord
  } catch {
    return {}
  }
}

/**
 * Read the persisted state for one map. `view` is null unless all three
 * numbers are finite; `marker` is null unless it is a string — a corrupt or
 * partial entry degrades per-field, never throws.
 */
export function readMapView(
  store: MapViewStore,
  mapId: string,
): { view: MapViewState | null; marker: string | null } {
  const entry = readRecord(store)[mapId]
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    return { view: null, marker: null }
  }
  const { x, y, zoom, marker } = entry
  const view =
    typeof x === "number" && Number.isFinite(x) &&
    typeof y === "number" && Number.isFinite(y) &&
    typeof zoom === "number" && Number.isFinite(zoom)
      ? { x, y, zoom }
      : null
  return { view, marker: typeof marker === "string" ? marker : null }
}

/**
 * Merge-write part of a map's entry (view fields and/or marker), preserving
 * whatever else is stored for that map and for other maps.
 */
export function writeMapView(
  store: MapViewStore,
  mapId: string,
  patch: Partial<MapViewState & { marker: string | null }>,
): void {
  try {
    const record = readRecord(store)
    record[mapId] = { ...record[mapId], ...patch }
    store.set(JSON.stringify(record))
  } catch {
    /* no storage — feature degrades to non-persistent */
  }
}

/**
 * Per-map view/selection persistence: `initialView`/`initialMarkerId` are the
 * values stored for `mapId` (re-read when the map switches); `saveView` and
 * `saveMarker` merge-write their half of the entry. Pass a module-level store
 * so the callbacks stay referentially stable per map.
 */
export function useMapViewMemory(store: MapViewStore, mapId: string) {
  const initial = useMemo(() => readMapView(store, mapId), [store, mapId])
  const saveView = useCallback(
    (view: MapViewState) => writeMapView(store, mapId, view),
    [store, mapId],
  )
  const saveMarker = useCallback(
    (marker: string | null) => writeMapView(store, mapId, { marker }),
    [store, mapId],
  )
  return {
    initialView: initial.view,
    initialMarkerId: initial.marker,
    saveView,
    saveMarker,
  }
}
