// Theme tokens for the engine-rendered chrome. Defaults reproduce the AION2
// Lanhu design ("1天族") so the engine renders sensibly without a theme prop —
// the same values `@gamemap/map-engine`'s `theme.ts` ships.
//
// `PinTheme` / `DEFAULT_PIN_THEME` are RE-EXPORTED from the framework-free core
// (`core/pinAtlas.ts` owns them, because composing pin bitmaps is core work).
// They are deliberately NOT redeclared here: `src/index.ts` re-exports both this
// module and the core, and two structurally identical declarations of the same
// name would be an ambiguous export.
import { DEFAULT_PIN_THEME, type PinTheme } from "../core/pinAtlas.ts";

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
  zoomGlyph: "#3D3D3D",
  statusPillBg: "rgba(216,216,216,0.7)",
};
