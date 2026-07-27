# map-engine-gl — three.js game-map engine with Leaflet-engine feature parity

Date: 2026-07-27. Branch `worktree-three-map-engine` (NOT to be merged to master yet).
Goal: a new workspace package `@gamemap/map-engine-gl` that renders the game map with
three.js (WebGL) and reproduces **every feature** of `@gamemap/map-engine` (Leaflet),
exposing the **same injection contracts** (`GameMapViewProps`, `MapAssets`,
`EngineMarker`, `MapTheme`, `GameMapViewLabels`) so the palworld app can switch engines
behind a flag. Long-term motivation: the same core must be portable to a WeChat
mini-program canvas (no DOM), so **everything below the DOM-overlay layer must be
framework-free TypeScript with no DOM assumptions beyond what an adapter provides**.

Reference specs: Appendix A (engine parity spec) and Appendix B (consumer inventory)
at the bottom of this file. When a task conflicts with an appendix, the appendix wins.

## Architecture

Hybrid GL + DOM overlay (the standard slippy-GL design):

- **WebGL canvas (three.js, orthographic camera)**: tiles (textured quads), region
  fills + dashed borders, dashed overlay lines, marker sprites (atlas-composed,
  instanced-ish via `THREE.Sprite`s or InstancedMesh — implementer's choice, must
  handle ~4k visible sprites at 60fps).
- **DOM overlay (React)**: the selected-marker popup (render-prop content), hover
  tooltip + permanent labels, cursor status bar, zoom control, context menu — all
  positioned by projecting world→screen via the camera each interaction frame.
- **Render-on-demand**: no continuous rAF loop. Render only when camera/scene is
  dirty (interaction, animation, texture load, prop change). Idle = 0 fps.
- **Package layout**:
  - `src/core/` — framework-free: coords, camera, gestures, tile layer, marker
    atlas+layer, vector layer, hit-testing. No React, no DOM globals except via
    injected canvas/element handles. This is the future weapp-portable core.
  - `src/react/` — `GameMapView` (full parity), `GameMapEmbed` (tiles+pins embed
    primitive replacing the bare `MapContainer`+`GameMapTiles` composition),
    overlay components, `engine-gl.css`.
  - Same purity gate as map-engine: add `check:engine-gl` to `frontend/package.json`
    (same grep, path `packages/map-engine-gl/src`).
- **Deps**: `three` (^0.180 or current), `earcut` (region fill triangulation),
  dev `@types/three`, `@types/earcut`, `vitest`. Peer: react ^19, react-dom ^19.
  Workspace dep: `@gamemap/data-contract`. `lucide-react` NOT needed (badges are
  canvas-composed).

### Key design decisions (binding)

1. **Zoom semantics identical to Leaflet**: zoom `z` ∈ [-3, 2] fractional; screen
   scale = `2^z` (z=0 → 1 world-pixel = 1 CSS px). Tiles are single-native-level
   (level-0 grid, `tileSize = map.tileWidth`), always the same textures, scaled by
   the camera. `MIN_ZOOM=-3`, `MAX_ZOOM=2`; embeds may pass `minZoom=-4`.
2. **Coordinates**: copy `coords.ts` math exactly (worldToPixel/pixelToWorld with
   `worldBounds`+`orientation`, identity fallback). The GL scene works in
   **map-pixel space, y-down** (camera flips via projection; no per-object flip).
   Public helpers: `dataToPoint(map, x, y) → {x, y}` (pixel space) + `pointToData`.
   Do NOT expose latlng anywhere.
3. **Marker visuals**: reproduce `createPinIcon`'s output as **atlas entries
   composed on an offscreen 2D canvas**, cached by the same visual-signature key
   (`variant|innerIcon|iconScale|completed|dot|ring|selected|fragmentType|count`).
   Each entry draws: base icon (image / circular-cropped / pin-dot variant),
   completion dim (alpha 0.4) + green check (or icon-swap), air/water chevron,
   count pill, selection scale 1.2 + baked drop-shadow. Base box 40px ×
   `iconScale` × devicePixelRatio, center-anchored.
4. **Selection/popup model identical**: single `selectedMarkerId`; popup content via
   `renderPopupContent(marker)`; popup DOM carries `gm-popup-card` compatibility
   (reuse the same CSS variable tokens; ship `engine-gl.css`); background click →
   `onToggleMarker(null)`; marker click → toggle. Fly-to on selection/position with
   `flyToDuration`, one-shot `suppressInitialFlyForId`, and **no re-entrant setState
   during camera animation while popup is mounted** (the Leaflet engine has a known
   max-update-depth console flood here — the GL engine must not reproduce it).
5. **Gestures**: pointer drag with inertia, two-pointer pinch (zoom toward gesture
   midpoint), smooth wheel zoom porting the Leaflet handler's feel (target-zoom
   accumulation `delta*0.003*sensitivity` (sensitivity 4), per-frame interpolation
   factor 0.3, 200 ms idle → gesture end, zoom toward cursor), double-click +1 zoom.
   `moveend/zoomend`-equivalent: emit `viewchange` once per gesture end + once on
   mount → `onViewChange({x, y, zoom})` in DATA space.
6. **Perf model**: GL replaces DOM chunked-mounting; culling still applies for DOM
   labels/tooltips only. Marker set changes rebuild sprite buffers (fine at ~4k).
   Fan-out identical: markers sharing exact x,y fanned on an 18 map-px radius circle.
   LOD tiers (thresholds -1.25 / 0) implemented but palworld passes lodEnabled=false.
7. **Test handle**: `exposeTestHandle` publishes `window.__glMap` with
   `{ getCenter(): {x,y}, getZoom(): number, flyTo(x, y, zoom?, seconds?): void,
   project(x,y): {sx,sy} }` (DATA space). e2e for the GL engine use this + testids;
   do not fake Leaflet DOM classes. Give the canvas `data-testid="gl-map-canvas"`,
   marker hit-tests are canvas-internal so e2e interact via `__glMap.project` + click.
8. **App wiring is flag-gated and additive**: `?engine=gl` on the map route mounts
   the GL `GameMapView`, default stays Leaflet. No Leaflet code removed. Embeds stay
   on Leaflet in this branch (GameMapEmbed exists for future porting, wired into at
   most one demo usage if trivial).

## Tasks

### Task 1 — Package scaffold, coords, camera core
Create `frontend/packages/map-engine-gl` (package.json modeled on map-engine: type
module, exports `.` → src/index.ts and `./engine-gl.css`, `check` script tsc
--noEmit, `test` script vitest run; deps three+earcut; tsconfig like map-engine's).
Register in pnpm workspace (already glob-covered — verify). Add `check:engine-gl`
to frontend/package.json mirroring `check:engine`. Vitest config (copy palworld's
pattern or a minimal one; node env for math tests).
- `src/core/coords.ts`: port map-engine `coords.ts` verbatim minus Leaflet types:
  `mapWidthOf`, `mapHeightOf`, `worldToPixel`, `pixelToWorld`, `dataToPoint`,
  `pointToData` (pixel-space y-down; NO latlng flip — document the difference).
- `src/core/camera.ts`: `Camera` class — state `{centerPx: {x,y}, zoom}`;
  `scale() = 2^zoom`; clamp zoom [minZoom, maxZoom] and center to map bounds
  (allow overpan by half viewport like Leaflet's default feel — document choice);
  `screenToPixel`/`pixelToScreen`; `setView`, `panBy`, `zoomAround(screenPt, dz)`;
  `flyTo(targetPx, zoom, seconds)` with easeInOutCubic, advanced by `tick(now)`;
  event emitter: `change` (any), `gestureend`, `flyend`. Pure TS, no DOM.
- Tests: port coords.test.ts cases (adapted to dataToPoint) + camera tests
  (clamping, zoomAround keeps the anchor fixed, flyTo reaches target, gestureend
  semantics). All passing via `pnpm --filter @gamemap/map-engine-gl test`.

### Task 2 — Gesture controller (core)
`src/core/gestures.ts`: `attachGestures(el: HTMLElement, camera: Camera, opts)`.
Pointer-events based: drag pan (with inertia: velocity sampling, exponential decay,
cancel on pointerdown), pinch zoom (two pointers: zoom toward midpoint, simultaneous
pan by midpoint movement), smooth wheel zoom (Leaflet-port semantics from design
decision 5), double-click +1 zoom (animated ~0.25 s), context-menu passthrough
callback with screen+pixel coords. Emits camera changes; camera fires `gestureend`
after inertia/wheel-idle/pinch-release settles. Returns detach fn. Keep ALL math in
pure functions (`src/core/gestureMath.ts`) unit-tested (inertia decay, pinch
midpoint zoom math, wheel accumulation/interpolation); the DOM binding layer stays
thin. No `window`/`document` access except via `el` and `setTimeout`/rAF injected
with defaults (weapp portability).

### Task 3 — Renderer + tile layer (core)
`src/core/renderer.ts`: three.js setup — `WebGLRenderer({alpha: true, antialias:
true})`, orthographic camera derived from `Camera` each render, `setPixelRatio`
(cap 2), resize via ResizeObserver (injected), render-on-demand scheduler
(`invalidate()` coalesced to one rAF). Scene root group in pixel space with y-down
convention (scale.y = -1 on root or projection matrix — pick one, document).
`src/core/tileLayer.ts`: computes visible level-0 tile indices from camera viewport
(pad 1 tile), creates one quad mesh per tile (`MeshBasicMaterial`, texture via
`TextureLoader` with crossOrigin), **rejects out-of-grid indices without calling
`assets.tileUrl`** (0,0 = top-left, y down), LRU cache (keep ~2× visible count,
dispose evicted textures), throttle texture creation to ≤4 per frame to avoid
upload jank, fade-in optional (skip if it complicates), optional watermark layer
(same grid, opacity 0.2) when `assets.watermarkUrl` set. `colorSpace = SRGB`.
Nearest-up filtering choice: `LinearFilter` min+mag, no mipmaps (single-level tiles,
downscale quality at far zoom must be acceptable — compare vs Leaflet visually).
Test: pure functions for visible-index computation + LRU behavior (mock three
where needed; heavy GL untested).

### Task 4 — Marker atlas + marker layer (core)
`src/core/pinAtlas.ts`: `composePinBitmap(spec) → HTMLCanvasElement` replicating
createPinIcon visuals per design decision 3 (image variant w/ compact/fragment
scaling rules from Appendix A §2.3; circular variant: cropped circle + ring color
(subtype color unless #000000, else theme.circularBorder); pin variant: 30px disc
`pinDiscBg` + 1px `pinBorder` border + 22px dot `innerColor`); async icon-image
loading via injected `loadImage(url)` (browser default provided); signature-keyed
cache; atlas packer that appends bitmaps into one (or more) `CanvasTexture`s
(shelf packing, 2048² pages, DPR-aware).
`src/core/markerLayer.ts`: takes `EngineMarker[]` + per-marker resolved visual
spec + fanned-out positions; renders sprites (implementer choice: `InstancedMesh`
with per-instance UV offsets, or batched `PlaneGeometry` merge, or `Points` with
custom shader — must support per-marker size, atlas UVs, and draw order with
selected on top); exposes `hitTest(screenPt) → markerId | null` (topmost within
each sprite's screen rect; iterate visible, prefer selected/nearest center);
`setSelected(id)`, `setMarkers(list)`, visibility recompute from
`visibleSubtypes/forceShowIds/lodEnabled/tier/selected` (rules in Appendix A §2.10,
palworld uses lodEnabled=false). Icon resolution rules (icon-swap completion,
marker.icon || subtypeMeta.icon fallback) copied from GameMarker.tsx. Fan-out: port
FAN_RADIUS_PX=18 logic. Unit-test: visibility filtering matrix, fan-out layout,
signature building, atlas packing coords; skip GPU specifics.

### Task 5 — Vector layer: regions, borders, overlay lines (core)
`src/core/vectorLayer.ts`:
- Region fills: triangulate `RegionInstance.borders` rings with earcut (pixel
  space). Base fills invisible (not rendered) — hover detection is a point-in-
  polygon hit-test (`regionAt(px) → regionId|null`, smallest-area match) on
  pointermove; the single hovered region renders a fill mesh (color
  `--primary`/theme, fillOpacity ~0.18 to match Leaflet default 0.2 feel — check
  Leaflet's actual hover fill opacity in GameMapBorders and match).
- Borders (`showBorders`): de-duplicated shared edges (port edgeKey logic),
  rendered as dashed lines — `LineSegments` + `LineDashedMaterial`
  (computeLineDistances; dash 8/gap 5 world-px at zoom 0 — accept that GL dashes
  scale with zoom unlike Leaflet's screen-space dashes, OR implement screen-space
  dashes in a small shader if straightforward; document the choice). Hovered
  region's border: solid, opacity 1, width 3; others dashed opacity 0.5.
  Line width: `LineBasicMaterial` width is 1px-limited on most platforms — use
  `Line2/LineMaterial` from three/examples (fat lines) for width 3 parity.
- Overlay lines: dashed (8/8), width 2.5, color `line.color ?? theme.pinDot`,
  from/to via dataToPoint. Same fat-line approach.
- `visibleRegions` filter (undefined = all).
Unit-test: edge dedup, point-in-polygon (with holes? borders is ring array — match
Leaflet behavior which treats each ring as its own polygon), earcut wiring.

### Task 6 — React layer: GameMapView parity + DOM overlay + chrome
`src/react/GameMapView.tsx` accepting the FULL `GameMapViewProps` (copy
engineTypes.ts into `src/react/engineTypes.ts`, changing only `MapRef` →
`GlMapRef` = the test-handle shape from design decision 7 + `dispose`; everything
else identical, incl. EngineMarker/MapAssets/labels/theme re-exported).
Composes: renderer + tileLayer + markerLayer + vectorLayer + gestures wired to a
`<canvas data-testid="gl-map-canvas">` inside `.gm-map-root`-equivalent
(`.gmgl-map-root`); empty state when no map.
DOM overlay (children of the root, projected via camera on each `change` event —
use refs + direct style transforms, NOT React state per frame):
- `SelectedPopup`: 320px card anchored above marker (offset like Leaflet's
  popupAnchor [0,-10] + popup offset [0,-4]); render-prop content; `gm-popup-card`
  triangle CSS ported into `engine-gl.css`; deselect on unmount path NOT needed
  (selection is the only source of truth); auto-pan: after opening, pan the camera
  minimally so the popup fits (match Leaflet autoPan behavior).
- Hover tooltip: single element following hit-tested hover (name fallback chain
  `localizedName || name || subtypeLabel`, `hideTooltip` respected, none on
  selected). Permanent labels when `showLabels`: DOM nodes for markers in viewport
  (cull + cap ~300 with overflow skipped) positioned via the same projection batch.
- Cursor status bar: port cursorStore (external store) + MapStatusBar (coords via
  `displayCoords`, `subzoneAt`, footerText, `data-testid="map-coords"`).
- Zoom control (+/- 0.25 animated), context menu (copy position via clipboard,
  same close semantics), all styled by `engine-gl.css` using the same CSS var
  tokens (copy engine.css and rename gm- → gmgl- where colliding; popup/tooltip
  classes may keep gm- names IF no Leaflet is mounted simultaneously — they can
  coexist; prefer distinct gmgl- root-scoped names to be safe).
- Controllers: fly-to on selectedMarkerId (keyed on coords)/selectedPosition with
  suppressInitialFlyForId one-shot; initialView read-once (clamped, non-finite →
  default whole-map view at MIN_ZOOM); onViewChange on gestureend/flyend + mount;
  exposeTestHandle → window.__glMap.
- `src/react/GameMapEmbed.tsx`: lightweight embed (map, assets, pins:
  {id,x,y,spec…}[], initial fit to pin bounds or whole map, onPinClick, minZoom
  override) — the GL counterpart of bare MapContainer+GameMapTiles+createPinIcon.
- Barrel `src/index.ts` exporting the same names map-engine exports where
  applicable (GameMapView, GameMapEmbed, coords fns, cursorStore, themes, types).
`pnpm --filter @gamemap/map-engine-gl check` (tsc) and `check:engine-gl` pass.

### Task 7 — App flag wiring + e2e + visual verification
- `apps/palworld`: extend `MapSearch` with `engine?: 'gl'`; in App.tsx `mapView`,
  when `engine === 'gl'` render GL `GameMapView` (import from
  `@gamemap/map-engine-gl` + its css) with the SAME props object (mapRef must
  accept the GL handle — keep a separate `glMapRef`; do not thread it into
  Leaflet-typed code). Add package dep to palworld. Default path untouched.
- New e2e `e2e/gl-map.spec.ts` (desktop + one mobile case): `/?engine=gl` renders
  `gl-map-canvas`; `window.__glMap` exists; `subtype-toggle-fastTravel` toggle then
  `__glMap.project` a known fast-travel marker's coords and click → popup card
  appears with name; background click closes; `map-coords` updates on mousemove;
  regions button draws (assert via screenshot diff or `__glMap` region hover API —
  simplest: skip region assert, cover in visual pass).
- Visual pass (manual via Playwright MCP, not committed): side-by-side screenshots
  Leaflet vs GL at same view for MainWorld + WorldTree, light + dark, desktop +
  390px mobile; pan/zoom/popup/tooltip/regions/warp-line interactions; perf sanity:
  all subtypes on (~3.6k markers) pan remains smooth (no per-frame long tasks).
- Full existing test suites still green (unit + e2e; Leaflet default untouched).
- Commits stay on the worktree branch; DO NOT merge or push to master.

## Verification (whole feature)
- `pnpm --filter @gamemap/map-engine-gl test` — core math/logic units green.
- `pnpm check:engine-gl`, `pnpm --filter @gamemap/map-engine-gl check` — purity + tsc.
- palworld unit + e2e (incl. new gl-map.spec.ts): green apart from the 2 known
  pre-existing failures.
- Visual parity screenshots reviewed for: tiles, all three pin variants, completion
  dim/check, count badge, chevrons, selection emphasis, tooltip, popup w/ triangle,
  region hover + dashed borders, warp dashed line, status bar, zoom pill, context
  menu, dark mode, mobile.

---

# Appendix A — Leaflet engine parity spec (verbatim from inventory)

[See agent report — reproduced in full]

A game-agnostic, Leaflet-based interactive map engine. Ships TypeScript source only.
Total ~2,357 LOC across 18 source files. Peer deps react ^19, react-dom ^19,
leaflet ^1.9, react-leaflet ^5; deps @gamemap/data-contract, lucide-react.

## Public API
- Components: `GameMapView(props: GameMapViewProps)`; `GameMapTiles({selectedMap, assets})`.
- Functions: `mapWidthOf/mapHeightOf(map)`; `worldToPixel/pixelToWorld(map,x,y)`;
  `dataToLatLng/dataToLatLngTuple(map,x,y)`; `latLngToData(map,lat,lng)`;
  `createPinIcon(innerIcon, iconScale, completed, options?)`.
- Objects: `cursorStore` (set/clear/subscribe/getSnapshot); `DEFAULT_PIN_THEME`;
  `DEFAULT_MAP_THEME`.
- Types: MapRef, EngineMarker, MapAssets, GameMapViewLabels, GameMapViewProps,
  PinVariant, PinIconOptions, CursorPos, PinTheme, MapTheme.

## Behaviors
- CRS.Simple pixel space; size = tileWidth*tilesCountX × tileHeight*tilesCountY;
  DATA space = raw world coords when worldBounds+orientation present else pixel;
  exactly one vertical flip `lat = mapHeight - py, lng = px`.
- worldToPixel: linear map of world bbox onto pixel grid; `orientation.pxAxis`
  picks which world axis drives pixel X; flipX/flipY mirror.
- Tiles: tileSize = tileWidth; Leaflet y remapped `y = tilesCountY + coords.y`;
  out-of-grid → "" without calling assets.tileUrl; (0,0) top-left y-down; noWrap;
  maxNativeZoom=0 minNativeZoom=0 (all zoom = GPU scale of level-0);
  optional watermark layer opacity 0.2.
- Markers: DivIcon via createPinIcon; iconScale = subtypeMeta.iconScale || 1.25;
  icon-swap completion (completed && iconComplete → swap, no dim/check);
  rawIcon = (swap ? iconComplete : marker.icon || subtypeMeta.icon) || "";
  variants: circular (cropped portrait, ring = subtype color unless #000000 else
  theme.circularBorder, createPinIcon(url, 0.9, ...)); pin (no icon: 30px disc
  rgba(0,0,0,.6), 1px white border, 22px dot color subtype color|theme.pinDot);
  image (default, ~40px; compact scale 0.9 for category "gathering" or subtype in
  {fragments, hiddenCube}; fragments 1.1). Geometry: box 40×iconScale,
  iconAnchor center [20,20], popupAnchor [0,-10]. Completion: opacity .4 + green
  CheckCircle 15px sw3.5 bottom-right (BADGE_INSET=3). Fragment badge: air →
  ChevronUp, water → ChevronDown 15px sw4 bottom-right. Count badge (count>1):
  dark pill min 14px rgba(0,0,0,.82) white 1px border top-right, tabular-nums.
  Selection: scale 1.2 from center + drop-shadow(0 3px 5px rgba(0,0,0,.85)) +
  drop-shadow(0 0 3px rgba(0,0,0,.9)); zIndexOffset 1000. DivIcon cache keyed
  `variant|innerIcon|iconScale|completed|dot|ring|selected|fragmentType|count`.
  Fan-out: identical x,y → circle radius 18 px.
- No runtime clustering on main map (count field is data-level).
- Tooltips: direction top, offset [0,-18], class gm-marker-tooltip; permanent =
  showLabels && !subtypeMeta.hideTooltip; hover otherwise; none on selected;
  label = localizedName || name || subtypeLabel.
- Popup: selected marker only; position memoized on coords (anti-blink);
  offset [0,-4], max/minWidth 320, autoPan, no closeButton, closeOnClick=false,
  autoClose=false; remove → deselect; content via renderPopupContent; app card
  class gm-popup-card gets ::after triangle.
- Regions: borders number[][][]; three layers — invisible interactive fills
  (stroke:false fillOpacity:0, mouseover/out → hover state, filtered by
  visibleRegions), hover highlight fill (interactive=false), dedup border
  polylines when showBorders (shared edges drawn once; hovered: weight 3 opacity 1
  dash "1 0"; others weight 3 opacity .5 dash "8 5").
- Overlay lines: dashed 8 8, weight 2.5, opacity .85, color ?? theme.pinDot.
- Map: minZoom -3 maxZoom 2, zoomSnap 0, zoomDelta .25, scrollWheelZoom off,
  smoothWheelZoom on sensitivity 4, keyed by map id, mounts center+zoom (default:
  whole-map center at -3). Smooth wheel: rAF interpolation 0.3/frame toward
  accumulated target (delta*0.003*sensitivity), 200ms idle end, zoom toward cursor.
- Fly: flyTo(latLng, currentZoom, duration) on selection (keyed on coords) and
  selectedPosition; suppressInitialFlyForId one-shot; initialView read once at
  mount (clamped; non-finite → default).
- LOD: tier 1 always; tier 2 ≥ -1.25; tier 3 ≥ 0; tier==null hidden when LOD on;
  selection + forceShowIds bypass subtype filter + LOD.
- Culling: moveend/zoomend only, pad 0.5 viewport; chunked mounting 250/frame;
  positions memoized (positionById).
- Cursor bar: external store (no React on mousemove); shows x/y via displayCoords,
  subzoneAt label, footerText, data-testid map-coords.
- Context menu: contextmenu → DATA coords + container point; copy "x, y" (rounded,
  displayCoords-transformed) via clipboard; closes on click/movestart/zoomstart.
- Deselect on background click; marker clicks don't bubble.
- Theme: MapTheme inline for chrome; engine.css uses var(--token, fallback) —
  host dark mode flows through; PinTheme/MapTheme defaults as in theme.ts.
- exposeTestHandle → window.__leafletMap.
- Purity gate: no react-i18next / router / import.meta.env / localStorage / "@/" /
  "UI/" in src (check:engine grep); no fetch; only workspace dep data-contract.

## Contracts (verbatim)
```ts
export interface MapAssets {
  tileUrl(map: GameMapMeta, x: number, y: number): string;
  markerIconUrl(icon: string | undefined, map: GameMapMeta): string;
  watermarkUrl?: string;
}
export interface EngineMarker extends MarkerInstance {
  localizedName: string;
  localizedDescription?: string;
  subtypeLabel: string;
  subtypeMeta?: MarkerTypeSubtype;
  completed?: boolean;
}
export interface GameMapViewLabels {
  copyPosition: string; noMapSelected: string; zoomIn: string; zoomOut: string;
  footerText?: string;
}
export interface GameMapViewProps {
  map?: GameMapMeta;
  markers: EngineMarker[];
  regions: RegionInstance[];
  visibleSubtypes?: Set<string>;
  visibleRegions?: Set<string>;
  showLabels: boolean;
  showBorders: boolean;
  lodEnabled: boolean;
  selectedMarkerId: string | null;
  forceShowIds?: Set<string>;
  selectedPosition: { x: number; y: number } | null;
  initialView?: { x: number; y: number; zoom: number } | null;
  onViewChange?: (view: { x: number; y: number; zoom: number }) => void;
  suppressInitialFlyForId?: string | null;
  overlayLines?: { id: string; from: {x:number;y:number}; to: {x:number;y:number}; color?: string }[];
  onToggleMarker: (markerId: string | null) => void;
  subzoneAt: (x: number, y: number) => string;
  flyToDuration: number;
  mapRef: RefObject<MapRef>;             // GL: RefObject<GlMapRef>
  assets: MapAssets;
  theme?: MapTheme;
  renderPopupContent: (marker: EngineMarker) => ReactNode;
  exposeTestHandle?: boolean;
  labels?: GameMapViewLabels;
  displayCoords?: (x: number, y: number) => { x: number; y: number };
}
export interface PinTheme {
  pinDiscBg: string; pinBorder: string; pinDot: string;
  circularBorder: string; completedAccent: string;
}
export interface MapTheme extends PinTheme { zoomGlyph: string; statusPillBg: string; }
// defaults: pinDiscBg rgba(0,0,0,0.6), pinBorder rgba(255,255,255,1),
// pinDot #2E97FF, circularBorder rgba(255,255,255,0.9), completedAccent #22c55e,
// zoomGlyph #3D3D3D, statusPillBg rgba(216,216,216,0.7)
export interface PinIconOptions {
  variant?: PinVariant; innerColor?: string; ringColor?: string; selected?: boolean;
  fragmentType?: "ground" | "air" | "water"; count?: number; theme?: PinTheme;
}
// data-contract:
export interface MapOrientation { pxAxis: "X" | "Y"; flipX: boolean; flipY: boolean; }
export interface GameMapMeta {
  id: string; name: string; type: string;
  tileWidth: number; tileHeight: number; tilesCountX: number; tilesCountY: number;
  isVisible: boolean;
  worldBounds?: { min: {x:number;y:number}; max: {x:number;y:number} };
  orientation?: MapOrientation;
}
export interface RegionInstance { id: string; name: string; type: string; borders: number[][][]; }
```
(MarkerInstance/MarkerTypeSubtype: see data-contract/src/types.ts.)

# Appendix B — Consumer inventory highlights (palworld app)

- Main map: App.tsx `mapView` passes: mapRef, map, markers, regions,
  visibleSubtypes, showLabels, showBorders, lodEnabled=false, selectedMarkerId,
  forceShowIds, selectedPosition, initialView, onViewChange,
  suppressInitialFlyForId, overlayLines, onToggleMarker, subzoneAt, displayCoords,
  flyToDuration=0.5, assets=palworldAssets, theme=palworldTheme
  (completedAccent #4fa8ff), exposeTestHandle=import.meta.env.DEV,
  renderPopupContent, labels. visibleRegions not passed.
- Embeds (Leaflet, unchanged this branch): PalSpawnMap, RegionLootMap,
  DungeonEntranceMap — bare MapContainer + GameMapTiles + createPinIcon +
  dataToLatLng, minZoom -4, grid clustering app-side (embedCluster.tsx).
- assets: tileUrl `${RES_BASE}/tiles/${map.id}/${map.id}_${pad2(x)}_${pad2(y)}.webp`;
  markerIconUrl `${RES_BASE}/icons/${icon}.webp`; no watermark.
- Persistence app-side: initialView/onViewChange ↔ localStorage palworld.map.view;
  visible subtypes; completed markers per map.
- Popup body (renderPopupContent) renders shell MarkerPopupCard (320px, testid
  marker-popup-card) with links, drop badges, completion toggle etc. — unchanged;
  GL popup just hosts it.
- Map background: app CSS `.leaflet-container` bg #cfe4ef / dark #0c161e — GL
  needs an equivalent hook (transparent canvas + `.gmgl-map-root` background, or
  app CSS addition targeting the GL root; add app CSS in Task 7).
- Theme: shell toggles `.dark` on <html>; engine CSS vars follow automatically.
- e2e today asserts Leaflet DOM (leaflet-tile/leaflet-marker-icon/overlay-pane
  paths) — GL parity is validated by NEW gl-map.spec.ts + visual pass instead.
- Known Leaflet quirk not to reproduce: max-update-depth console flood on
  programmatic fly with popup open.
