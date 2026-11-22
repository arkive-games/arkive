# Glimmith map handoff

## Resume here

- Working tree: E:/Codex/cangzhou-glimmith, branch codex/glimmith-tutorial. Reuse it for the next slice. Leave the main checkout, existing untracked files, and production alone.
- Preview: http://127.0.0.1:15172/#glimmith/tutorial. Probe the actual Vite page before starting another server. This is a dev-only route; no release is implied by a local commit.
- Last completed slice: ShapeBank, signed commit `7390f56969b7ed0fe2a33cbfd724842c013fe0a9`. Five windows, 136 puzzles, three notes; 1,089 placed puzzles remain. Local preview only; no push or deployment.
- Next slice: audit Precision only (44 source references). Run the inventory helper with the `Precision` key and compare those actor coordinates against the authored Town Main and lower-level submaps before editing the generator. Confirm streaming transforms, the required floor/landscape inputs, and projection bounds. Checkpoint the inventory and export inputs before terrain generation if the slice grows.

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
- The current mesh inventory is %TEMP%/glimmith-mesh-paths.txt and decoded geometry is %TEMP%/glimmith-meshes.json. Hamlet terrain planes are %TEMP%/hamlet-terrain.raw; the Market planes are in %TEMP%/glimmith-market-terrain. Do not store the raw campaign export, game saves, or credentials in the repository.
