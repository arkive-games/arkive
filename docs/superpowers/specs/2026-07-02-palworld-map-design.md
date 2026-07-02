# Palworld Interactive Map — Design

**Date:** 2026-07-02
**Status:** Auto-mode draft (decisions recorded in §3, each overridable at review)
**Scope:** Sub-project 3 of the multi-game platform effort (see
`2026-07-02-multi-game-map-platform-design.md` §2). Depends on sub-project 1
(monorepo + `@gamemap/map-engine` + `@gamemap/data-contract`), which is
complete on branch `worktree-multi-game-map-platform`.

## 1. Goal

Ship a Palworld interactive map as the second consumer of the platform:

1. **Extractor** — transforms the raw Palworld FModel export
   (`E:/SteamLibrary/steamapps/common/Palworld/Exports/Pal/Content/Pal`) into
   contract-v1 data + WebP image artifacts.
2. **Artifacts** — new sibling repos `data-palworld/` (contract-v1 dataset)
   and `resource-palworld/` (tiles + icons), mirroring the AION2
   `data`/`resource` split.
3. **`apps/palworld`** — a new app in the frontend monorepo consuming
   `@gamemap/map-engine` + `@gamemap/data-contract` with zero engine changes.

Success criteria:

- `pnpm validate-data E:/aion2-map/data-palworld` exits 0 (contract v1).
- `apps/palworld` renders both maps with markers positioned correctly
  (calibration verified against known landmarks, §6).
- The AION2 app is untouched and its full gate still passes.
- The map engine gains **no** Palworld-specific code (`check:engine` clean,
  no new engine props needed).

## 2. Source data inventory (verified 2026-07-02)

All paths relative to `E:/SteamLibrary/steamapps/common/Palworld/Exports/Pal/Content/Pal`.

| Source | Content | Count |
|---|---|---|
| `Texture/UI/Map/T_WorldMap.png` | Main world map image, 8192×8192 PNG | 1 |
| `Texture/UI/Map/T_TreeMap.png` | Sakurajima/World-Tree map image, 8192×8192 PNG | 1 |
| `DataTable/WorldMapUIData/DT_WorldMapUIData.json` | World→map bounds per map: MainMap X −1,099,400..349,400, Y −724,400..724,400; Tree X 347,351.5..689,148.5, Y −818,197..−476,400 | 2 rows |
| `Maps/MainWorld_5/PL_MainWorld5.json` | Persistent-level actor exports (179 MB, 31,159 exports, parses in <1 s in Node). POI actors carry `Properties.RootComponent → SceneComponent.RelativeLocation` (verified: 152/152 fast-travel actors have coords) | |
| — `BP_LevelObject_TowerFastTravelPoint_C` | Fast-travel statues (both maps mixed; assign by bounds) | 152 |
| — `BP_LevelObject_UnlockMapPoint_C` | Map-unlock (great eagle) statues | 22 |
| — `BP_DungeonPortalMarker_<Biome>_C` | Dungeon entrances (Grass1/Forest/Desert/Snow/Volcano/Sakura/Viking_C…) | ~141 |
| — `BP_LevelObject_TreasureMapPoint_C` | Treasure-map dig spots | 42 |
| — `BP_LevelObject_Note_C` | Story notes | 15 |
| — `BP_PalMapObjectSpawner_Rock{Copper,Quartz,Coal},Sulfur_C` | Ore/resource nodes | 39/27/23/23 |
| `DataTable/UI/DT_BossSpawnerLoactionData.json` (sic) | Boss spawns with `Location{X,Y,Z}`, `CharacterID`, `Level` | 159 |
| `DataTable/Spawner/DT_PalSpawnerPlacement.json` | Wild-pal spawner placements: `SpawnerName`, `Location`, `StaticRadius`, `WorldName` | ~7,000 |
| `DataTable/Spawner/DT_PalWildSpawner.json` | SpawnerName → pal list (`Pal_N`, `LvMin_N`, `LvMax_N`) | |
| `DataTable/Character/DT_PalMonsterParameter_Common.json` | Pal master data (`Tribe`, `ZukanIndex`, elements, `IsBoss`…) | 753 |
| `DataTable/Text/DT_PalNameText_Common.json` etc. (46 tables) | Display text — **Japanese only** (`SourceString`; no `L10N/` in export) | |
| `Texture/PalIcon/Normal/*.png` | Pal head icons | 827 (incl. NPC/skins) |
| `Texture/UI/InGame/T_icon_compass_*.png` | Compass/map icons (`FTtower`, `dungeon`, `tower`, `camp`, `Teleport`, numbered) — mapping confirmed in `DataTable/UI/DT_LocationUIData.json` | ~40 |

Not used in v1: `DT_PaldexDistributionData.json` (per-pal day/night point
clouds — future per-pal search), region masks (bitmaps, no polygons),
`DT_WorldMapAreaData.json` (name IDs without geometry), oil-rig/dungeon
interior levels, `DT_RespawnPointInfo.json` (no coords).

## 3. Decisions (auto-resolved, overridable)

1. **Extractor in Node (ESM JS), not Python.** Python is not installed in the
   dev environment (verified `command not found`; prior sessions reached the
   same conclusion) while Node 26 is. The raw export is pure JSON — Node's
   home turf — and `sharp` handles PNG tiling + WebP. The extractor lives in
   the `tools` repo as a self-contained `palworld/` directory with its own
   `package.json` (deps: `sharp` only). The Python `aion2/` pipeline is
   untouched.
2. **Tools work happens in a git worktree of the `tools` repo** (workspace
   convention), branch `worktree-palworld-extractor`.
3. **New sibling artifact repos** `E:/aion2-map/data-palworld` and
   `E:/aion2-map/resource-palworld`, initialized as fresh local git repos (no
   remote, no push). Existing `data`/`resource` repos are never touched.
4. **`apps/palworld` continues on the existing monorepo branch**
   `worktree-multi-game-map-platform` (it depends on the unmerged sub-project
   1 packages; one rebase-merge delivers both).
5. **Two maps:** `MainWorld` and `WorldTree`, each 8192×8192, cut into 8×8
   tiles of 1024 px (`tileWidth/Height 1024`, `tilesCountX/Y 8` in
   `maps.json`). POI actors from the shared persistent level are assigned to
   a map by testing which map's world bounds contain them.
6. **Localization: en, zh-CN, zh-TW emitted** (platform languages).
   Game-text-derived names (pal names, dungeon names) are Japanese in all
   three locales — the export contains no other language. Taxonomy labels
   (category/subtype names), map display names, and fixed marker-name
   patterns are hand-authored per language in the extractor's `types.yaml`.
   Recorded limitation; proper names arrive if/when a `.locres` L10N export
   is added (locale files are already per-language, so it's a data-only fix).
7. **No regions in v1.** `regions/<Map>.json` are emitted as empty arrays
   (contract-valid). The only region source is bitmap masks.
8. **No completion tracking, no wiki, no backend** in `apps/palworld` v1.
   Marker `canComplete` is `false` everywhere.
9. **Pal-spawn markers are clustered** at 200 map-px radius (same constant
   and greedy-deterministic algorithm as the AION2 creature pipeline),
   per-spawner-group, to keep ~7,000 placements to a usable marker count.
10. **Boss markers use per-pal icons** (`Texture/PalIcon/Normal`), resolved
    via `CharacterID` → tribe icon; generic boss icon as fallback. Other
    subtypes use compass icons per `DT_LocationUIData` mapping.
11. **Marker `z` is emitted** from actor Z (contract requires it); `tier` is
    omitted (LOD off in the app).

## 4. Architecture

```
Palworld FModel export (read-only)
        │  tools/palworld  (Node: extract.mjs → emit.mjs → tiles.mjs)
        ▼
E:/aion2-map/data-palworld        E:/aion2-map/resource-palworld
  maps.json  types.json             tiles/<MapId>/<MapId>_<XX>_<YY>.webp
  markers/<MapId>.json              icons/<name>.webp
  regions/<MapId>.json (empty)
  locales/{en,zh-CN,zh-TW}/…
        │  HTTP (Vite middleware in dev, CDN in prod)
        ▼
apps/palworld  ──consumes──  @gamemap/map-engine + @gamemap/data-contract
```

### 4.1 Extractor (`tools/palworld/`)

Three stages, one CLI (`node palworld/src/cli.mjs <stage>`), configured by
env `PALWORLD_RAW` (export root), `PALWORLD_DATA_OUT`, `PALWORLD_RES_OUT`:

- **`extract`** — parses the DataTables + persistent level once, writes
  intermediate `parsed/<MapId>.json` (marker candidates with world coords,
  source kind, payload) — mirrors the AION2 extract/emit split so emit
  can iterate without re-parsing 179 MB.
- **`emit`** — world→pixel transform (§6), map assignment by bounds,
  clustering (pal spawns), taxonomy from `palworld/data_src/types.yaml`,
  contract-v1 JSON + locale files into `data-palworld`.
- **`tiles`** — `sharp`: cut the two 8192² PNGs into 64 WebP tiles each
  (quality 90) into `resource-palworld/tiles/<MapId>/`; convert the needed
  compass + pal icons into `resource-palworld/icons/`.

`data-palworld` is validated with the existing
`pnpm validate-data E:/aion2-map/data-palworld` (contract v1 is the shared
gate; no new contract types are needed).

### 4.2 Marker taxonomy (`types.yaml` → `types.json`)

| Category | Subtype | Source | Icon |
|---|---|---|---|
| location | fastTravel | TowerFastTravelPoint actors | `T_icon_compass_FTtower` |
| location | eagleStatue | UnlockMapPoint actors | `T_icon_compass_tower` (verify at impl.) |
| location | dungeon | DungeonPortalMarker actors | `T_icon_compass_dungeon` |
| boss | fieldBoss | DT_BossSpawnerLoactionData rows whose `CharacterID` starts with `BOSS_` (RAID_/arena rows dropped); name "«pal ja name» Lv.«Level»" | pal icon, fallback `T_prt_map_BossIconFrame` |
| collectible | treasureMap | TreasureMapPoint actors | compass icon chosen at impl. |
| collectible | note | Note actors | compass icon chosen at impl. |
| resource | copper / quartz / coal / sulfur | PalMapObjectSpawner_Rock* actors | compass/item icon chosen at impl. |
| pal | palSpawn | DT_PalSpawnerPlacement ⋈ DT_PalWildSpawner, clustered 200 px; name = distinct pal ja names in cluster (popup lists pals + level ranges via localized description) | `T_icon_compass_16` or similar |

Marker ids: `<MapId>-<subtype>-<n>` (stable ordering by source key then
coordinates, matching the AION2 convention of deterministic output).

### 4.3 `apps/palworld`

A deliberately small app (no router, single map screen):

- **Stack:** React 19, Vite (same rolldown-vite override), Tailwind v4,
  i18next (en/zh-CN/zh-TW, language detector + `ja` fallback not needed —
  game text is embedded in the data files), `@gamemap/map-engine`,
  `@gamemap/data-contract`.
- **Data loading:** fetch `maps.json`, `types.json`, per-map
  `markers/regions` + locale overlays from `VITE_DATA_BASE_URL` (dev: Vite
  middleware serving `E:/aion2-map/data-palworld` at `/data`, same pattern as
  aion2's `dataRepoProxy`).
- **Assets:** `palworldAssets: MapAssets` — `tileUrl` →
  `<res>/tiles/<MapId>/<MapId>_<XX>_<YY>.webp`, `markerIconUrl` →
  `<res>/icons/<name>.webp` (dev middleware serves `resource-palworld` at
  `/palres`).
- **Theme:** `palworldTheme: MapTheme` — spread of engine defaults with a
  Palworld accent (decided at impl., single file).
- **UI:** top bar (map switcher for the two maps + language switcher),
  left sidebar with category/subtype checkboxes (visibility state in
  `useState`, no persistence in v1), engine `GameMapView` with
  `renderPopupContent` showing name (+ pal list for `palSpawn`).
- **e2e:** Playwright smoke suite (own `playwright.config.ts`, port ≠ 5173):
  map renders tiles, a known fast-travel marker is present at expected px,
  toggling a subtype hides its markers, map switch swaps tile URLs.

Root scripts gain `--filter palworld` variants (`dev:palworld`,
`build:palworld`, `e2e:palworld`); existing aion2 scripts unchanged.

## 5. Data flow contract additions

None. Contract v1 (maps/types/markers/regions/locales) already covers
everything emitted. This is the point of the platform: sub-project 3 is
purely additive — a new producer (tools/palworld) and a new consumer
(apps/palworld) of the existing contract.

## 6. Coordinate transform & calibration

Linear map from `DT_WorldMapUIData` world bounds to the 8192² pixel grid,
same shape as AION2's `WorldMapTransform`:

```
u = (w_a - min_a) / (max_a - min_a)      # a, b ∈ {X, Y} — axis order TBD
px = u * 8192 ;  py analogous, each axis optionally flipped
```

The axis order and flips (`px_from ∈ {X,Y}`, `flip_x`, `flip_y` — 8
combinations) are **not assumed**: UE's X-forward/Y-right convention often
renders as px=Y, py=−X. Calibration step (mirrors the AION2 process):
extractor ships a `calibrate` stage that renders all fast-travel points onto
a downscaled copy of `T_WorldMap.png` for each plausible orientation;
the correct one is confirmed against ground-truth landmarks (the fast-travel
statue layout is instantly recognizable: e.g. the dense starter-area cluster
SW, tower statues adjacent to the five tower map badges). The chosen
`Orientation` is committed as constants with a comment recording the
verification date + landmarks, per map (both maps re-verified
independently).

`GameMapMeta` per map: `tileWidth: 1024, tileHeight: 1024, tilesCountX: 8,
tilesCountY: 8` (engine derives the 8192 pixel space; engine's single
Y-flip convention is already handled app-agnostically).

## 7. Testing

- **Extractor:** vitest (Node env) in `tools/palworld`: transform round-trip
  + orientation lock (golden px for 2-3 known statues once calibrated),
  clustering determinism (same input → same ids), map-assignment bounds
  test. Run via `node --test`-style vitest standalone in the tools repo.
- **Dataset:** `pnpm validate-data E:/aion2-map/data-palworld` (contract
  gate) + spot asserts in extractor tests (counts per subtype match §2).
- **App:** `tsc -b` clean; Playwright smoke (§4.3); `pnpm check:engine`
  still clean (proves no engine leakage); full aion2 gate re-run once at the
  end (monorepo regression check).

## 8. Risks & future work

- **Japanese-only names** (decision 6) — cosmetic, data-fixable later via
  locres export; UI chrome is fully localized.
- **Orientation assumption wrong** — mitigated by the calibration stage
  being a first-class pipeline step, not a one-off.
- **Pal-spawn marker density** — if clustering still yields an unusable
  count, raise radius per-subtype in `types.yaml` config (extractor knob,
  no code change).
- Future: per-pal spawn search (PaldexDistribution), region polygons from
  masks (contour tracing), oil rigs/raids, item/tech wiki, backend
  multi-tenancy (sub-project 2).
