# Glimmith map handoff

## Resume here

- Working tree: E:/Codex/cangzhou-glimmith, branch codex/glimmith-tutorial. Reuse it for the next slice. Leave the main checkout, existing untracked files, and production alone.
- Preview: http://127.0.0.1:15172/#glimmith/tutorial. Probe the actual Vite page before starting another server. This is a dev-only route; no release is implied by a local commit.
- Last completed slice: Range, signed commit `b438787b3d0fe8ae078f2cc0b2490aad8b000d81`. Twelve windows, 426 puzzles, three notes; 799 placed puzzles remain. Local preview only; no push or deployment.
- Next slice: audit SizeSeparation only (45 source references), the closest remaining window to the mapped anchors by the distance check. Run the inventory helper with the `SizeSeparation` key. Check the original clue syntax, localization, and authored positions before enabling any new terrain. Review cached Zone02 availability first and checkpoint the inputs if the export grows.

## Range checkpoint

- Source: `BP_StainedGlassPlinth_Range`, installed Simplified Chinese localization, and 46 original files. Thresholds are 14 / 22 / 37. All anchored puzzles pass the terrain support check. Forest Fragments has an identity stream transform; the projection includes seven landscape components and fourteen planes, plus selected source planks, platforms, rocks and masonry.
- The existing canvas and projection were preserved. Verified that all existing puzzle records, positions and prior support witnesses remain intact. The Range solution panel displays the authored upper and/or lower area values without altering the grid or solution edges.
- Desktop: clicked the window, counted 46 links, checked thresholds, and verified the paired bound and shapes on `0779`. Mobile: the sidebar closed after fitting, and a direct click on `0286` showed its lower bound, solution, coordinate, completion, and comment controls. Both viewports passed nonblank map pixel sampling. No authenticated write was attempted.
- Verification: nine scene tests, Meta build, UI guard, and the full frontend suite (191 files / 2,029 tests) passed. Eleven puzzles declare AreaCompletion and six GameCompletion; exact triggers remain unverified.

## AreaNumber checkpoint

- Source: `BP_StainedGlassPlinth_AreaNumber`, its installed Simplified Chinese localization, and 43 original puzzle files. Thresholds are 14 / 21 / 34. All new anchors pass the nearby-height support check. Forest Main now includes all fourteen landscape components, 35 referenced planes, and the selected authored rock, masonry, and walkway meshes instead of only the entrance clearing.
- The tile grid grew one column east and one row north. Existing map points and terrain translated together by one tile north-origin offset; verified old raw coordinates, relative placement, previous support evidence, and existing puzzle records. The regular plinth base overlap check now keeps edge witnesses even when another surface supports a marker center.
- Numeric cells show their authored values without padding. Four AreaNumber puzzles also show their source shape pool. Desktop: opened the map window, verified 43 links and thresholds, and checked the numeric, shape, and equal-relation clues on `1101`. Mobile: region fitting closed the sidebar; direct click on `0335` showed the solution and standard coordinate, completion, and comment tools. Both map viewports passed nonblank pixel sampling. No authenticated write was attempted.
- Verification: eight scene tests, Meta build, UI guard, and the full frontend suite (191 files / 2,028 tests) passed. Ten AreaNumber puzzles declare AreaCompletion and six GameCompletion; exact triggers remain unverified.

## Match checkpoint

- Source: `BP_StainedGlassPlinth_Match`, the installed Simplified Chinese localization, and 28 original boards. The thresholds are 9 / 13 / 22. All new anchors passed the nearby-height support check. `Zone02_SideIsland` has an identity stream transform; it uses one landscape component and three planes, plus the authored rock and brick meshes.
- The northern island edge fell slightly outside the previous bounds, so the canvas grew one row north. Prior anchors translated with the terrain by one tile; raw coordinates, relative positions, scale, rotation, existing boards and solutions were verified unchanged. The regular puzzle plinth footprint fallback confirmed `0319` overlaps `SM_Rock_01_cut` using the authored rotation and half-scale plinth, without changing the tolerances.
- Six Match boards show their authored shape pools. Desktop: clicked the map window, verified 28 links and thresholds, and confirmed the three shape glyphs on `0353`. Mobile: the sidebar closed after fitting and a direct click on `0319` displayed its solution and coordinate, completion and comment controls. Both projections passed nonblank pixel sampling. No authenticated write was attempted.
- Verification: seven scene tests, Meta build, UI guard, and the full frontend suite (191 files / 2,027 tests) passed. Seven Match puzzles declare AreaCompletion and four GameCompletion; their runtime triggers remain unverified.

## ForestTrailhead checkpoint

- Source: `BP_StainedGlassPlinth_ForestTrailhead`, its official Simplified Chinese localization, thresholds 8 / 18 / 34, and 49 original puzzle files. All 49 anchors passed terrain support. Countryside and Town already support 48. The new Forest Main entrance clearing supports `0230` on `Brick_Circle_01_SM` and `sm_RuinSetPiece_CircularA`.
- Extended the tile grid one column to the right without changing the origin, rotation, scale, old puzzle coordinates or existing solution records. Only the local Forest Main entrance mesh footprints are included, not its landscape or interior. Forest Main has an identity streaming transform.
- Eight boards show their authored shape pools. `0253` uses the existing multi-digit cell parser; its three wide IDs rendered in the desktop browser. Fourteen puzzles declare AreaCompletion and ten GameCompletion; exact triggers remain unverified.
- Desktop: opened the map window, verified all 49 links and thresholds, then opened `0253`. Mobile: region fitting closed the sidebar and direct click on `0230` showed its solution and the standard coordinate, completion, and comment controls. Both projections passed nonblank pixel sampling. No authenticated write was attempted.
- Verification: six scene tests, Meta build, UI guard, and full frontend suite (191 files / 2,026 tests) passed.

## Mingle checkpoint

- Source: `BP_StainedGlassPlinth_Mingle`, its Simplified Chinese name from the installed localization, and 41 files from the game. All 41 anchors passed the existing height/footprint check. Existing coordinates, puzzle records and all terrain SVGs were compared unchanged. Registering Mingle resolves one previously omitted authored unlock reference; it does not establish the runtime condition.
- Window thresholds: 12 / 20 / 31. On desktop, clicked the map window, counted 41 links, and viewed the large `1435` solution. On mobile, selecting the region closed the sidebar; clicked `1066` directly and followed the window's `0080` link. Verified both bank glyphs for each representative bank puzzle and the standard coordinate, completion and comment controls. Both map viewports passed nonblank pixel sampling.
- The generator preserves multi-digit shape IDs by cell index (`1435` and `0331`). The renderer shows the shape pool on the 25 Mingle boards that declare one. Existing regions' shape pool displays were left unchanged and can be reviewed separately. Nine Mingle puzzles declare AreaCompletion and six GameCompletion; exact triggers remain unverified.
- Verification: five focused scene tests, Meta build, UI guard, and the full frontend suite (191 files / 2,025 tests) passed. No authenticated write was attempted.

## Polyomino checkpoint

- Source: `BP_StainedGlassPlinth_Polyomino`, its Simplified Chinese localization entry, and 39 puzzle files from the installed game. Window thresholds are 13 / 20 / 31. The original 39 sets of puzzle clues resolve to `SHAPE` definitions within the same files; the SVG draws the shape cells in their authored orientation.
- Added the three Town Main brick-wall mesh types to the projection. They supply nearby-height support for `1049` and `1245`; all 39 new anchors passed the existing footprint rule. No streaming map or projection origin changed. Prior anchors, boards, and solutions match the previous scene.
- Desktop: clicked the map window, counted 39 links, verified thresholds, and opened `0379`. Mobile: area selection closed the sidebar, and tapping `0379` directly showed the solution. Verified visible shape glyphs, solution borders, and shared tools; no authenticated write was attempted. Both map viewports passed nonblank pixel sampling.
- Verification: four focused scene tests, Meta build, UI guard, and full frontend suite (191 files / 2,024 tests) passed. Nine puzzles declare AreaCompletion and five GameCompletion; exact triggers remain unverified.

## Precision checkpoint

- Source: `BP_StainedGlassPlinth_Precision` and 44 puzzle files from the installed game. Window thresholds are 12 / 20 / 35. The three added submaps have identity streaming transforms. All markers passed the same nearby-height footprint check as earlier regions.
- The map extends upward by 1,024 projection pixels without changing rotation, scale, or raw coordinates. Existing anchors have the same relative positions, and all previously generated boards and solutions were compared unchanged.
- Start with the existing landscape and authored mesh transforms. Check adjacent streamed submaps if the nearest candidates are implausibly far away: `1127` is supported by wooden planks in Countryside, and `1441b` and `1442` use ground bricks from `BP_Ground_Bricks` instance/template transforms. Lower Town markers `0140` and `0110` use brick floors/rock meshes near Z = -115.
- Desktop: opened the window from the canvas, checked all 44 links and thresholds, and opened the solution for `0140`. Mobile: area selection collapsed the sidebar and fitted the map; direct click on `0070` showed its source solution, difficulty and standard coordinate/completion/comment controls. No authenticated write was attempted.
- Verification: three focused scene tests, Meta build, UI guard, and the full frontend suite (191 files / 2,023 tests) passed. Eleven Precision puzzles declare AreaCompletion and six GameCompletion; exact runtime triggers and traversal between projected floors remain unverified.

## ShapeBank checkpoint

- Source: `BP_StainedGlassPlinth_ShapeBank` in `Overworld_Campaign`, `Zone01_Market1`, its 11 cooked landscape planes and walkway meshes, and the 32 original puzzle files. Reproduction command and data contract are in glimmith-projection.md. All 32 authored puzzle anchors passed the nearby-height footprint check; 12 generated files matched on regeneration.
- Desktop (1440 x 1000): selected the region, clicked its map window, verified its 32 linked puzzle IDs and thresholds (8 / 14 / 23), opened a linked solution, and directly clicked a map puzzle. Coordinate, completion, and comment/image controls are present; no authenticated write was attempted.
- Mobile (390 x 844): selecting the region closed the sidebar and fitted the map to the viewport. The map window opened and its `0235` link showed the source solution, coordinate, and completion controls.
- Verification: 191 files / 2,023 tests passed for the data and terrain stage. After the game-specific unlock copy correction, the three focused tests, Meta build, and the affected desktop/mobile browser flows passed.
- Remaining unlock audit: eight ShapeBank puzzles declare AreaCompletion and six declare GameCompletion. The UI shows the authored category. `0236` and `0949` were verified in the browser; only `0054` retains the opening-ship instructions. Resolve the exact runtime trigger separately: `PuzzleTutorialCube4` (FourWindows) references all 14, and ShapeBank also references `0948`, `0124`, and `0237`. These references alone do not establish the condition. Do not claim save or playthrough verification.

## Work in small batches

1. Map a single window and its authored puzzles; split larger windows into separate data and terrain/browser checkpoints if needed. Do not paste full cooked scenes or puzzle dumps into the working context.
2. Work outward from already mapped geometry. After ShapeBank, audit Precision, Polyomino, and Mingle individually against Town Main and its lower level; then take one nearby campaign window at a time. Treat Perfected Windows and final cross-map verification as separate slices.
3. For each slice, check the installed package, source puzzle files, and authored window references. Preserve raw coordinates, puzzle IDs, solution borders, recognizable in-game artwork, and the existing detail and comment tools. Layout-only changes never disable tools.
4. Before starting another slice, record the signed commit, coverage, source inputs, verification result, unresolved gaps, and exact next action in this file. Distinguish source findings, implementation, browser confirmation, and release state. Do not mark source inventories or partial exports as a playable region.

## Coverage audit

The current installed campaign has 1,225 unique placed puzzle file paths, all referenced by one or more named windows. There are 29 named windows, including Perfected Windows with no ordinary prerequisite list. At the starting point, 1,121 placed puzzles are outside the preview. Counts describe the installed campaign export, not every file in the game packages or a player's save.

Run the inventory helper to recompute the counts after a game update or a completed slice:

    node scripts/glimmith-inventory.mjs <AGeri directory> <current glimmith-scene.json> [window key]

The optional key prints only that window's puzzle package paths for selective extraction.

## Local inputs

- Installed pak root: E:/SteamLibrary/steamapps/common/The Artisan of Glimmith/Geri/Content/Paks.
- Existing Unreal 4.27 exports: %TEMP%/glimmith-arkive-source/Geri/Content/AGeri. This is disposable; the cooked pak is authoritative.
- Existing local tools: repak-bin/repak.exe in the worktree, plus %TEMP%/glimmith-uasset-reader and %TEMP%/glimmith-mesh-reader. These are not tracked. See glimmith-projection.md for tool roles and required export structure if the cache is missing.
- The base mesh inventory/geometry is %TEMP%/glimmith-mesh-paths.txt and %TEMP%/glimmith-meshes.json. The cumulative geometry through Range is %TEMP%/glimmith-range-meshes.json. Extra package path lists have the `glimmith-*-mesh-paths.txt` naming pattern for Town, Town Brick, Countryside, Polyomino, Forest Trailhead, Match, Area Number, and Range. The extractor appends the monument automatically, so deduplicate mesh paths if combining lists.
- Use %TEMP%/hamlet-terrain.raw and the %TEMP%/glimmith-market-terrain, %TEMP%/glimmith-town-terrain, %TEMP%/glimmith-countryside-terrain, %TEMP%/glimmith-match-terrain, %TEMP%/glimmith-forest-main-terrain, and %TEMP%/glimmith-range-terrain directories in that order. Do not store the raw campaign export, game saves, or credentials in the repository.
