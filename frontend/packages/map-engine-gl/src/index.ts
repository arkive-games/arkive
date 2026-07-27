// @gamemap/map-engine-gl — game-agnostic WebGL (three.js) map engine.
//
// Feature parity target: @gamemap/map-engine (Leaflet), same injection
// contracts. `src/core/` stays framework-free and DOM-free so the same core can
// later drive a WeChat mini-program canvas; the React layer (added in a later
// task) is the only part allowed to touch the DOM.
//
// Component chrome will be styled by the static stylesheet
// `@gamemap/map-engine-gl/engine-gl.css`, which the consuming app imports once.
export * from "./core/types.ts";
export * from "./core/coords.ts";
export * from "./core/camera.ts";
