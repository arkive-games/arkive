# Palworld Dungeon Layout Visualization — Design

**Date:** 2026-07-15 · **Mode:** auto (user directive: "run in auto mode" — design decisions
made autonomously and recorded here instead of interactive Q&A).

## Goal

Every random-dungeon interior layout (World Partition data-layer variant, e.g.
`Dungeon_Random_Forest_01_04`) gets its own page: a top-down 2D plot of all gameplay-relevant
spawn points — boss-reward points by tier, enemy spawn points by rank, chest points, exits,
the boss-unlock wall, and gatherables. A layout gallery on the dungeon detail page links to
the per-layout pages.

## Background (derived 2026-07-15, see memory `palworld-dungeon-loot-chain`)

- Each grid file `Maps/MainWorld_5/PL_MainWorld5/_Generated_/MainGrid_*_DL<hash>.json` is one
  dungeon layout. The persistent level `PL_MainWorld5.json` (179 MB) joins hash → layer name:
  `WorldPartitionRuntimeLevelStreamingCell.DataLayers` → `DataLayerInstanceWithAsset` GUID →
  `DataLayerAsset'Dungeon_Random_<Family>_<variant>'`.
- Layer family ↔ `SpawnAreaId` is 1:1 (`Grass`→Grass001, `Grass_02`→Grass002,
  `Forest_01`→Forest001, `Forest_02`→Forest002, `Dessert_01`→Dessert001,
  `Volcano_01`→Volcano001, `Snow_01`→Snow001, `Island_01..03`→Island001..003,
  `Sakura_01`→Sakura001, `Viking_01`→Viking001, `Yakushima_01`→Yakushima001,
  `Skyland_01`→Skyland001; `Test` family skipped).
- 151 layouts carry dungeon actors. Reward points: 293 world-wide, all in these files.

## Approaches considered

1. **Static SVG plots baked by tools** (image per layout) — no frontend logic, but loses
   interactivity (tooltips, category toggles, i18n labels) and bloats the resource repo.
2. **Emit point data as JSON; render client-side SVG** ← **chosen**: one small artifact,
   frontend renders interactively; consistent with every other dataset in the app.
3. Full Leaflet map with floor imagery — no floor textures are practically extractable
   (interiors are static-mesh soup); overkill. Rejected.

## Data artifact — `data-palworld/dungeon-layouts.json`

Emitted by a new tools stage `tools/apps/palworld/dungeon_layouts.py`
(run: `uv run python -m palworld.dungeon_layouts`). Shape:

```jsonc
{
  "layouts": [
    {
      "dungeon": "Forest001",       // SpawnAreaId (join key into dungeons.json)
      "variant": "04",              // layer suffix, page id = dungeon + variant
      "points": [
        // world-space cm, rounded to int; frontend normalizes to bounds
        { "kind": "reward", "sub": "easy|medium|hard|bonus", "x": 0, "y": 0, "z": 0 },
        { "kind": "enemy",  "sub": "normal|floor2|floor3|floor4|midBoss|fishing|monster|human|boss|base" },
        { "kind": "chest",  "sub": "normal|special" },  // interior chest points (special = tech-book)
        { "kind": "exit" },                              // DungeonExit / PortalV2_Exit
        { "kind": "bossDoor" },                          // UnlockableWall_DefatBoss
        { "kind": "gather", "sub": "coal|copper|sulfur|quartz|stone|mushroom|crystal|lotus|junk|fishing" }
      ]
    }
  ]
}
```

Emitter mechanics:
- Parse `PL_MainWorld5.json` once (plain `json.loads`; ~2 GB peak, acceptable one-shot).
- Only open grid files whose DL hash maps to a `Dungeon_Random_*` layer (~151 of ~10 000).
- Point = actor of a mapped `Type`; position from its `RootComponent` → component object in
  the same file → `RelativeLocation` (placed actors: world space). Reward tier from the
  actor's `RewardSpawnerType` property; **absent property = `Easy01`** (native CDO default).
- Actor-type → kind/sub mapping is an explicit table in the module (mirrors `_RANK_KEY`
  conventions in `dungeons.py`). Unmapped `BP_Dungeon*SpawnerPoint*` types fail loudly
  (assert) so new game updates surface instead of silently dropping.
- Sanity check: warn if a layout's XY bounding box exceeds 200 000 units (would indicate a
  layer reused at several world locations, breaking the single-plot assumption).

## Frontend (palworld app)

- **`src/lib/dungeonLayouts.ts`** — types mirroring the artifact, cached loader
  (`loadDungeonLayouts()`, no locale dimension), helpers: `layoutsByDungeon()`,
  `layoutBounds(points)`, `pointCounts(points)`.
- **Route `/dungeons/$id/layouts/$variant`** → `DungeonLayoutPage`:
  - Header: dungeon name + "Layout <variant>", prev/next variant nav, back to dungeon.
  - SVG top-down plot, viewBox fitted to point bounds (+5 % padding), Y **not** flipped
    (matches map-image convention). Fixed aspect, `max-h` constrained. Scale bar (50 m,
    100 UE units = 1 m).
  - Marker per point: shape+color per kind (reward = diamonds tinted per tier, boss enemy =
    large ring, enemies = dots, chests = squares, exit = triangle, bossDoor = bar, gather =
    faint dots) with a `<title>` tooltip. Colors from the app's chart-ish tokens; sizes in
    viewBox units scaled from bounds.
  - Legend with per-category counts; clicking a legend row toggles that category.
  - Categories with zero points are omitted.
- **Dungeon detail page** — new "Layouts" `CatalogSection`: grid of variant cards
  (variant number, point-count chips for reward tiers/enemies/chests) linking to the layout
  pages. Data loads lazily with the existing bundle Promise.all.
- **i18n**: new `dungeon.layout.*` keys in every locale file (en-US authored; other locales
  get the game-term-appropriate translations, CJK included — no invented pal/item names
  involved, so plain UI translation is fine).
- Typography follows the Tailwind scale rule (no hard-coded px).

## Testing

- **tools**: `tests/test_dungeon_layouts.py` — runs the emitter against the real export
  (same pattern as `test_dungeons.py`): asserts ≥ 150 layouts, Forest001 has 15 variants,
  Forest001 variant 04 has 8 easy + 3 medium + 1 hard + 1 bonus reward points, every point
  has int coords, every layout has ≥ 1 exit or boss point.
- **frontend**: `dungeonLayouts.test.ts` unit tests for bounds/counts helpers with a tiny
  fixture; typecheck + existing checks. Live verification on the dev server (port 15174)
  with a screenshot after rebase-merge, per workspace conventions.

## Error handling

- Loader failures render the shared `loadError` state (same as detail page).
- Unknown dungeon/variant in the route → `CatalogNotFound` back-link.
- Emitter raises on missing env (`PALWORLD_RAW`, `PALWORLD_DATA_OUT`) per tools convention.

## Out of scope (YAGNI)

- Floor separation / Z-slicing UI for the multi-floor collab dungeon (single top-down plot
  with everything is still legible; revisit if users ask).
- Rendering interior geometry (static meshes) or minimap imagery.
- Per-point loot expansion on the layout page (the dungeon detail page already covers pools).
