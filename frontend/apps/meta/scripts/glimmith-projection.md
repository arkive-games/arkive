# Glimmith tutorial projection

The local preview uses cooked Unreal 4.27 scene data from the installed game. No reference screenshots are used by the map or its markers.

- Export `OverworldMap`, `Overworld_Campaign`, `Welcome`, `Zone01_Intro_Bridge`, and `Zone01_Intro_Gate_Revised` as UAssetAPI JSON, alongside the corresponding packages under the original AGeri paths.
- Export the selected submap static meshes using CUE4Parse. The mesh JSON is keyed by imported object name. Each record has `vertices` as local-space XYZ triples from the first readable LOD, and `indices` as a flat triangle index array for `SM_Scroll_001` and `SM_Plinth_V004`. Other meshes need only vertices.
- Run `node scripts/project-glimmith.mjs <AGeri directory> <assets directory> <mesh JSON>` with the seven original puzzle files referenced by the selected tutorial actors. Puzzle file references come from the campaign exports.

The opening view is rotated 59 degrees counterclockwise from the previous axis-aligned view to match the direction of travel in the reference view. It remains a plan view, not a recreation of the gameplay camera. Terrain and actor anchors use the same rotation. Raw XYZ values are preserved for reference.

The marker art is a simplified orthographic rendering of the blueprint's scroll and plinth meshes, not a reproduction of the game's material shading. Map contours are convex projections of selected meshes, not a full terrain or collision reconstruction. The script rejects any included marker whose anchor falls outside the projected contours near its height. In particular, Tutorial-1 is over `sm_RuinSetPiece_CircularA`, which the earlier floor-only projection excluded.
