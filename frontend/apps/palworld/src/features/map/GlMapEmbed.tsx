// Lazy boundary for the engine's embedded mini-map, the sibling of GlMapView.
//
// This one is NOT optional. palworld's `main.tsx` imports every page component
// statically, so a page that imports the engine directly drags all ~1.5 MB of
// three.js into the ENTRY chunk — measured: 1.8 MB entry with the engine in its
// own 604 KB chunk becomes a 2.1 MB entry with an 8 KB chunk, i.e. every visitor
// downloads and parses the 3D renderer just to read a Paldeck page.
//
// Routing the three embeds (pal spawns, region loot, dungeon entrances) through
// `lazy()` here puts the engine back in a fetched-on-demand chunk, which they
// share with the map route's own GlMapView boundary.
//
// The CSS import lives HERE for the same reason it lives in GlMapView: that is
// what makes Vite emit it as part of the lazy chunk instead of the entry
// stylesheet. Every rule in engine-gl.css is scoped to a `gmgl-` class.
import { GameMapEmbed } from '@gamemap/map-engine-gl'
import '@gamemap/map-engine-gl/engine-gl.css'

export default GameMapEmbed
