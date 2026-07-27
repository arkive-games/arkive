// engineTypes.ts — prop contracts for the game-agnostic WebGL map engine
// components. Nothing in here may reference app contexts, i18n or app-only
// types.
//
// This file is a FIELD-FOR-FIELD copy of `@gamemap/map-engine`'s
// `engineTypes.ts` with exactly two differences, so the GL `GameMapView` is a
// drop-in replacement for the Leaflet one:
//
//  1. `MapRef = L.Map | null` becomes {@link GlMapRef} — there is no Leaflet
//     instance to hand out, so the escape hatch is the small, engine-agnostic
//     handle e2e tests and callers actually use (project/fly/read the view).
//  2. `MapAssets` is RE-EXPORTED from `../core/assets.ts` rather than declared
//     again, so the package has a single definition of it (the framework-free
//     core needs it too, and `src/index.ts` must not export two of them).
import type { ReactNode, RefObject } from "react";
import type { MapAssets } from "../core/assets.ts";
import type { MapTheme } from "./theme.ts";
import type {
  GameMapMeta,
  MarkerInstance,
  MarkerTypeSubtype,
  RegionInstance,
} from "@gamemap/data-contract";

// Single definition, shared with the framework-free core (see the note above).
export type { MapAssets };

/**
 * Handle on a mounted GL map — the GL counterpart of `MapRef` (the Leaflet
 * engine's `L.Map | null`).
 *
 * Deliberately tiny: everything here is engine-agnostic (DATA-space coordinates
 * in, screen pixels out), so a consumer never has to know that three.js is
 * underneath. Published on `props.mapRef` always, and additionally on
 * `window.__glMap` when `exposeTestHandle` is set — that is the e2e entry point
 * (marker hit-testing happens inside the canvas, so a test projects a known
 * DATA coordinate with {@link GlMapRef.project} and clicks the result).
 *
 * `null` is allowed so `useRef<GlMapRef | null>(null)` matches
 * `RefObject<GlMapRef | null>`.
 */
export interface GlMapRef {
  /** Current view centre in DATA space. */
  getCenter(): { x: number; y: number };
  /** Current fractional zoom (Leaflet semantics: `scale = 2^zoom`). */
  getZoom(): number;
  /**
   * Animate to a DATA-space position. `zoom` defaults to the current zoom and
   * `seconds` to the view's `flyToDuration`; `seconds = 0` applies immediately.
   */
  flyTo(x: number, y: number, zoom?: number, seconds?: number): void;
  /** DATA space → CSS pixels from the canvas' top-left corner. */
  project(x: number, y: number): { sx: number; sy: number };
  /**
   * Tear the engine down (renderer, layers, gestures, listeners). Idempotent.
   * The view unmounting does this for you — this is for a host that must
   * release the GL context earlier.
   */
  dispose(): void;
}

/**
 * Marker as the engine consumes it: pre-localized and with the subtype meta
 * resolved by the app, so the engine components never touch app contexts,
 * i18n or the marker-type taxonomy.
 */
export interface EngineMarker extends MarkerInstance {
  /**
   * Localized marker name. May be "" for unnamed markers — consumers apply
   * their own fallback chain (`localizedName || name || subtypeLabel`).
   */
  localizedName: string;
  localizedDescription?: string;
  /**
   * Localized display name of the marker's subtype — the last-resort label
   * for the marker tooltip when the marker itself is unnamed.
   */
  subtypeLabel: string;
  /**
   * Subtype definition (icon, scale, color, completion options, ...).
   * Undefined when the marker references a subtype missing from the taxonomy.
   */
  subtypeMeta?: MarkerTypeSubtype;
  /** Whether the user marked this marker completed (drives icon dim/swap). */
  completed?: boolean;
}

/** UI strings the engine renders itself (i18n stays app-side). */
export interface GameMapViewLabels {
  /** Context-menu "copy position" entry; coordinates are appended by the engine. */
  copyPosition: string;
  /** Empty-state message shown when `map` is undefined. */
  noMapSelected: string;
  /** Zoom-control accessibility labels. */
  zoomIn: string;
  zoomOut: string;
  /** Footer line above the cursor pill (e.g. legal/ICP record). Empty/undefined = hidden. */
  footerText?: string;
}

/**
 * Everything `GameMapView` needs, provided by the app adapter: the engine
 * components read NO app context — all data and callbacks arrive through these
 * props.
 */
export interface GameMapViewProps {
  /** Map to render; when undefined the empty-state message is shown. */
  map?: GameMapMeta;
  /** Markers of the current map, pre-localized + subtype-resolved by the app. */
  markers: EngineMarker[];
  /** Region polygons of the current map. */
  regions: RegionInstance[];
  /**
   * Subtype filter: markers whose subtype is not in the set are hidden
   * (selection overrides). Undefined = filter not initialized yet → all hidden.
   */
  visibleSubtypes?: Set<string>;
  /** Region filter for the region fills. Undefined = show all regions. */
  visibleRegions?: Set<string>;
  /** Show permanent marker-name tooltips. */
  showLabels: boolean;
  /** Draw region border polylines. */
  showBorders: boolean;
  /** Gate higher-tier markers behind minimum zoom levels (game-like LOD). */
  lodEnabled: boolean;
  selectedMarkerId: string | null;
  /**
   * Markers to show regardless of the subtype filter and LOD (e.g. the active
   * search results). Like selection, these bypass subtype/LOD gating so a
   * result whose subtype is toggled off still appears. Undefined/empty = no
   * forced markers.
   */
  forceShowIds?: Set<string>;
  /** Position to fly to (search / deep-link), DATA image-space. */
  selectedPosition: { x: number; y: number } | null;
  /**
   * View to open at instead of the default (whole map at min zoom): center in
   * DATA space + zoom. Read once when the map mounts (the engine is keyed by
   * map id, so a per-map value applies on each switch); later changes are
   * ignored. Out-of-range values are clamped, non-finite ones fall back to the
   * default view.
   */
  initialView?: { x: number; y: number; zoom: number } | null;
  /**
   * Fired at the end of every pan/zoom gesture (plus once on mount) with the
   * current center in DATA space and the zoom — the persistence feed for
   * `initialView`.
   */
  onViewChange?: (view: { x: number; y: number; zoom: number }) => void;
  /**
   * One-shot: skip the fly-to the FIRST time selection lands on this marker
   * id. Used when restoring a persisted selection, so reopening the popup
   * doesn't yank the map away from the restored center. Later selections of
   * the same marker fly normally; re-arms whenever the id changes.
   */
  suppressInitialFlyForId?: string | null;
  /**
   * Line overlays in DATA space, rendered as dashed lines above the tiles
   * (e.g. the link between a selected teleporter and its partner). The app
   * supplies/clears them; undefined/empty = none.
   */
  overlayLines?: {
    id: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
    /** Stroke color; defaults to the theme's pin-dot accent. */
    color?: string;
  }[];
  /**
   * Marker tap / background tap → selection toggle. `null` always deselects.
   */
  onToggleMarker: (markerId: string | null) => void;
  /** `(x, y)` DATA-space → localized subzone name, for the cursor status bar. */
  subzoneAt: (x: number, y: number) => string;
  /** Duration (seconds) of the fly-to animation on selection. */
  flyToDuration: number;
  /** Escape hatch to the mounted engine. */
  mapRef: RefObject<GlMapRef | null>;
  /** Asset-URL resolver (tiles, marker icons, watermark). Required — no default. */
  assets: MapAssets;
  /** Color tokens for engine-rendered chrome; defaults to the AION2 Lanhu palette. */
  theme?: MapTheme;
  /** Renders the selected marker's popup body (app-side content: links, actions...). */
  renderPopupContent: (marker: EngineMarker) => ReactNode;
  /** Dev/test only: publish the map handle on `window.__glMap` for e2e. */
  exposeTestHandle?: boolean;
  labels?: GameMapViewLabels;
  /**
   * Maps a DATA-space (pixel) coordinate to the coordinate shown in the
   * readout (cursor status bar + "Copy position"). Default: identity (show
   * raw DATA coords). An app supplies this to display game-native coords.
   * NOTE: only affects displayed/copied numbers — marker placement, subzone
   * lookup, and everything else stay in DATA space.
   */
  displayCoords?: (x: number, y: number) => { x: number; y: number };
}
