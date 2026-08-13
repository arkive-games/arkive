// Theme tokens for engine-rendered chrome. Defaults follow Arkive's canonical
// Radix palette.
//
// `PinTheme` / `DEFAULT_PIN_THEME` are RE-EXPORTED from the framework-free core.
// They are deliberately NOT redeclared here: `src/index.ts` re-exports both this
// module and the core, and two structurally identical declarations of the same
// name would be an ambiguous export.
//
// Reachable as `@gamemap/map-engine-gl/theme`. The import below deliberately
// points at `core/pinTheme.ts` rather than `core/pinAtlas.ts`: an app builds its
// game theme outside the lazily-loaded map chunk, and pinAtlas would drag three.js
// along. Keep this module's imports free of the engine.
import { DEFAULT_PIN_THEME, type PinTheme } from "../core/pinTheme.ts";

export { DEFAULT_PIN_THEME };
export type { PinTheme };

/** Full engine theme: pin colors plus the map chrome (zoom control, status bar). */
export interface MapTheme extends PinTheme {
  /** Zoom-control +/− glyph color. */
  zoomGlyph: string;
  /** Cursor-coordinates pill background in the status bar. */
  statusPillBg: string;
}

export const DEFAULT_MAP_THEME: MapTheme = {
  ...DEFAULT_PIN_THEME,
  zoomGlyph: "#202020",
  statusPillBg: "rgba(249,249,249,0.94)",
};
