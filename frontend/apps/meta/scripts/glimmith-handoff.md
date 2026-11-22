# Glimmith map handoff

## Resume here

- Working tree: E:/Codex/cangzhou-glimmith, branch codex/glimmith-tutorial. Reuse it for the next slice. Leave the main checkout, existing untracked files, and production alone.
- Preview: http://127.0.0.1:15172/#glimmith/tutorial. Probe the actual Vite page before starting another server. This is a dev-only route; no release is implied by a local commit.
- Last completed slice: Mingle, signed commit `5dcacebea9bc23c92dca3af8b9903723ed6a3a13`. Eight windows, 260 puzzles, three notes; 965 placed puzzles remain. Local preview only; no push or deployment.
- Next slice: audit ForestTrailhead only (49 source references). It is the closest unmapped window to the current authored puzzle anchors by the distance check. Run the inventory helper with the `ForestTrailhead` key and compare its anchors with the current terrain and nearby forest streams. Record the official localization, clue syntax, and export inputs before editing the generator. Split the input audit from generation if new terrain is needed.

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
- The base mesh inventory/geometry is %TEMP%/glimmith-mesh-paths.txt and %TEMP%/glimmith-meshes.json. The cumulative geometry through Polyomino is %TEMP%/glimmith-polyomino-meshes.json. Extra package paths are in %TEMP%/glimmith-town-mesh-paths.txt, %TEMP%/glimmith-town-brick-paths.txt, %TEMP%/glimmith-countryside-mesh-paths.txt, and %TEMP%/glimmith-polyomino-mesh-paths.txt. The extractor appends the monument automatically, so deduplicate mesh paths if combining lists.
- Use %TEMP%/hamlet-terrain.raw and the %TEMP%/glimmith-market-terrain, %TEMP%/glimmith-town-terrain, and %TEMP%/glimmith-countryside-terrain directories in that order. Do not store the raw campaign export, game saves, or credentials in the repository.
