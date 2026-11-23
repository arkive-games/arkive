# OSS tile optimization

The initial export uses a 32 by 28 grid of 128 logical-pixel tiles, each
containing a 512-pixel PNG texture. Without a pyramid, even the initial
zoom of -3 requests hundreds of full-resolution textures.

`optimize_tiles.py` composes the effective tiles, including every override,
and writes a lossless WebP pyramid into a separate resource worktree.
Level zero keeps all original texture pixels. Lower levels use smaller
textures for overview zooms. Logical map dimensions, world bounds, markers,
regions, and collection data remain unchanged. The existing shared renderer
selects the appropriate level using `tileLevels`; marker LOD is unrelated.

Run from the repository root with Pillow installed:

```powershell
python tools/apps/oss/optimize_tiles.py --data <source-data> --resources <source-resources> --output-data <data-worktree> --output-resources <resource-worktree>
```

Outputs update only `map-display.json` and `tile-overrides.json` in the data
worktree. Other data files must already be present. Resource output paths
include the composite image hash; old resources are preserved. Always run
against the original export, not a previously optimized data document.

Publish resource changes first, verify the new URLs, and only then publish
data changes. Both artifact repositories have their own PRs and deployment.
An application deployment alone does not activate this optimization.

Verification:

```powershell
cd tools
python -m unittest discover -s tests -p test_oss_tile_optimization.py
```

The test checks exact level-zero pixel preservation, override composition,
overview pixels, stable world bounds and markers, and read-only inputs.
Use `OSS_DATA_DIR` and `OSS_RES_DIR` to point the frontend dev server at the
output worktrees for browser verification on port 15181.

## Ruby goal-floor restoration

`restore_redroom_floors.py` bakes the authored Ruby floor mesh footprints into
every existing pyramid level. It consumes `redroom-floors-26825502.json` from
the data artifact repository, containing world-space triangles, source entity
IDs, mesh and scene hashes, and the material color parameter. Its scope is
`ARCH_Order_RedRoom_Tile_A` using `goal_room_Ruby`, whose `crystal_general`
shader was omitted by the historical ordinary-floor exporters. In Heroes1,
the user-identified instance is centered at world `(83, 93)`.

The flat guide color is the material's linear `color_core`, converted to sRGB
`(173, 0, 19)`. Crystal lighting, fractures, reflections and runtime unlock
state are not reconstructed. No screenshot colors or manually drawn rectangles
are used. Only the source triangle footprints replace existing tile pixels;
other obstacle colors and floors remain unchanged.

Run only in the existing data and resource worktrees:

```powershell
python tools/apps/oss/restore_redroom_floors.py --data <data-worktree> --resources <resource-worktree> --placements <data-worktree>/redroom-floors-26825502.json
```

Resources use content-addressed paths, and old tiles remain available. Publish
resources before the updated override manifest. This adds no runtime layers or
requests. Run `test_oss_redroom_floors.py` to verify world-to-tile projection,
texture density, pyramid coverage, and preservation outside the footprint.

The Heroes1 correction includes Ruby material slots from both border and
corner models, not only the center tile. At `(83, 93)`, the source comprises
one center, four edge and four corner objects. For this local calibration,
`guide_cell` records each source object's unit footprint; the baker renders
flat cells with a thin seam, without copying the crystal border's spikes.
This optional footprint is based on the placed unit models, not a scaled-up
center mesh. The regression test checks all nine cell centers.

Regional prop records may contain an optional resource-relative `icon`.
The first reviewed set contains five static model thumbnails for nine
markers: eight wardrobes and one boulder. Other props use their existing
icons. The accompanying artifact `heroes1-icon-provenance.json` records
source meshes/materials and the approximate shading limitation. Crystal
runtime colors, transparent gates and animated buttons are not covered.

## Ground marker map thumbnails

After changing ground prop icons, run
`python tools/apps/oss/pack_marker_thumbnails.py <props-document> <resource-root>`
in the artifact worktrees. It adds one lossless WebP thumbnail per distinct
resource path to the existing JSON response. The GL map consumes the small
images; detail cards and clients without a thumbnail still use the original
resource URL. Keep HTTP compression enabled for JSON in production.
