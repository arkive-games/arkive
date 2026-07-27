import type { GameMapMeta } from "@gamemap/data-contract";

/**
 * Asset-URL resolution, injected by the app (the engine never builds URLs
 * itself). No default exists — every game must provide one.
 *
 * Copied verbatim from `@gamemap/map-engine`'s `engineTypes.ts` so the core can
 * be used without the React layer. Task 6 ports the FULL prop contract
 * (`GameMapViewProps`, `EngineMarker`, labels, theme) into
 * `src/react/engineTypes.ts` and will re-export this interface from there — this
 * module stays the single definition so `src/core/` never depends on the React
 * layer.
 */
export interface MapAssets {
  /**
   * URL of the map tile at grid indices (x, y). The engine tile layer rejects
   * out-of-range indices (it never calls this) rather than clamping, so
   * implementations only ever see indices inside the grid.
   * Orientation: (x=0, y=0) is the top-left tile; y increases downward.
   */
  tileUrl(map: GameMapMeta, x: number, y: number): string;
  /**
   * URL for a marker's game-icon image. `icon` may be "" / undefined (subtype
   * without an icon) — implementations decide the fallback. `map` is provided
   * for per-map variants (e.g. AION2 swaps Light→Dark icons on dark maps).
   */
  markerIconUrl(icon: string | undefined, map: GameMapMeta): string;
  /**
   * Optional watermark image tiled over the map at low opacity. Omit to
   * disable the watermark layer.
   */
  watermarkUrl?: string;
}
