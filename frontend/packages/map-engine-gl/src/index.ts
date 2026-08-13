// @gamemap/map-engine-gl — game-agnostic WebGL (three.js) map engine.
//
// Feature parity target: @gamemap/map-engine (Leaflet), same injection
// contracts. `src/core/` is framework-free and DOM-free so the same core can also
// drive a WeChat mini-program canvas; `src/react/` — the components exported at
// the bottom of this file — is the only part that touches the DOM.
//
// Component chrome is styled by the static stylesheet
// `@gamemap/map-engine-gl/engine-gl.css`, which the consuming app imports once.
export * from "./core/types.ts";
export * from "./core/assets.ts";
export * from "./core/coords.ts";
export * from "./core/camera.ts";
export * from "./core/gestureMath.ts";
export * from "./core/gestures.ts";
export * from "./core/renderer.ts";
export * from "./core/tileLayer.ts";
export * from "./core/pinAtlas.ts";
export * from "./core/markerLayer.ts";
export * from "./core/vectorLayer.ts";
export * from "./core/pointCloudLayer.ts";

// ---- React layer -----------------------------------------------------------
// The same names `@gamemap/map-engine` exports, so an app can switch engines by
// changing one import. `MapAssets` (core/assets.ts) and `PinTheme` /
// `DEFAULT_PIN_THEME` (core/pinAtlas.ts) are already exported above — the React
// layer re-exports the very same declarations rather than shadowing them.
export type {
  EngineMarker,
  GameMapViewLabels,
  GameMapViewProps,
  GlMapRef,
} from "./react/engineTypes.ts";
export { DEFAULT_MAP_THEME } from "./react/theme.ts";
export type { MapTheme } from "./react/theme.ts";
export * from "./react/cursorStore.ts";
export {
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP,
} from "./react/mapEngine.ts";
export {
  MAX_LABELS,
  collectLabelSources,
  cullLabelSources,
  markerLabelText,
} from "./react/markerOverlay.ts";
export type { LabelSource } from "./react/markerOverlay.ts";
export { default as GameMapView } from "./react/GameMapView.tsx";
export { default as GameMapEmbed } from "./react/GameMapEmbed.tsx";
export type { EmbedPin, GameMapEmbedProps } from "./react/GameMapEmbed.tsx";
