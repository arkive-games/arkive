import type { GameMapMeta } from "@gamemap/data-contract";

/**
 * Asset-URL resolution, injected by the app (the engine never builds URLs
 * itself). No default exists — every game must provide one.
 *
 * Copied verbatim from `@gamemap/map-engine`'s `engineTypes.ts` so the core can
 * be used without the React layer. `src/react/engineTypes.ts` carries the rest of
 * the prop contract (`GameMapViewProps`, `EngineMarker`, labels, theme) and
 * RE-EXPORTS this interface rather than redeclaring it — this module is the single
 * definition, which is what keeps `src/core/` independent of the React layer and
 * keeps the barrel from exporting two `MapAssets`.
 */
export interface MapAssets {
  /**
   * URL of the map tile at grid indices (x, y) of pyramid level `level`
   * (halvings from native; 0/omitted = native level 0). The engine only asks
   * for levels ≤ `map.tileLevels ?? 0`, and rejects out-of-range indices for
   * the level's grid (`ceil(tilesCount / 2^level)`) rather than clamping.
   * Orientation: (x=0, y=0) is the top-left tile; y increases downward.
   */
  tileUrl(map: GameMapMeta, x: number, y: number, level?: number): string;
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
