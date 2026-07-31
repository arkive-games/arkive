// Lazy boundary for the WebGL (three.js) map engine — the default engine, with
// Leaflet as the alternative (see lib/mapEngineChoice).
//
// three r185 + its fat-line addon + earcut are ~1.5 MB of JS that ONLY the map
// route needs; a static import puts all of it in the entry chunk, so even a
// visitor who only opens the changelog would download and parse it. MapPage
// pulls this module in with `lazy()` instead, which moves the engine — and, via
// the stylesheet import below, its CSS — into a chunk fetched on demand (and
// never at all by a visitor who picked Leaflet).
//
// The CSS import lives HERE rather than in main.tsx on purpose: that is what
// makes Vite emit it as part of the lazy chunk instead of the entry stylesheet.
// It therefore lands in the cascade AFTER `index.css`, but nothing changes as a
// result: every rule in engine-gl.css is scoped to a `gmgl-` class, and the app
// itself defines no `gmgl-` rules.
import { GameMapView } from '@gamemap/map-engine-gl'
import '@gamemap/map-engine-gl/engine-gl.css'

export default GameMapView
