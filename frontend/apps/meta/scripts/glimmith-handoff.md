# Glimmith map handoff

## Resume here

- Working tree: E:/Codex/cangzhou-glimmith, branch codex/glimmith-tutorial. Reuse it for the next slice. Leave the main checkout, existing untracked files, and production alone.
- Preview: http://127.0.0.1:15192/#glimmith/tutorial. Port 15172 was occupied by another checkout, so this preview uses a separate Vite process. Probe for the actual map, not just HTTP 200. This is a dev-only route; no release is implied by a local commit.
- Latest state: the local preview contains all 29 windows, 1,225 placed puzzles, and three notes, with all known authored shape pools and text rules. This checkpoint is in the local working tree only.
- Verification limits: `0479` retains one projection-only rock witness. Unlock descriptions were checked against authored data and installed code, not a before-and-after playthrough. No saved progress was written or changed.

## Unified closeout

- Compared all 1,225 original headers and shape definitions; all 235 authored shape pools are present, including 111 newly displayed. All board and solution frames, source and projected coordinates, and window records are unchanged.
- Added the cooked heightmaps for `Zone03_3way`, `Zone03_CastleRoom`, `Zone03_Diff`, and `Zone03_Ineq`; the Castle Room height atlas is 64 by 128 and uses the authored component UV bias. This resolves 14 outstanding footprint checks. The source mesh and placement of `SM_Plant_Tree_Willow_04_B8` supply visible geometry within the existing height and distance checks for `0094`, `1076`, and `1104`. These are render witnesses, not collision or traversal proof. Only `0479` remains projection-only because the adjacent rock's rendered and exported collision heights do not meet the authored anchor. Eight terrain tiles changed.
- The installed PuzzleCounter compares against `silverObjective` before sending category 1 to its direct puzzle prerequisites. All 292 authored `AreaCompletion` puzzles have one owning window, so the drawer shows that window's silver threshold. `FinalBossPuzzle` (`1152`) unlocks `FinalNote`, whose `CompleteCampaign` flag runs the campaign-completion path over 28 ordinary windows. It unlocks category 2 prerequisites in repaired windows; all 171 authored `GameCompletion` puzzles belong to this list. Single-puzzle references send category 0, so solving `0527` alone does not unlock `0054`.
- Reuse `%TEMP%/glimmith-final-terrain.json`. It points to `glimmith-final-all-meshes.json` (previous cumulative mesh export with the Willow LOD and material sections replaced) and `glimmith-extra-zone03-terrain` (indexed BGRA8 planes in four submap directories).
- Desktop and mobile verified `0049`, `0054`, `0236`, and `0094` for shape pools, unlock copy, map rendering, coordinates, and solution display. Verification: 26 focused tests, Meta build, UI guard, and the full frontend suite (193 files / 2,046 tests) passed. No release was attempted.

## Authored text rule checkpoint

- Read fixed area, area bounds, adjacency, and other supported text rules from each original puzzle header, regardless of window. The source audit verified exact metadata for all 1,225 puzzle files. Newly displayed rules appear in 212 puzzles: 109 fixed-area, 70 adjacent-shape, 29 same-shape, 12 one-symbol, and 12 different-shape headers. The earlier cross-map note mislabeled the adjacent-shape omissions as adjacent-size omissions.
- Display the localized rules together above the solution board. Existing dedicated rectangle and adjacent-size fields are not duplicated in the generic flags. All location records, solution frames, shape pools, and generated map graphics are unchanged.
- Desktop and mobile verified fixed area, mixed adjacency, existing area bounds, and a three-rule puzzle. The two-rule sample `1250` fits on one line at 390 pixels; the three-rule sample `1265` wraps to two lines without overlapping the board. Verification: 25 focused tests, Meta build, UI guard, and 193 frontend files / 2,045 tests passed. No release was attempted.

## Cross-map audit checkpoint

- Independently compared all 1,257 authored anchors, all 29 official Chinese window names, thresholds, ordered displayed prerequisite references, and all 1,225 raw boards, solutions, dimensions, and difficulties. The regenerated 108 terrain tiles and two marker SVGs are byte-identical to the preview. Among the 1,225 puzzle markers, 1,207 have direct support witnesses and 18 retain their previously recorded projection-only witnesses.
- The old long-cell regex conflated adjacent numeric edge marks with cell codes on six boards: `0587`, `0589`, `0920`, `1211`, `1268fix`, and `1384`. Use only the authored `U...D...L...R...` grammar with an aligned cell start for Compass expansion. This restores 18 numeric edge clues. All six raw boards now round-trip without any source solution or coordinate changes. The clue regressions pass with 670 differences and 618 inequalities.
- Desktop verified all 29 named choices plus overview, search with leading zeroes, the corrected `0587` board, actual clipboard contents, and local progress persistence and reset. Mobile verified the suffixed `1268fix` query, its restored Palisade and numeric edge clues, actual clipboard contents, and the Perfected Windows map click through Secluded Garden to `1249`. No horizontal overflow. The `0054` unlock message was visible in the web panel; its live game trigger was not tested. The local comment endpoint was offline.
- At this checkpoint, 323 puzzles were missing at least one authored header in the displayed metadata. The omissions were 111 `SHAPE_BANK`, 109 `AREA_EQUALS`, 70 `ADJACENT_SHAPES_DIFFERENT`, 29 `ALL_SHAPES_SAME`, 12 `ONE_SYMBOL_PER_REGION`, and 12 `ALL_SHAPES_DIFFERENT` headers; counts overlap. The extracted board and solution parity check does not imply complete header rendering.
- Verification: 24 focused tests, Meta build, UI guard, and the full frontend suite (193 files / 2,044 tests) passed. No release was attempted.

## Solution vertex clue checkpoint

- Digits 1 through 4 at the intersections count distinct solution regions that touch the intersection, excluding empty and outside cells. The English game localization describes this as counting how many regions touch the clue. A flood fill matched all 1,696 clues across 85 authored boards; 128 clues touch an empty or outside cell and still match when it is excluded.
- `DA_RuleData.RadarIcons` points to `MI_HandDrawnSymbol_Radar1` through `Radar4`, which bind `Puzzles/PuzzleGrid/Textures/T_Symbol_Radar_1` through `Radar_4`. Decode the textures as RGBA, trim transparent margins, and center them on a 96 by 96 transparent canvas. The visible dots, not added numbers, convey the authored count.
- The renderer and audit address these symbols only at character offsets divisible by three on even board rows. Edge symbols retain their previous slots. No map, puzzle board, or solution record changed.
- Desktop `0515` displayed one of each original radar texture. Mobile `1146` displayed 10 vertex clues and 13 edge differences, including zero. Checked authored positions, asset loading, solution border counts, coordinate controls, and no overflow. Verification: 23 focused tests, Meta build, UI guard, and 193 frontend files / 2,043 tests passed. No release was attempted.

## Solution edge clue checkpoint

- The solution renderer now uses the original `T_Symbol_GreaterThan` and `T_Symbol_Difference` textures from `Puzzles/PuzzleGrid/Textures`. Decode them as 512 by 512 RGBA, trim only the transparent margins, and center the artwork on a 96 by 96 transparent canvas. The game-authored grid, solution borders, and map files were not changed.
- Numeric differences use one digit on a vertical separator and a `-digit` pair on a horizontal edge. A zero is a real clue. The separate digits in horizontal row vertex slots are outside this batch. The horizontal `^^` and `vv` pairs encode a single rotated inequality each.
- Flood-fill the authored solutions and compare counts on both sides of each edge; all 652 numeric differences and 618 inequalities match the authored solutions. Desktop `1382` showed all four inequality orientations. Mobile `0914` showed all 38 original numeric clues including zero, with no overflow. Both screenshot checks confirmed original solution borders and loaded source artwork.
- Verification: 22 focused tests, Meta build, UI guard, and the full frontend suite (193 files / 2,042 tests) passed. No release was attempted.

## Secluded Garden terrain checkpoint

- `BeautyCorner_Landscape_7` in `Zone03_Bonus` omits `RelativeScale3D` on its inherited `Default__Landscape.RootComponent0`. The Unreal LandscapeProxy constructor's compatibility default is `128 / 128 / 256`, not the generic scene component's unit scale. This is the only implicit root scale among the currently generated landscape sources. Use each height sample when projecting tilted landscape footprints.
- Reuse `%TEMP%/glimmith-garden-spiral-terrain.json`; no new game exports are required. Regenerate into a temporary directory and copy the scene and terrain tiles 5, 6, 57, and 58. All raw and projected positions, window records, and board and solution records are unchanged. Ten Garden anchors gain the landscape as a support witness; existing witnesses are retained.
- The read-only terrain audit passes all 34 Garden anchors with no exceptions. `1249` and `1149a` now have height-compatible overlapping terrain footprints; the exception for those two markers was removed. Desktop clicked `1249` and mobile clicked `1149a` directly on rendered terrain and opened their source solutions and coordinate controls.
- Verification: 20 focused tests, Meta build, UI guard, and the full frontend suite (192 files / 2,040 tests) passed. No authenticated write or release was attempted.

## Perfected Windows checkpoint

- `BP_StainedGlassPlinth_Glimmith` supplies the world anchor, 28 ordered `windowPrerequisites`, thresholds 10 / 15 / 20, and 34 `puzzleUnlocks`. The unlock list matches Secluded Garden exactly. The zh-Hans localization resolves the actor's `AreaName` using key `C010CDF34FFA7F9A7593F88CC2E1473D` in the empty namespace.
- In the installed Win64 game's native PuzzleCounter logic, the reflected `windowPrerequisites` field (offset `0x230`) counts each referenced window only when its full-completion flag is set. The full-completion flag is set at the sum of all direct puzzle and window prerequisites, separately from the gilding path. The minimum threshold path visits the actor's `puzzleUnlocks` array (offset `0x270`). This confirms the rules in the installed build, not a tested save or playthrough.
- Reused the current terrain manifest. Regeneration into a temporary directory confirmed all 28 prior window records, 1,225 board records, all actor data, and 108 terrain tiles were unchanged. The special marker uses `StainedGlass_SunOnly`, the actor's original glass texture, prepared as an upright transparent icon.
- Desktop and mobile: selected the region, clicked the actual marker, and verified the original artwork, three thresholds, 28-window full-completion count, 34-puzzle unlock, coordinates, comment tab, and 28 prerequisite links. Followed the Watchtower prerequisite on desktop and the Secluded Garden unlock link on mobile; both opened the corresponding ordinary window details. No authenticated write was attempted; the local comment endpoint was offline.
- Verification: 20 focused tests, Meta build, UI guard, and all 2,040 tests across 192 frontend files passed.

## Watchtower checkpoint

- The installed Watchtower plinth references 59 puzzle files with thresholds 16 / 26 / 43. Extract the exact inventory paths from `pakchunk0-WindowsNoEditor.pak`. No new terrain inputs are needed; reuse `%TEMP%/glimmith-garden-spiral-terrain.json`.
- The read-only audit found no missing or malformed puzzles, no anchors outside the canvas, and verified terrain support for all 59 anchors. Generated projection, 108 terrain tiles, existing raw and pixel coordinates, and prior puzzle records are unchanged. The new scene resolves the source unlock reference from `0883` to `0540`; this is not independent runtime trigger verification.
- Desktop and mobile: selected Watchtower, clicked the map window, and verified 59 links and all three thresholds. Opened `0192` (four shape-bank glyphs) on desktop and `1227` (exact area and non-rectangle rule) on mobile. Both showed their solution borders, coordinate and completion controls, and comment tab. Both map viewports rendered visible terrain. Local comment requests could not connect; no authenticated write was attempted.
- Verification: 19 focused tests, Meta build, UI guard, and the full frontend suite (192 files / 2,039 tests) passed. The source inventory reports 1,225 placed puzzles, 1,225 preview puzzles, and zero missing placed puzzles.
- When the support audit passes on an unchanged projection, regenerate into a temporary directory, compare the terrain tiles and existing records, and copy only the new scene data. This avoids churn in the SVG assets.

## Secluded Garden and Spiral checkpoint

- Sources: the Secluded Garden plinth references 34 boards (thresholds 8 / 16 / 25), and the Spiral plinth references 48 (9 / 18 / 32). Both names and all 82 boards come from the installed game. Extract the exact paths returned by the inventory helper from `pakchunk0-WindowsNoEditor.pak`.
- The terrain uses the identity streams `Zone03_Bonus`, `Zone03_Silke1`, and `Zone03_Finale`. The tile grid expands by two rows north and two columns east. All prior raw coordinates, relative positions, and puzzle records were compared unchanged. Garden also uses cooked instance matrices for the round rock meshes; these provide support evidence for `1151` and `1085a`.
- At this checkpoint, `1249` and `1149a` retained their original coordinates and solutions with unverified terrain contacts. The later Secluded Garden terrain checkpoint resolves both without moving the pins.
- The Compass clues on 28 new boards show their directional values on the original textures. The mask order is top, right, bottom, left. Zero is a visible clue, distinct from an empty direction. Inequality and numeric-difference edge glyphs still need rendering work; their source marks remain in the board data.
- Desktop: clicked the Garden map window and opened `0652`; verified the solution, Compass artwork and values, coordinates, completion button, and comment tab. Mobile: chose Spiral, saw the sidebar close without horizontal overflow, clicked the map window, and opened `1148` with the zero Compass clue, coordinates, and completion button. Both map captures were nonblank. The local comment endpoint was offline; no authenticated write was attempted.
- Verification: 18 focused tests, Meta build, UI guard, and 192 frontend test files / 2,038 tests passed.

### Local inputs for this checkpoint

- Use `%TEMP%/glimmith-garden-spiral-terrain.json` with the audit helper. It extends the prior manifest with `bonus: glimmith-Zone03_Bonus-terrain` and `spiral: glimmith-Zone03_Silke1-terrain`; its `meshFile` is `glimmith-next-ten-all-meshes.json`.
- Reproduce the mesh file by adding the two paths in `%TEMP%/glimmith-garden-spiral-mesh-paths.txt` to the preceding export without replacing existing records. The indexed plane lists are `%TEMP%/glimmith-Zone03_Bonus-plane-refs.txt` and `%TEMP%/glimmith-Zone03_Silke1-plane-refs.txt`.
- When nearby static actors do not support a cluster of anchors, inspect local foliage instance transforms as well as independent static meshes. Batch both window lists in one read-only support probe before regenerating terrain.

## Mismatch and Palisade checkpoint

- Mismatch adds 48 puzzles with thresholds 13 / 21 / 37. It uses the identity stream `Zone02_SideIsland2`, five indexed landscape planes, and the placed static meshes.
- Palisade adds 60 puzzles with thresholds 17 / 29 / 48. It reuses Forest Main landscape data and adds `SM_RockBrick_Small_03` from that submap. All 108 new anchors have source geometry witnesses; no new projected exceptions were needed. Existing marker coordinates, canvas projection, and puzzle records were compared unchanged. Only eight terrain tiles changed.
- Five authored `F4` cells have all four borders in the original solutions, matching `EPalisadePattern::FourBorders` and the game's `T_Symbol_Palisade_06` texture. The solution drawer also displays `AREA_EQUALS` as an exact region size for the two new windows.
- Desktop: clicked the Mismatch map window, then opened `0723` and checked the four-border image reference, solution, and coordinate controls. Mobile: selected Palisade, confirmed the sidebar collapsed, clicked its map window, and checked the objectives and exact area on `1020`. Both map screenshots were nonblank. The local comment endpoint was unavailable; no authenticated write was attempted.
- Verification: scoped scene and audit tests (17), Meta build, and full frontend tests (192 files / 2,037 tests) passed.
- Batch the two windows' anchors in one `--probe-support` call. Set `includeCandidates: true` in the probe input to report the four closest height-compatible silhouettes for failures, using world-unit distances. This is diagnostic evidence, not a support result.

## Bricky and Compass checkpoint

- Sources: `BP_StainedGlassPlinth_Bricky` (70 boards, thresholds 15 / 29 / 52, official name `砖纹`) and `BP_StainedGlassPlinth_Compass` (66 boards, thresholds 10 / 23 / 49, official name `罗盘`).
- Geometry: Bricky uses `Zone03_4way`, `Zone03_Radar_2`, and a small `Zone03_3way` connection; Compass uses `Zone03_CastleRoom`. The generator adds non-vegetation static geometry and expands the existing projection canvas to 7 x 10 tiles without changing the rotation, scale, or authored world coordinates.
- Puzzle data: Compass includes long directional clues such as `UDL7R` and `U8D6L5R7`. These are retained in `wideCellClues` while the rendered board stays two-character aligned. Bricky shape banks, area bounds, rectangle flags, and mixed generic rules are read from the source files.
- Support audit: 129 new anchors have nearby geometry witnesses. Seven Bricky/Compass anchors use explicit `projectedSupportMeshes` references where the exported floor outline does not prove overlap; these references are visible geometry, not moved coordinates. Existing `0479`, `1114`, and `0883` references remain separate.
- Browser QA: desktop selected both `砖纹` and `罗盘`, opened `0667` and `1233`, and verified difficulty badges, authored coordinates, rules, shape-bank rendering, and the Compass long-clue solution grid. Mobile reopened `1233` with the sidebar closed and the solution remained aligned. Backend forum requests were unavailable locally, so comments showed the expected retry state; no authenticated write was attempted.
- Verification: generation completed from the installed assets with 19 windows and 775 puzzle markers. 13 Glimmith scene tests, Meta build, UI guard, `pnpm --dir frontend test` (192 files / 2036 tests), and `git diff --check` passed.

## Difference and Hedge Maze checkpoint

- Sources: `BP_StainedGlassPlinth_Difference` (53 boards, thresholds 15 / 24 / 43, official name `差值`) and `BP_StainedGlassPlinth_HedgeMaze` (34 boards, thresholds 17 / 25 / 30, official name `树篱迷宫`).
- Geometry: Difference uses `Zone03_Diff`; Hedge Maze uses `Zone03_HedgeMazeGarden_2`. Both are covered by the existing 7 x 10 projection canvas. Static floors, ruins, rocks, and hedge geometry are included while foliage is excluded.
- Puzzle data: Difference and Hedge Maze retain mixed area bounds, shape banks, rectangle flags, and adjacency rules from the source files. `0914` uses an explicit `SM_Rock_01_cut` projected support reference; existing projected references remain unchanged.
- Browser QA: desktop selected `差值` and `树篱迷宫`, opened `0914`, and verified difficulty, shape bank, rules, solution, and coordinates. Mobile fit the Hedge Maze map without overflow. Backend forum requests were unavailable locally, so comments showed the expected retry state; no authenticated write was attempted.
- Verification: generation completed with 21 windows and 862 puzzle markers. 13 Glimmith scene tests, Meta build, UI guard, `pnpm --dir frontend test` (192 files / 2036 tests), and `git diff --check` passed.

## Inequality and Loopy checkpoint

- Sources: `BP_StainedGlassPlinth_Inequality` (56 boards, thresholds 15 / 26 / 41, official name `不等号`) and `BP_StainedGlassPlinth_Loopy` (58 boards, thresholds 15 / 27 / 46, official name `环纹`).
- Geometry: Inequality uses `Zone03_Ineq`; Loopy reuses `Zone03_3way`. Both fit the existing 7 x 10 projection canvas. Static ruin, floor, rock, and pillar geometry is included while foliage is excluded.
- Puzzle data: both windows retain mixed area bounds, shape banks, rectangle flags, adjacency rules, and generic shape rules. Nine Inequality anchors use explicit projected support references for authored rock, debris, and pillar contacts.
- Browser QA: desktop selected `不等号` and `环纹`, opened `1209`, and verified difficulty, shape bank, rules, solution, and coordinates. Mobile fit the Loopy map without overflow. Backend forum requests were unavailable locally, so comments showed the expected retry state; no authenticated write was attempted.
- Verification: generation completed with 23 windows and 976 puzzle markers. 13 Glimmith scene tests, Meta build, UI guard, `pnpm --dir frontend test` (192 files / 2036 tests), and `git diff --check` passed.

## Solitude and Castle Gates checkpoint

- Sources: `BP_StainedGlassPlinth_Solitude` (37 boards, thresholds 13 / 19 / 30) and `BP_StainedGlassPlinth_CastleGates` (48 boards, thresholds 8 / 19 / 36), with official Simplified Chinese names `独居` and `城堡大门` from the installed LocRes.
- Geometry: `Zone02_SideIsland3` and `Zone02_Finale` identity streams, indexed landscape planes, and the selected non-vegetation static meshes. Stairs, walls, pillars, floors, and rocks are included; `Sphere`, `Plane`, doors, lattice, and foliage are excluded to keep the plan view legible. The authored map projection and all 85 actor coordinates are unchanged.
- Support audit: the original 83 new anchors now resolve against the expanded Zone 3 geometry as well; `1114` and `0883` have nearby source-geometry witnesses without moving their authored coordinates. Existing `0479` remains unchanged.
- Browser QA: desktop selected `城堡大门`, displayed the new castle geometry, searched `1114`, and opened its difficulty-7 solution, authored unlock condition, rules, and coordinate. Backend forum requests were unavailable locally, so the detail panel's comments request showed the expected retry state; no authenticated write was attempted.
- Verification: 12 Glimmith scene tests, `pnpm --filter meta build`, and `git diff --check` passed. The local preview is `http://127.0.0.1:15192/#glimmith/tutorial`.

## Boxy and NonBoxy checkpoint

- Boxy: 40 original boards, thresholds 13 / 20 / 32, and authored `ONLY_RECTANGLES` rule. All 40 markers and solutions are available. The height probe passes 39; `0479` retains its authored anchor with a matching rock footprint in plan view only. Its height remains open after checking nearby source meshes and the `SM_Rock_02` collision hull.
- NonBoxy: 43 original boards, thresholds 14 / 21 / 33, and authored `NO_RECTANGLES` rule. All 43 markers pass the height and footprint check. Preserve the original `0860fix2` identifier; count buttons in the related-puzzles list rather than assuming IDs have four digits and one optional letter.
- Both windows use the game's Palisade textures from the released enum values and `DA_RuleData.PalisadeIcons`. Neither the existing terrain SVGs nor existing anchors or puzzle records changed. The preview retains the same scale, rotation, canvas, and marker tools.
- Desktop: checked all 40 and 43 links, thresholds, solution rules and source icons on `0810` and `0303`. Mobile: selected both regions, verified sidebar collapse and direct map clicks on `0479` and `0807`, and checked solutions, coordinates, completion and comment controls. Pixel samples confirmed nonblank maps in all four viewports. No authenticated write was attempted.
- Verification: focused tests, Meta build, UI guard and the full frontend suite (192 files / 2,034 tests) passed. Boxy has nine AreaCompletion and five GameCompletion entries; NonBoxy has ten and six. Exact runtime triggers remain unverified.

## Boxy preflight checkpoint

- Audit only; no new marker, terrain tile, or solution has been added to the preview. Verified the Simplified Chinese name from the installed LocRes. Thresholds: 13 / 20 / 32. All 40 files were found and inspected; no malformed frames or out-of-canvas anchors were reported.
- All 40 files declare `ONLY_RECTANGLES`; one declares `SHAPE_BANK`. In addition to existing clues the audit found five distinct `F` tokens. The terrain probe checked all 40 anchors using the production generator; only `0479.puz` lacks a nearby support witness. This is not a placement error until the authored geometry is checked.
- One local full audit took 6.56 seconds with the raw inputs present. Regenerating the current preview yielded 38 byte-identical files. The focused tests and full frontend suite (192 files / 2,033 tests) passed.
- Re-run from `frontend/apps/meta` using PowerShell:

      node scripts/glimmith-inventory.mjs "$env:TEMP/glimmith-arkive-source/Geri/Content/AGeri" src/assets/glimmith-scene.json Boxy --audit "$env:TEMP/glimmith-audit-terrain.json"

## SizeSeparation checkpoint

- Source: `BP_StainedGlassPlinth_SizeSeparation`, official Simplified Chinese localization and 45 original files. Thresholds are 14 / 22 / 35. The identity stream `Zone02_Forest_Main_Part2` adds nine landscape components and 21 indexed planes. The local decoder mode is `landscape-planes-indexed`; exports 4014 and 4016 share `Texture2D_0` but their content hashes differ.
- All anchors passed terrain support; `0824` uses `sm_RuinPillar_LargeRoundExtraShortA_Base`. Added one tile row north while preserving prior relative positions, original coordinates, support witnesses and puzzle records. All 45 source boards declare `ADJACENT_SIZES_DIFFERENT`; three declare shape pools.
- Desktop: verified 45 window links and thresholds, plus rule, area range and multi-digit glyphs on `1436`. Mobile: the sidebar closed after fitting; a direct click on `0824` showed its lower bound, solution, coordinate, completion and comment controls. Both viewports passed nonblank map pixel sampling. No authenticated write was attempted.
- Verification: ten scene tests, Meta build, UI guard and the full frontend suite (191 files / 2,030 tests) passed. Eleven puzzles declare AreaCompletion and six GameCompletion; exact runtime triggers remain unverified.

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

The current installed campaign has 1,225 unique placed puzzle file paths, all represented in the local preview. There are 29 named windows, including the not-yet-mapped Perfected Windows with no ordinary prerequisite list. Counts describe the installed campaign export, not every file in the game packages or a player's save.

Run the inventory helper to recompute the counts after a game update or a completed slice:

    node scripts/glimmith-inventory.mjs <AGeri directory> <current glimmith-scene.json> [window key]

The optional key prints only that window's puzzle package paths for selective extraction.

Append `--audit` after the window key for a read-only JSON report. It includes the
official Simplified Chinese name, thresholds, missing or malformed puzzle files,
clue inventory, and unknown or out-of-canvas anchors. A valid JSON report is
not a pass by itself; check the reported issues. The report does not extract
files, update the preview, or validate runtime unlock conditions.

Pass a terrain manifest after `--audit` to probe all valid puzzle anchors using
the same support check as the generator. Without it the terrain status is
`not-requested`; absent or mismatched inputs give `blocked`; `checked` reports
the total tested and all unsupported anchors. Paths are absolute or relative to
the manifest directory. The preceding manifest is
%TEMP%/glimmith-audit-terrain.json. Extend it with the latest checkpoint inputs above:

    {
      "meshFile": "glimmith-next-eight-all-meshes.json",
      "hamlet": "hamlet-terrain.raw",
      "market": "glimmith-market-terrain",
      "town": "glimmith-town-terrain",
      "countryside": "glimmith-countryside-terrain",
      "sideIsland": "glimmith-match-terrain",
      "forestMain": "glimmith-forest-main-terrain",
      "forestFragments": "glimmith-range-terrain",
      "forestPartTwo": "glimmith-size-separation-terrain",
      "sideIsland2": "glimmith-Zone02_SideIsland2-terrain",
      "sideIsland3": "glimmith-Zone02_SideIsland3-terrain",
      "finale": "glimmith-Zone02_Finale-terrain"
    }

## Local inputs

- Installed pak root: E:/SteamLibrary/steamapps/common/The Artisan of Glimmith/Geri/Content/Paks.
- Existing Unreal 4.27 exports: %TEMP%/glimmith-arkive-source/Geri/Content/AGeri. This is disposable; the cooked pak is authoritative.
- Existing local tools: repak-bin/repak.exe in the worktree, plus %TEMP%/glimmith-uasset-reader and %TEMP%/glimmith-mesh-reader. These are not tracked. See glimmith-projection.md for tool roles and required export structure if the cache is missing.
- The Mismatch and Palisade geometry is %TEMP%/glimmith-next-eight-all-meshes.json. Reproduce it from %TEMP%/glimmith-next-six-all-meshes.json with the selected paths in %TEMP%/glimmith-mismatch-mesh-paths.txt and %TEMP%/glimmith-palisade-rockbrick-path.txt. Side Island 2 texture references are listed in %TEMP%/glimmith-mismatch-plane-refs.txt. The extractor appends the monument automatically, so exclude it from input path lists.
- Use %TEMP%/hamlet-terrain.raw and the %TEMP%/glimmith-market-terrain, %TEMP%/glimmith-town-terrain, %TEMP%/glimmith-countryside-terrain, %TEMP%/glimmith-match-terrain, %TEMP%/glimmith-forest-main-terrain, %TEMP%/glimmith-range-terrain, %TEMP%/glimmith-size-separation-terrain, %TEMP%/glimmith-Zone02_SideIsland3-terrain, and %TEMP%/glimmith-Zone02_Finale-terrain directories in that order. Do not store the raw campaign export, game saves, or credentials in the repository.
