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
