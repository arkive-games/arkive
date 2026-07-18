
## Palworld pipeline

Transforms the raw Palworld UE export into the `data-palworld/` + `resource-palworld/`
artifact repos. Paths come from `tools/.env` (no defaults — see `apps/palworld/env.py`):
`PALWORLD_RAW` (export root `…/Content/Pal`), `PALWORLD_DATA_OUT`, `PALWORLD_RES_OUT`.

Each stage is a standalone module run with `uv run python -m palworld.<stage>` from the
`tools/` dir. Run order matters — `catalog` reads `pals.json` (drop inversion) and
`dungeons.json`/`recycler.json` (source stamping), and `maps emit` reads a fresh
`parsed.json` (regenerate it via `maps extract` first, or regions are dropped):

```bash
uv run python -m palworld.encyclopedia   # then catalog's deps below
uv run python -m palworld.dungeons
uv run python -m palworld.recycler
uv run python -m palworld.catalog         # items/buildings/tech/merchants (+ item_sources)
uv run python -m palworld.breeding
uv run python -m palworld.quests
uv run python -m palworld.fishing
uv run python -m palworld.basecamp
uv run python -m palworld.effigies
uv run python -m palworld.research
uv run python -m palworld.invaders
uv run python -m palworld.maps extract    # heavy: reads .umap actors → parsed.json
uv run python -m palworld.maps emit       # parsed.json → markers/regions/spawns/areas
uv run python -m palworld.maps tiles      # map tiles → resource-palworld
```

| Stage (module) | Emits (`data-palworld/`) | Primary raw tables |
|---|---|---|
| `encyclopedia` | `pals.json`, `passives.json`, `exp.json` | `DT_PalMonsterParameter`, `DT_Waza*`, `DT_PartnerSkill*`, `DT_PassiveSkill_Main`, `DT_PalDropItem`, `DT_PalExpTable` |
| `catalog` (+ `merchants`, `item_sources`) | `items.json`, `buildings.json`, `technology.json`, `merchants.json` | `DT_ItemDataTable`, `DT_ItemRecipeDataTable`, `DT_BuildObjectDataTable`, `DT_TechnologyRecipeUnlock`, `DT_StatusEffectFood`, `DT_ItemShop*`, `DT_PalRaidBoss`, `DT_ArenaSoloRewardTable` |
| `breeding` | `breeding.json` | `DT_PalCombiUnique`, `DT_PalMonsterParameter` |
| `dungeons` | `dungeons.json` | `DT_Dungeon*`, `DT_CapturedCagePal` |
| `recycler` | `recycler.json` | recycler Blueprint + lottery tables |
| `quests` | `quests.json` | `DT_PalQuestData`, `DT_PalQuestLocationData` |
| `fishing` | `fishing.json` | `DT_PalFishingSpotLotteryDataTable`, `DT_PalFishShadowDataTable`, `DT_FishingBaitItem` |
| `basecamp` | `basecamp.json` | `DT_BaseCampLevelData`, `DT_BaseCampTask` |
| `effigies` | `effigies.json` | `DT_PlayerStatusRankMasterDataTable` |
| `research` | `research.json` | `DT_LabResearchDataTable`, `DT_LabResearchText` |
| `invaders` | `invaders.json` | `DT_PalInvader`, `DT_PalInvaderReward` |
| `maps` | `maps.json`, `markers/<map>.json`, `regions/<map>.json`, `spawns/<pal>.json`, `areas.json` | `DT_PalWildSpawner`, `DT_PalSpawnerPlacement`, `DT_WorldMapAreaData`, region-trigger `.umap` actors |

All localized text is emitted per-language under `locales/<tag>/`. Field-level coverage —
which raw columns reach the site vs. are dropped, and the candidates since added — is tracked
in `docs/superpowers/specs/2026-07-17-palworld-data-audit.md`.

## Raw data input (added Phase 0)
The tools transform the raw game export into the `data/` and `resource/` repos.
Copy `.env.example` to `.env` and set `RAW_DATA_PATH` to the export root
(default `G:/NCSoft/Export/Exports/AION2/Content`). Wiring lands in Phase 1.

## PNG → WebP asset conversion
`aion2/tools/assets/convert_webp.py` recursively converts every `*.png` under a
source root to `*.webp` under a destination root, mirroring the tree. It is
idempotent (skips up-to-date `.webp`) — re-run freely; pass `--force` to redo all.

```bash
# Marker icons (Resource/Texture/Icon -> resource/UI/.../Icon)
uv run python -m aion2.tools.assets.convert_webp \
    "G:/NCSoft/Export/Exports/AION2/Content/UI/Resource/Texture/Icon" \
    "G:/NCSoft/aion2-map/resource/UI/Resource/Texture/Icon"

# A single world map's tiles
uv run python -m aion2.tools.assets.convert_webp \
    "G:/NCSoft/Export/Exports/AION2/Content/UI/Map/WorldMap/World_L_A" \
    "G:/NCSoft/aion2-map/resource/UI/Map/WorldMap/World_L_A"

# Whole UI tree (large)
uv run python -m aion2.tools.assets.convert_webp \
    "G:/NCSoft/Export/Exports/AION2/Content/UI" \
    "G:/NCSoft/aion2-map/resource/UI"
```

Options: `-q/--quality` (default 90), `--lossless`, `-f/--force`.

## Emit frontend dataset → `data/` repo
`aion2/tools/maps/emit_frontend.py` converts the parsed per-map JSON
(`tools/parsed_data/maps/*.json`) into the FRONTEND data schema and writes it
into the sibling `data/` repo as **JSON** (`maps.json`, `types.json`,
`markers/<map>.json`, `regions/<map>.json`, and
`locales/<lng>/{maps,types,markers,regions}.json`). It is idempotent — re-run
freely.

**Data format convention:** generated data is JSON (the frontend consumes
JSON); only hand-authored config is YAML. The `types` definition is authored in
`tools/data_src/types.yaml` and compiled to `data/types.json` by `emit_frontend`
(so humans edit YAML, the frontend gets JSON).

```bash
# All parsed maps
uv run python -m aion2.tools.maps.emit_frontend

# A single map
uv run python -m aion2.tools.maps.emit_frontend --map World_L_A
```

Coverage from the current parse:

| subtype            | category   | raw source |
|--------------------|------------|------------|
| `monolithMaterial` | collection | `MapData.json` `SpawnInfoList` (GodFragment EnvObj) |
| `village`          | location   | `Subzone.json` IconType `EIconType::Village` |
| `battlefield`      | location   | `Subzone.json` IconType `EIconType::Battlefield` |
| `teleport`         | location   | `SpawnInfoList` spawns of EnvObj `Usage == TeleportArtifact` |
| `seal`             | location   | `SpawnInfoList` spawns of EnvObj `Usage == EnterDungeon` whose `UsageValue` is a `Dungeon.json` row with `DungeonType == Seal` + `LinkedMap == <map>` (name from the dungeon `Title`) |
| `hiddenCubeLight`  | collection | `SpawnInfoList` spawns of EnvObj `Category == EEnvObjCategory::HiddenCubeLight` (Elyos) |
| `hiddenCubeDark`   | collection | `SpawnInfoList` spawns of EnvObj `Category == EEnvObjCategory::HiddenCubeDark` (Asmodian) |

NOT yet derivable (omitted): `occupation`. The `GarrisonTerritory` subzones
exist (`Subzone.json` `DisplayName` keys `STR_Subzone_GarrisonTerritory_L1_*`)
but the legacy curated occupation names do not join cleanly to those keys, and
those subzones already partly surface as `village`/`battlefield`. A definitive
occupation-objective table (capturable-fort list with positions + display
names) is still needed.

`types.json` is compiled from `tools/data_src/types.yaml` (icon/canComplete
mapping, hand-authored). Its locales (category/subtype display names) are built
from the curated `frontend/public/locales/<lng>/types.yaml`, with the
`hiddenCube` split into `hiddenCubeLight` (Elyos) / `hiddenCubeDark` (Asmodian).

Region borders are now REAL subzone polygons: `extract.py` reads each subzone's
boundary vertices from `MapData.json` `SubzoneVolumeInfoMap` and transforms them
world→pixel with the same `WorldMapTransform` used for marker `px` (emitted as
`pxBorders`); `emit_frontend.build_regions` turns those into `RegionInstance.borders`
so outlines align with the markers.
