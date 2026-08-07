// AION2 engine theme. Today identical to the engine defaults (the defaults
// ARE the AION2 Lanhu palette); kept as an explicit app-side object so the
// app owns its colors once other games diverge. Module-level singleton for
// reference stability.
import { DEFAULT_MAP_THEME, type MapTheme } from "@gamemap/map-engine";

export const aionTheme: MapTheme = {
  ...DEFAULT_MAP_THEME,
  pinDot: "#0F4C49",
  completedAccent: "#EE8A45",
  zoomGlyph: "#153F3D",
  statusPillBg: "rgba(248, 251, 249, 0.94)",
};
