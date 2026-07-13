# Map view persistence (selected marker, zoom, position) — design

2026-07-13

## Goal

Reloading the page (or navigating away and back) restores the map exactly as the
user left it: the last selected marker (popup open), the zoom level, and the map
center — per map, per app (palworld and aion2).

## Storage

One localStorage key per app, holding a per-map record:

- Keys: `palworld.map.view`, `aion2.map.view` (mirrors the existing
  `palworld.map.visibleSubtypes` / `palworld.map.completed.*` naming).
- Value: `{ [mapId]: { x, y, zoom, marker } }`
  - `x`, `y` — map center in **DATA space** (what markers use: world coords on
    palworld, image pixels on aion2). Data space is storage-stable; Leaflet
    LatLng is an implementation detail.
  - `zoom` — Leaflet zoom (fractional; smooth wheel zoom lands on any value).
  - `marker` — selected marker id, or `null`.

All reads tolerate missing/corrupt entries (try/catch + shape validation → fall
back to defaults); writes are try/catch no-ops when storage is unavailable.

## Engine changes (`@gamemap/map-engine` — stays app-context-free)

New optional `GameMapView` props:

- `initialView?: { x, y, zoom } | null` — DATA-space center + zoom applied at
  `MapContainer` mount instead of the defaults (full map bounds at zoom −3).
  The container is keyed by map id, so a per-map value naturally applies on
  each map switch. Zoom is clamped to the engine's min/max (−3..2); non-finite
  values fall back to the defaults.
- `onViewChange?: (view: { x, y, zoom }) => void` — fired from the existing
  `ViewportWatcher` (`moveend`/`zoomend`, end-of-gesture only) with the current
  center converted back to DATA space via `latLngToData`.
- `suppressInitialFlyForId?: string | null` — one-shot: `MarkerFocusController`
  skips the fly-to the first time selection lands on this id. Without this,
  restoring the selected marker would fly the map to the marker and stomp the
  restored center whenever the user had panned away with a popup open. The ref
  resets on map switch (the controller remounts with the keyed container), and
  any later selection of the same marker flies normally.

## Shared hook (`@gamemap/map-shell`)

`useMapViewMemory(storageKey, mapId)` returns:

- `initialView` — stored `{x, y, zoom}` for the map (or `null`), re-read when
  `mapId` changes.
- `initialMarkerId` — stored marker id for the map (or `null`).
- `saveView(view)` — merge-write the view fields, preserving `marker`.
- `saveMarker(id | null)` — merge-write the marker, preserving the view.

Pure helpers (`readMapView`, `writeMapView`…) are exported for unit tests.

## App wiring

Both apps: pass `initialView` + `onViewChange` to `GameMapView`; persist
selection changes with `saveMarker`; restore the stored marker once the map's
markers have loaded (only if the id still exists in the set) and pass it as
`suppressInitialFlyForId`.

Precedence — explicit navigation always beats restore:

- **palworld**: a pending cross-map warp-link selection (`pendingSelectRef`)
  wins over the stored marker. Selection saves are skipped while `markerData`
  is null so the clear-on-map-switch transient doesn't wipe the new map's
  stored entry before restore runs.
- **aion2**: a `?marker=` / `?pos=` deep link wins over the stored marker (the
  deep link also flies, which supersedes the restored center; restored zoom
  still applies since fly-to keeps zoom).

## Not in scope

- Remembering the selected **map** (palworld already defaults via `?map=`);
  filter visibility is already persisted separately.
- Cross-tab sync (`storage` events), URL-encoding the view.

## Testing

- Unit (vitest): hook read/write round-trip, corrupt JSON tolerance, per-map
  isolation, merge behavior of `saveView`/`saveMarker`.
- Live: pan/zoom/select on the dev server, reload, confirm restore; confirm a
  warp-link/deep-link still flies and wins over restore.
