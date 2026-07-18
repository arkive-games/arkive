# Palworld Deferred Systems — Implementation Plan (§10-F of the data audit)

Date: 2026-07-19. Companion to `docs/superpowers/specs/2026-07-17-palworld-data-audit.md` §10-F: every
deferred item with its data source, emit shape, frontend surface, effort, and priority.
Ordered by recommended implementation order (value ÷ effort).

Conventions: emits follow the existing per-stage module pattern (`uv run python -m
palworld.<stage>`); localized text goes to `locales/<tag>/`; new UI labels use
`t(key, { defaultValue })` (English fallback) as established.

## 1. Per-level drop tables (fidelity fix — HIGH, effort S-M) — ✅ DONE 2026-07-19

**Why first:** the §10-E investigation showed the current drop collapse is the one
aggregation with real player-facing distortion: **126 pals** gate drops behind level bands
(e.g. Anubis Lv80 adds Awakening materials + World Tree Relics that Lv0 never drops), but
the site shows the union as unconditional.

- **Data:** `DT_PalDropItem` `Level` column (already read, currently collapsed).
- **Emit:** per drop entry add `minLevel` when the item only appears in rows with
  `Level > 0` (keep the union shape — no breaking change). MimicDog-style same-item
  rate scaling: keep best rate, add `minLevel` of the best row.
- **Frontend:** drop rows show a small "Lv N+" chip when `minLevel` present
  (`DropRow` in `features/pals/components`).
- **Files:** `encyclopedia.py _drops`, `lib/pals.ts Drop`, `DropRow`.

## 2. Farming trio — building-page enrichment (HIGH, effort M) — ✅ DONE 2026-07-19

No new route; makes plantation/production buildings actually informative.

- **Data:** `DT_MapObjectAssignData` (271 — work-suitability type + rank a station needs,
  worker slots), `DT_MapObjectFarmCrop` (18 — crop, grow time, yield, seed cost, work
  amounts), `DT_MapObjectItemProductDataTable` (16 — passive producers: item + rate/sec).
- **Emit:** extend `buildings.json` entries: `work: {type, rank, slots?}`,
  `crop: {item, growTime, yield, seedCost}`, `produces: {item, perSec}`.
  Join key: MapObjectId (verify casing like UnlockBuildObjects).
- **Frontend:** `BuildingDetailPage` info rows + a small crop table; reverse chip on the
  crop item ("grown at X").
- **Risk:** MapObjectAssignData covers non-building map objects too — filter to the
  emitted building set.

## 3. Base-camp progression (MED-HIGH, effort S-M) — ✅ DONE 2026-07-19 (/basecamp)

- **Data:** `DT_BaseCampLevelData` (35 — worker/base caps per level),
  `DT_BaseCampTask` (35 — the build-object tasks required per level-up).
- **Emit:** `basecamp.json` `{levels: [{level, workers, tasks: [{object, count}]}]}`.
- **Frontend:** a compact `/basecamp` page (single table) + reverse chip on the task
  buildings ("required for base level N"). Route + BottomTabBar entry.

## 4. Effigy progression + hygiene fix (MED-HIGH, effort S) — ✅ DONE 2026-07-19 (effigies.json; UI pending)

- **Data:** `DT_PlayerStatusRankMasterDataTable` (279 — RelicType × Rank →
  RequiredRelicNum, EffectRate, ResetRequiredMoney).
- **Emit:** `effigies.json` `{types: [{type, ranks: [{rank, required, effect}]}]}`.
- **Bonus:** replaces the hand-mirrored `extract.RELIC_TYPE_INDEX` ordinal (audit §8
  fragility) with a real table read.
- **Frontend:** section on the map's effigy marker popup or a small stats card on a
  future /stats page; minimal.

## 5. Research Lab page (HIGH value, effort M-L) — ✅ DONE 2026-07-19 (/research)

- **Data:** `DT_LabResearchDataTable` (168 — category, effect type/value, materials, work,
  prerequisite chain, essential flag) + `DT_LabResearchText` (names, already localized).
- **Emit:** `research.json` `{projects: [{id, category, subType, effect: {type, value},
  materials: [{item, count}], work, requires?, essential?}]}` + `locales/<tag>/research.json`.
- **Frontend:** new `/research` page (grouped by work-suitability category, tech-tree-like
  list); cross-links: tech `requireResearch` → project; item → "used in research" reverse.
- **Note:** effect-type enum needs a small label map (like passive effect types).

## 6. Summoning-altar boss detail (MED, effort S) — ✅ DONE 2026-07-19 (boss level; egg pools turned out single-pal after RAID_/BOSS_ dedup)

- **Data:** `DT_PalRaidBoss_Common` `InfoList[0].Level` (boss level) +
  `EggPalIDAndWeight[]` (post-fight egg/capture pool with weights).
- **Emit:** extend the pal's `summonMaterials` block: `summonLevel`, `summonEggPool:
  [{pal, weight}]`.
- **Frontend:** the pal page summon section gains "Boss Lv N" + an egg-pool row.

## 7. Base raids / invaders page (MED, effort M-L) — ✅ DONE 2026-07-19 (/raids; rows sharing a Wave number are weighted variant compositions)

- **Data:** `DT_PalInvader` (240 — biome, grade range, up to 5 enemy groups with level
  ranges) + `DT_PalInvaderReward` (76 — per-group reward lotteries).
- **Emit:** `invaders.json` `{waves: [{biome, gradeMin, gradeMax, groups: [{pal, count,
  lvMin, lvMax}], rewards: [...]}]}`.
- **Frontend:** new `/raids` page (filter by biome/grade); pal cross-link ("attacks bases
  in X"); item reverse ("raid reward").

## 8. Paldex distribution clouds (MED, effort M — needs a design decision) — ✅ DONE 2026-07-19 (additional layer, ≤800-pt stride sample per list, day/night toggle on PalSpawnMap; 246 roster pals carry clouds; BOSS_/RAID_ codename rows skipped)

- **Data:** `DT_PaldexDistributionData` (365 — per-pal day/night spawn coordinate arrays).
- **Decision needed:** overlaps the spawner-derived `spawns/<pal>.json`. Proposal: emit as
  an *additional* layer (`paldex: {day: [...], night: [...]}` in the same file, coords
  pre-transformed) and add a day/night toggle to `PalSpawnMap`; do NOT replace spawner
  points (they carry level/pack/share data the clouds lack).
- **Risk:** doubles some spawn files' size; gate behind a size check.

## 9. Small follow-ups (LOW-MED, effort S each)

| item | emit | surface |
|---|---|---|
| passive `LotteryWeight` ✅ | binary 5/100 → `lotteryWeight` on rare tier | "Rare roll" chip on PassivesPage |
| caravan lottery `Weight` ✅ | `rollPct` per multi-lottery shop group | "Stock roll chance" row on merchant page |
| `FirstDefeatRewardItemID` ✅ | pal `bossFirstDefeatReward` (BOSS_ row) | line under Boss Drops |
| dungeon `WeightInSpawnAreaAndRank` | per-enemy share % | encounter list percentages |
| dungeon `PostfixTextId` | localized type suffix | dungeon names ("… Ruins") |
| breeding `CombiDuplicatePriority` ✅ | adopted 2026-07-19: emitted as `dup`; engine tie-break reads it DESCENDING (predictions unchanged — pool priority = rank x 100) | verification checklist stays: `2026-07-19-palworld-breeding-tie-matrix.md` (182 ties + 9 subspecies probes) |

## Explicitly NOT planned

`DT_PalHumanParameter` (NPC stat pages), `DT_BiomeEffect` (Effect serializes null),
Battle-Royale / RandomIncident / SupplyIncident families (noise), UniqueNPC cosmetics.
