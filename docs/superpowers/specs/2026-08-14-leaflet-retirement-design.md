# Retiring Leaflet: three.js as the only map renderer

**Date:** 2026-08-14
**Status:** approved, implementing
**Scope:** `frontend/packages/map-engine` (deleted), `frontend/packages/map-engine-gl`,
`frontend/packages/map-shell`, apps `aion2` / `palworld` / `vrising`

## Why

The three.js engine (`@gamemap/map-engine-gl`) has been the default renderer for every main
map since palworld 1.19.0. Leaflet survives in two places only: as a user-selectable
alternative on the main map, and as the sole renderer for four in-page embedded mini-maps that
were never ported. Keeping it costs a second engine to maintain, a stylesheet shipped on every
page of three apps, a monkey patch that reaches into Leaflet privates, and a two-engine matrix
across ~16 e2e specs.

This removes it entirely: one renderer, one set of types, one stylesheet.

## What is actually using Leaflet today

Main maps are already three.js. `map-shell/src/mapEngineChoice.ts` sets
`DEFAULT_MAP_ENGINE = "gl"` and the three apps only inject storage plus router sync, so Leaflet
is reached exclusively through `?engine=leaflet` or a previously persisted preference.

Four components render Leaflet unconditionally, and have no three.js equivalent:

| Surface | App | Leaflet features used |
| --- | --- | --- |
| Wiki embedded map (quest / NPC POIs) | aion2 | `Marker`, `Tooltip`, `Polygon` |
| Dungeon entrance map | palworld | `Marker`, `Tooltip` |
| Pal spawn map | palworld | `Marker`, `Tooltip`, `CircleMarker`, zoom-tier clustering |
| Region detail map | palworld | `Marker`, `Tooltip`, zoom-tier clustering |

They share `apps/palworld/src/features/maps/embedCluster.tsx`, whose `CLUSTER_TIERS` / `tierFor`
are pure math and whose `ZoomTierWatcher` is a thin `useMap()` zoom listener.

The GL engine is already dependency-clean — no `leaflet`, no dependency on
`@gamemap/map-engine` — and owns its own `EngineMarker`, `GameMapViewProps`,
`GameMapViewLabels`, `MapAssets`, `DEFAULT_MAP_THEME`, `worldToPixel`. Only three names block
removal: `GameMapTiles`, `createPinIcon`, `dataToLatLng*`, all used exclusively by the four
embeds.

## Approach

Grow the already-written but unwired `GameMapEmbed` (`map-engine-gl/src/react/GameMapEmbed.tsx`)
into the one embed component, then port the four embeds onto it.

Two alternatives were rejected. Reusing the full `GameMapView` with chrome disabled needs almost
no new engine code, but forces the smallest surfaces to stub out a status bar, context menu,
filter model and popup plumbing — `GameMapEmbed` exists precisely because that inversion was
judged wrong. Porting each embed directly against the GL core (`Camera` + `MapRenderer` +
`MarkerLayer`) duplicates the ~40-line bootstrap four times across two apps and moves engine
code into app code, against the repo's shared-packages-first rule.

**Parity bar: behaviour-faithful, GL-native styling.** Same information and interactions —
hover tooltip, click-through, clustering, spawn radii — rendered with the GL engine's own chrome
rather than a replica of Leaflet's DOM.

## Engine changes (`@gamemap/map-engine-gl`)

**Tooltips.** `EmbedPin` gains `tooltip?: string`. `GameMapEmbed` mounts the existing
`MarkerOverlay` in hover-tooltip mode only (no permanent labels), driven by
`MarkerLayer.hitTest` on pointermove. `.gmgl-tooltip` is already styled in `engine-gl.css` and
`map-shell/src/arkive-map-theme.css`, so no new visual design is needed.

**Highlight polygons.** `VectorLayer` gains `setHighlighted(ids)`: a permanent fill plus border
for named regions, reusing the hover-fill mesh machinery rather than adding a parallel code
path. `GameMapEmbed` gains optional `regions` and `highlightRegionIds`. Serves aion2's wiki
embed alone.

**Dot cloud.** A new `PointCloudLayer` draws instanced quads — one draw call regardless of point
count — with the radius in **screen** pixels so it stays constant across zoom, matching
Leaflet's `CircleMarker`. `GameMapEmbed` gains `dots?: EmbedDotCloud[]`. Serves palworld's
paldex habitat overlay.

**Zoom reporting.** `GameMapEmbed` gains `onZoom?: (zoom: number) => void`, fired on camera
change. `embedCluster.tsx` keeps `CLUSTER_TIERS` and `tierFor` verbatim and loses only
`ZoomTierWatcher`. Clustering stays app-side, where the product logic belongs.

**Circular pin scale.** `resolvePinSpec` currently forces `CIRCULAR_ICON_SCALE` for the
`circular` variant, discarding an explicit `iconScale`. It will honour an explicit value,
falling back to the constant — without this, `PalSpawnMap` loses today's boss (1.0) versus wild
(0.9) size distinction.

Per-pin colour needs no new prop: `EmbedPin.color` already routes to the ring for `circular` and
to the dot for `pin`, which is exactly how `createPinIcon`'s `ringColor` / `innerColor` are used
today.

## Application changes

**aion2** — `features/wiki/EmbeddedMap.tsx` becomes a `GameMapEmbed` call with `regions` /
`highlightRegionIds` and `tooltip` pins, keeping its own region fetch and its `<a>` overlay.

**palworld** — `DungeonEntranceMap` (pins + tooltips), `RegionDetailPage`'s map (pins, tooltips,
clustering) and `PalSpawnMap` (clustering, ring colours, count badges, dot cloud). `clusterPoints`
moves from `L.LatLng` to plain DATA-space `{x, y}` points, which also drops its dependency on the
y-flip.

**vrising** — no embeds; only the switcher, dependencies and CSS.

**All three** — type imports re-point from `@gamemap/map-engine` to `@gamemap/map-engine-gl`.
The dual map ref collapses: `mapRef` (`L.Map | null`) is deleted and `glMapRef` stays. This is
free, because no app ever reads `mapRef.current` — the ref exists only to be passed down.

## Removals

- The `@gamemap/map-engine` package, in full.
- `leaflet`, `react-leaflet`, `@types/leaflet` from the three apps.
- `leaflet/dist/leaflet.css` and `@gamemap/map-engine/engine.css` imports from three `main.tsx`.
- `map-engine/src/leaflet-smooth-wheel-zoom.ts` — GL reimplemented the behaviour natively in
  `core/gestureMath.ts`, tested as an explicit port.
- `.leaflet-*` rules in `apps/{aion2,palworld,vrising}/src/index.css` and
  `map-shell/src/arkive-map-theme.css`.
- The leaflet chunk rule at `apps/aion2/vite.config.ts:150`.
- `map-shell/src/mapEngineChoice.ts` and the three per-app copies, with their tests; the engine
  picker UI; the `?engine=` parameter. Persisted `<app>.map.engine` keys are abandoned rather
  than migrated — stale localStorage with no reader is harmless.

## Testing

`GameMapEmbed`'s unit tests grow to cover tooltips, highlight polygons, the dot cloud and zoom
reporting; `PointCloudLayer` and `VectorLayer.setHighlighted` get their own tests.

E2e specs that pin `?engine=leaflet` drop the parameter and re-point locators from
`.leaflet-container` / `.leaflet-marker-icon` to the GL canvas and overlay.
`apps/aion2/e2e/engines.ts` collapses from a two-engine matrix to plain helpers, losing
`window.__leafletMap` and the `WORLD_L_A_HEIGHT` latitude flip. The three `gl-map.spec.ts` files
and `vrising/e2e/engine.spec.ts` lose their purpose as *engine* specs; their non-engine
assertions fold into the smoke specs.

Pre-existing failures are re-baselined per app before any edit, so the diff's own regressions are
provable rather than argued.

## Accepted divergence

Tooltip chrome renders as `.gmgl-tooltip` rather than `.leaflet-tooltip`. Both are already
styled side by side in `arkive-map-theme.css`, so the visual difference is negligible.

The boss/wild pin-size divergence this design first accepted was NOT accepted in the end: it was
cheaper to add the `pinScale` override than to lose the distinction.

## What implementation added to this plan

Three things this design did not anticipate, each recorded in the commit that introduced it:

**Two subpath exports, because the barrel is `sideEffects`-marked.** `worldToPixel` and
`DEFAULT_MAP_THEME` are runtime VALUES the apps read outside the lazily-loaded map route.
Importing them from the barrel drags the whole engine into an app's entry chunk, so they moved to
`@gamemap/map-engine-gl/coords` and `/theme`. The latter required splitting the pin colours out of
`pinAtlas.ts` — which needs three.js for its canvas textures — into an import-free `pinTheme.ts`.

**The embeds need their own lazy boundaries.** Porting them onto the GL embed put three.js back
into the entry chunk of any app that imports its pages statically. Measured on palworld: 1.8 MB
entry plus a 604 KB engine chunk became a 2.1 MB entry with an 8 KB chunk. Both palworld and aion2
now route the embed through a one-line lazy shim beside the existing `GlMapView` one, which lands
palworld's entry at 1.5 MB — 300 KB below where it started, since Leaflet is gone from it.

**The embed's fit counts highlighted regions.** aion2's wiki embed marks the region a quest
belongs to and frequently has no POI inside it, so fitting the pins alone opened on the whole
world.

## Verification

`pnpm test` 1179 passing across 101 files; all six invariant checks and all six app lints green;
`meta`, `aion2`, `palworld` and `vrising` all build, with `WebGLRenderer` absent from every app's
entry chunk.

E2e was baselined per app before any edit and diffed by test NAME afterwards, because renaming and
de-looping specs moves line numbers. No failure in the final run is a regression from this branch:
aion2's `map resize` failure is the de-looped rename of two that already failed, and
`desktop is unchanged › top bar shows` plus `wiki pages get a compact header` were both shown to
fail on `origin/master` too (the latter flakes 1-in-6 there and roughly half the time here, on a
global-search interaction this branch does not touch). Two baseline failures went green:
palworld's marker-density test, and vrising's subtype toggle, which had been clicking a
`subtype-toggle-poi` id that has never existed in the shipped taxonomy.

## Version history

The engine picker disappearing is user-visible, and it is one shared change affecting three
games — so it goes once into `apps/meta/src/platform-changelog.json` with
`--targets aion2,palworld,vrising`, not as three game version bumps. The embed ports are
behaviour-preserving and get no entry. Stamped in a follow-up commit, since an entry cannot
contain its own SHA.

## Delivery

One branch, one pull request, `@claude` review requested on open.
