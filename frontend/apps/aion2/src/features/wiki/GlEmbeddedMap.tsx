// Lazy boundary for the engine's embedded mini-map, the wiki-side sibling of
// features/map/GlMapView.
//
// Most wiki pages show no map at all: only a quest or an NPC with POIs does. A
// static import would put the engine in the wiki route's chunk, so EVERY wiki page
// would wait on ~600 KB of three.js before it settled — and it measurably did,
// turning a layout assertion on the wiki header into a flaky race.
//
// The CSS import lives HERE for the same reason it does in GlMapView: that is what
// makes Vite emit it as part of the lazy chunk rather than the entry stylesheet.
import { GameMapEmbed } from "@gamemap/map-engine-gl";
import "@gamemap/map-engine-gl/engine-gl.css";

export default GameMapEmbed;
