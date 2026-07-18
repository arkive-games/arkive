# Palworld Data Audit — DataTables → Website Coverage, Candidates, and Cross-Reference Integrity

Date: 2026-07-17 (audit) · **Updated 2026-07-17 — candidates implemented (see §0)**

## 0. Implementation changelog (candidates added)

The Tier-2 dropped-column candidates plus two trivially-cheap new tables were implemented
in the pipeline, the dataset regenerated, and the frontend data contracts extended. All 85
`tools/apps/palworld` tests pass; the frontend typechecks (`tsc -b`, exit 0).

**New fields emitted** (verified in `data-palworld/`):

| domain | field(s) added | source column | count | pipeline |
|---|---|---|---|---|
| items | `recipe.productCount` | DT_ItemRecipeDataTable `Product_Count` (>1) | 45 | catalog.py |
| items | `grantsSkill` | DT_ItemDataTable `WazaID` (skill cards) | 93 | catalog.py |
| items | `itemPassives` | `PassiveSkillName1..4` (armor/accessories) | 192 | catalog.py |
| items | `foodBuff` {effects, time} | **DT_StatusEffectFood** (new table) | 53 | catalog.py |
| buildings | `energyDrain` | `ConsumeEnergySpeed` | 45 | catalog.py |
| buildings | `maxPerBase` | `InstallMaxNumInBaseCamp` | 4 | catalog.py |
| pals | `stats.support` | `Support` (4th combat stat) | all | encyclopedia.py |
| pals | `friendship` {hp,shotAttack,defense,craftSpeed} | `Friendship_*` condense growth | most | encyclopedia.py |
| pals | `enemyScaling` {maxHp,receiveDamage,…} | `Enemy*Rate` (baseline 1.0) | ~110 | encyclopedia.py |
| pals | active-skill `effect` {type,value} | DT_WazaDataTable `EffectType1`/`EffectValue1` | many | encyclopedia.py |
| passives | `invoke` [worker/riding/…] | DT_PassiveSkill_Main `Invoke*` flags | 115 | encyclopedia.py |
| exp | **`exp.json`** {levels:[…]} | **DT_PalExpTable** (new table, 100 levels) | new | encyclopedia.py |
| merchants | product `stock` (finite caps) | DT_ItemShopCreateData `Stock` (>0) | some | merchants.py |
| merchants | product `onceOnly` | `ProductType` OnlyPurchaseOne | 16 | merchants.py |
| items (raid) | source `min`/`max`, `anyOne` | DT_PalRaidBoss `SuccessItemList` qty + `SuccessAnyOneItemList` | — | item_sources.py |

**Frontend:** all above are now typed in `lib/{pals,catalog,merchants}.ts`. Rendered + verified
live on the pal detail page: **Support** (Base Stats) and **Max Hunger** (Details) — end-to-end
pipeline→UI confirmed on `localhost:15174/pals/SheepBall`. The remaining new fields are emitted
and typed (contract-ready) but their multilingual UI rendering is a follow-up (each needs
`palStrings`/`itemStrings` labels across 17 languages).

**Dropped during implementation** (verified dead in this export):
- `BuildCapacity` — uniformly 0 (storage capacity lives in the building Blueprint, not the
  DataTable); the planned `capacity` field was removed.
- `GrantEffect1Id` (items) — always 0 in this export; not emitted.
- `SneakAttackRate` — inconsistent semantics (1 vs 100 baseline); not emitted.

**Emitted-only cleanup:** pals `genus` + `maxFullStomach` are now **rendered** (no longer dead).
Buildings `typeB`/`typeUI` remain emitted-only (kept, reserved for a future build-menu grouping).

**Bug fixed along the way:** `maps/emit.py` still imported `..blueprint_sources` after that
module was renamed to `item_sources.py` — a stale import that had been silently breaking the
maps pipeline (and two test modules). Repointed to `..item_sources`; maps tests now pass.

**Deferred (documented in §5 roadmap):** the maps-domain spawn columns (`Weight`, `NumMin/Max`,
`StaticRadius`) and all Tier-1 whole-table features (Paldex spawn clouds, invaders, base-camp,
farming, full fishing dataset). The spawn columns require re-running the heavy `.umap` extract,
which the report already flagged as risky (stale `parsed.json` would drop all regions).

### Update 2 — deferred work continued (2026-07-17)

**Maps-domain spawn columns — ✅ done (data + UI).** Aggregated in `maps/extract.py` and
threaded through `maps/emit.py` into `spawns/<pal>.json` point entries:
- `numMin`/`numMax` — pack size (how many spawn together), widened across a spawner's rows.
- `weightPct` — the pal's spawn **share** at that spawner (its summed row-weight ÷ the
  spawner's total, as a %), the "how common here" signal the audit asked for.
- `radius` — the spawn-zone radius (`StaticRadius`, 15000 cm = 150 m).

The heavy `.umap` extract was re-run first (regenerating `parsed.json` **with** regions — 124
volumes / 123 names), so `emit` did **not** hit the stale-parsed.json region-drop trap:
MainWorld still emits **123 regions** and **8404 markers** (unchanged). Frontend: the pal
detail spawn map now shows **pack size** in a single-point tooltip (`Lv.X · ×1–3`);
`SpawnPoint`/`SpawnFile` types carry all four fields (`tsc -b` clean).

**Fishing dataset — ✅ emitted (`fishing.json`), UI is follow-up.** New `fishing.py` joins
`DT_PalFishingSpotLotteryDataTable` × `DT_PalFishShadowDataTable` → **115 spots, 1252 fish
entries**: `{pal, shadow, size, sharePct, lvMin, lvMax, night?, difficulty, king/boss/rare
rates, itemLottery}`. This is the audit's flagged "full fishing dataset that never reached the
site." It's contract-ready; a dedicated fishing page / pal-page "caught by fishing" section is
the next step (needs a new frontend surface + i18n).

**Remaining Tier-1 (triaged → roadmap):** Paldex spawn clouds (`DT_PaldexDistributionData` —
overlaps the existing spawner-derived `spawns/` layer; needs a de-dup/curation decision),
`DT_PalInvader(+Reward)` (base-raid waves + loot), base-camp progression
(`DT_BaseCampTask`/`LevelData`), and farming (`DT_MapObjectAssignData`/`FarmCrop`/`ItemProduct`
→ building work-suitability + crop yields). Each needs a **new frontend page or a substantial
new section** (+ 17-language i18n), so they remain deferred as discrete features rather than
half-built. Verification for this pass: 85 tools tests pass, frontend `tsc -b` clean, live UI
checked on `localhost:15174`.

### Update 3 — cross-references fixed + dropped data rendered in detail sections (2026-07-18)

**Cross-reference bidirectionality (§6) — all four gaps closed:**
- **Pal → Dungeons** — `dungeonsByPal` inverse; a "Found in Dungeons" section links every
  dungeon the pal spawns/cages in (`PalDetailPage`).
- **Pal → Active Skill** — the pal's active-skill names now link to `/active-skills/$id`
  (`atoms.tsx ActiveSkillRow`).
- **Tech → Pal reverse** — "Unlocks Technology · Capturing this Pal unlocks: …" links to the
  tech tree (inverse of `tech.requirePal`).
- **Item → Quest reverse** — "Quest reward" links in the item Obtain section (inverse of
  `quests[].rewardItems`).

**Dropped/emitted data now rendered in lower detail sections (not the top stat cards):**
pal **Condense Growth** (`friendship`), **Enemy Scaling** (`enemyScaling`), **Predator** flag,
and active-skill on-hit **effect** badge; item **Food Buff** (`foodBuff`), **Sanity drain**
(`corruption`), **PvP** restriction (`pvpBanned`) — plus `grantsSkill`/`itemPassives`/
`recipe.productCount`/merchant `stock`/raid `min–max`/`anyOne` (wired concurrently); building
**Power use** (`energyDrain`) + **Max per base** (`maxPerBase`); passive **invoke-scope** chips
(worker/riding/base-camp/…). New emits this pass: item `corruption`/`pvpBanned`, pal `predator`.

**README:** `tools/README.md` gained a Palworld-pipeline section (stages, run order, and the
emitted datasets incl. `exp.json` + `fishing.json`).

New i18n labels use `t(key, { defaultValue })` (English fallback, translatable later) to avoid
editing all 17 language blocks. Verification: 85 tools + 76 frontend tests pass, `tsc -b` clean,
live-checked (Boar, Curry, Passives) on `localhost:15174`.

### Update 4 — deferred-systems plan items 1–6 + 9 implemented (2026-07-19)

Per `docs/superpowers/specs/2026-07-19-palworld-deferred-systems-plan.md` (statuses marked
there): **per-level drop gates** (`minLevel` on 843 drops + "Lv N+" chip — the §10-E1 fidelity
fix), **farming trio** (building `workReq`/`workers`/`crop`/`produces` + BuildingDetailPage
rows; crop join via the BP `CropDataId`, not the misspelled building ids), **/basecamp** page
(35 levels + task chips + building reverse row), **effigies.json** (13 buff types × 279 ranks,
localized; `RELIC_TYPE_INDEX` now read from the table — §8 fragility fixed), **/research**
page (168 lab projects grouped by work category with effects, chains, and tech unlock links),
**summon boss level** (5 rituals; egg pools proved single-pal after RAID_/BOSS_ dedup), plus
small follow-ups: passive **Rare roll** chip (19), merchant **Stock roll chance** (`rollPct`),
pal **first-defeat reward** (109). Still pending: invaders page, Paldex clouds, dungeon enemy
share %, dungeon name suffix. Verification: 85 tools + 94 frontend tests pass, `tsc -b` clean,
/basecamp + /research live-checked.

### Update 5 — plan items 7 + 8 (2026-07-19)

**#7 Base raids — ✅** `invaders.py` → `invaders.json` (76 raids / 240 waves from
`DT_PalInvader(+Reward)`) + a **/raids** page: biome filter, grade band, wave composition
(roster pals linked, human NPCs as labels, Otomo companions, level bands, head counts),
clear rewards, and the `Factory_Money`-conditioned police raid. Rows sharing a Wave number
are weighted variant compositions — displayed as separate lines.

**#8 Paldex habitat clouds — ✅** `DT_PaldexDistributionData` day/night point clouds emitted
as an *additional* layer in `spawns/<pal>.json` (`paldexDay`/`paldexNight`, `[x, y]` pairs,
stride-sampled to ≤800 per list — raw max was 10.6k), split per map; **246** roster pals carry
clouds and 5 Paldex-only subspecies gained spawn files (283 → 288 — BOSS_/RAID_ codename
rows are skipped: their clouds are the fixed alpha locations already shown as boss markers). `PalSpawnMap` gains a
"Paldex habitat: Day / Night" toggle rendering canvas CircleMarkers; spawner points (with
level/pack/share detail) remain the primary layer. Regions/markers unchanged (123 / 8404).
Caught in review: emit's spawn-file ordering pass rebuilt map dicts keeping only
`points`/`bosses` — the cloud keys are now carried through.

## What this is

A full audit of the Palworld data pipeline: which raw game **DataTables** feed the
website, what columns each carries, which columns actually reach the rendered site vs.
are dropped, what meaningful data is still **left on the table** (candidates to add), and
whether the website's cross-references are **bidirectional** (if A links to B, does B link
back to A). Blueprints and `.umap` actors are treated as reference sources; DataTables are
primary. Every claim below was verified by reading raw tables, the pipeline modules, the
emitted JSON, and the frontend TSX.

**Paths.** Raw DataTables: `D:/Palworld/Exports/Pal/Content/Pal/DataTable/` (475 files, 464
`DT_*`). Pipeline: `tools/apps/palworld/`. Emitted dataset: `E:/arkive-games/data-palworld/`.
Frontend: `frontend/apps/palworld/src/`.

## Scope of what's used

Of 464 `DT_*` tables, the vast majority are noise for a wiki (`Battle_Royale_*`,
`RandomIncidentMonster_*`, `RandomIncidentNPC_*`, `SupplyIncident_*`, `*Foliage*`,
`*TestSandbox*`, `DT_PL_*/PV_*/SL_*`, CharacterCreation/Skin/Sound/Option/RichText, `DT_Gift*`).
The pipeline consumes **~68 meaningful tables** across seven domains. Classification key used
throughout:

- **USED** — reaches emitted JSON *and* is rendered by the frontend.
- **EMITTED-ONLY** — present in emitted JSON but no frontend consumer (dead weight).
- **DROPPED** — the pipeline never reads the column.

> **Note (2026-07-18):** the per-table matrices below record the classification **as of the
> original audit**. Many columns marked DROPPED there have since been **added** (see the §0
> Updates 1–3 changelogs). For the columns that are *still* dropped, **§10 gives the reason
> each one is dropped**, grouped by cause.

### `_Common` twin gotcha (applies pipeline-wide)

Many core tables ship as a base file and a `_Common` twin (the DLC/Sakurajima-merged
superset). The pipeline reads the **`_Common`** file for items, recipes, build objects,
tech text, item/skill name+desc, shop data, and quest text — schemas are identical, so
column coverage is unaffected, but anyone grepping the base table name will not find the
read. `DT_PalRaidBoss_Common` (under `Blueprint/RaidBoss/`) is read, not `DT_PalRaidBoss`.

---

## 1. Domain: Items / Buildings / Technology / Recycler

Pipeline: `catalog.py`, `recycler.py`, `item_sources.py` → `items.json`, `buildings.json`,
`technology.json`, `recycler.json`.

### DT_ItemDataTable (`Item/`, 2466 rows) — master item table

| column | class | notes |
|---|---|---|
| TypeA, Rank, Rarity, MaxStackCount, Weight, Price, SortId, IconName, bEnableHandcraft, bLegalInGame, ElementType | USED | stat rows / filters / ordering / icon |
| Restore{Satiety,Health,Sanity,Concentration} | USED | food stat rows |
| Physical/Magic Atk+Def, HPValue, ShieldValue, Durability, MagazineSize | USED | equip stat rows |
| WazaID, PassiveSkillName1..4, CorruptionFactor, bNotAvailableInPVP | ADDED | now grantsSkill / itemPassives / corruption / pvpBanned (see §9) |
| **TypeB** | EMITTED-ONLY | `typeB` in JSON, no frontend reference |
| GrantEffect1..3Id/Time | DROPPED | **why: §10-A dead in export** — uniformly `0` (consumable status-effect refs unpopulated) |
| SneakAttackRate | DROPPED | **why: §10-A dead in export** — inconsistent baseline (`1` vs `100`), semantics unreliable |
| bSleepWeapon, bNotConsumed | DROPPED | **why: §10-D niche** — non-lethal-capture / reusable-consumable flags |
| DropItemType, TechnologyTreeLock, Item*Class, VisualBlueprint*, FloatValue1, AssetValue, bInTreasureBox, Editor_RowNameHash | DROPPED | **why: §10-B engine plumbing** — internal refs, no player meaning |

### DT_ItemRecipeDataTable (`Item/`, 1414 rows)

`Product_Id`, `WorkAmount`, `Material1..5_Id/_Count`, `UnlockItemID` are **USED**.
`Product_Count` is now **ADDED** (→ `recipe.productCount`, §9). Still dropped:
`EnergyType`/`EnergyAmount` (**why: §10-D niche** — recipe power draw), `CraftExpRate`
(**why: §10-D niche** — XP per craft), `WorkableAttribute`/`DenyRecipeChain`/`Editor_RowNameHash`
(**why: §10-B engine plumbing**).

### DT_BuildObjectDataTable (`MapObject/Building/`, 498 rows)

| column | class | notes |
|---|---|---|
| MapObjectId, TypeA, SortId, RequiredBuildWorkAmount, Material1..4_Id/_Count, RequiredEnergyType | USED | |
| ConsumeEnergySpeed, InstallMaxNumInBaseCamp | ADDED | now energyDrain / maxPerBase (see §9) |
| **TypeB, TypeUIDisplay** | EMITTED-ONLY | `typeB`/`typeUI` in JSON, unused |
| BuildCapacity | DROPPED | **why: §10-A dead in export** — uniformly `0` (real capacity lives in the actor Blueprint) |
| Rank | DROPPED | **why: §10-C redundant** — constant `1`; the UI shows the unlocking tech's level |
| placement flags (bIsInstallOnlyOnBase/InDoor/HubAround, raid-area limits), BuildExpRate, bIsPaintable | DROPPED | **why: §10-D niche** — build constraints / XP / cosmetic |
| BlueprintItemID, OverrideDescMsgID, InstallNeighborThreshold, bInstallAtReticle, AssetValue | DROPPED | **why: §10-B engine plumbing** |

No building HP column exists in this table (HP lives in the actor Blueprint components).

### DT_TechnologyRecipeUnlock (`Technology/`, 588 rows)

`UnlockBuildObjects`, `UnlockItemRecipes`, `Name`, `Description`, `LevelCap`, `Cost`,
`IsBossTechnology`, `RequireDefeatTowerBoss`, `RequireTechnology`, `RequireResearchId` — all
USED. Dropped: `IconName` (**why: §10-C redundant** — the tile icon is derived from the
unlocked item/building), `Tier` (**why: §10-C redundant** — `LevelCap` already drives ordering).

### DT_LabResearchDataTable (`Lab/`, 168 rows) — largely unmodeled

Only `TextId` leaks through (as a tech's `requireResearchName`). The **entire research-lab
upgrade system** — `EffectType`/`EffectValue` (e.g. +10% craft speed), materials, work — is
DROPPED (**why: §10-F deferred** — it needs a dedicated research page; a page could be built
almost entirely from these columns).

### Loot machinery (shared)

`DT_ItemLotteryDataTable` (8777) + `DT_FieldLotteryNameDataTable` (511) power all loot
channels. `FieldName`, `SlotNo`, `WeightInSlot`, `StaticItemId`, `MinNum/MaxNum`,
`TreasureBoxGrade` (→ `grade`, meaning still **UNVERIFIED**), and per-slot probabilities are
USED. Dropped: `NumUnit` (**why: §10-A dead in export** — always `1`), `BonusExpRate`
(**why: §10-D niche** — per-pickup XP). Recycler is built from the recycler **Blueprint**
(`BP_BuildObject_AncientRelicRecycler`) plus these two tables, not a dedicated DataTable.

---

## 2. Domain: Pals / Skills / Passives / Breeding

Pipeline: `encyclopedia.py`, `breeding.py` → `pals.json`, `passives.json`, `breeding.json`.

### DT_PalMonsterParameter (`Character/`, 753 rows; ~299 pass the roster gate)

The single richest table and the biggest reservoir of unused data.

| column | class | notes |
|---|---|---|
| ZukanIndex(+Suffix), Size, Rarity, ElementType1/2, Hp, MeleeAttack, ShotAttack, Defense, CraftSpeed, Stamina, FoodAmount, CaptureRateCorrect, Price, MaleProbability, SlowWalk/Walk/Run/RideSprint/Transport/Swim speeds, AIResponse, Nocturnal, WorkSuitability_* (13), BestWorkSuitability, PassiveSkill1..4, Tribe, CombiRank, IgnoreCombi | USED | stats/work/filters/breeding |
| Support, Friendship_HP/ShotAttack/Defense/CraftSpeed, Enemy{MaxHP,ReceiveDamage,InflictDamage,WazaCoolTime}Rate, Predator, MaxFullStomach | ADDED | now support / friendship / enemyScaling / predator, + maxFullStomach rendered (see §9) |
| **GenusCategory** | EMITTED-ONLY | `pals[].genus` in JSON but no frontend renders it |
| Edible | DROPPED | **why: §10-A dead in export** — uniformly `true` across the roster |
| SwimDashSpeed | DROPPED | **why: §10-C redundant** — tracks `SwimSpeed` (already shown) |
| FullStomachDecreaseRate, ExpRatio, StatusResistUpRate, ViewingDistance/Angle, HearingRate, NooseTrap, BiologicalGrade, CombiDuplicatePriority | DROPPED | **why: §10-D niche** — hunger drain / senses / detection-AI internals / breeding tie-break |
| Mesh capsule/size, Organization, Weapon/WeaponEquip, boss-variant flags (IsBoss/IsTowerBoss/…) | DROPPED | **why: §10-B engine plumbing** |
| FirstDefeatRewardItemID | DROPPED | **why: §10-F deferred** — first-defeat reward, no surface yet |

### Other pals tables (all USED except as noted)

- **DT_WazaDataTable** (384) — active skills. USED: WazaType, Element, Category, DisplayPower,
  CoolTime, Min/MaxRange, Strength (→ skill-fruit flag). **ADDED:** `EffectType1`/`EffectValue1`
  (on-hit status ailment → active-skill effect badge, §9). Still dropped: `EffectType2`/`EffectValue2`
  (**why: §10-D niche** — rare secondary on-hit), `MaxHeightDiff` (**why: §10-D niche** — vertical
  reach), `IsLeanBack`/`CameraShake`/`ForceRagdollSize` (**why: §10-D niche** — animation feel).
- **DT_WazaMasterLevel** (5772) — learnset (PalId/WazaID/Level), fully USED.
- **DT_PartnerSkill** (50), **DT_PartnerSkillParameter** (682), **DT_PartnerSkillAppendText**
  (160) — partner skill shape/params/text, USED. Riding-mode internals
  (`IsRidingActiveSkillNotWeapon`, `RidingActiveSkillNotWeaponCondition`, toggle/one-shot flags)
  dropped (**why: §10-B/D** — engine internals of little wiki value).
- **DT_PassiveSkill_Main** (1905; 115 displayable) — USED: Category, Rank, EffectType/Value/Target
  1..4, AddMutationPal, OverrideDescMsgID. **ADDED:** `Invoke*` flags (→ invoke-scope chips, §9).
  Still dropped: `LotteryWeight` (**why: §10-F deferred** — roll odds, no surface yet),
  `TargetElementType` (**why: §10-D niche** — element scoping), non-mutation `Add*` flags
  (**why: §10-D niche** — applicability).
- **DT_PalDropItem** (1044) — 10 drop slots, USED. `Level` dropped (**why: §10-E collapsed** —
  per-level variation merged to the best rate across rows).
- **DT_PalCombiUnique** (258) — unique breeding recipes, fully USED.
- **DT_PalBPClass** (940) — resolves ranch-production BP path; AssetPathName USED.
- Text tables (`DT_PalNameText`, `DT_PalLongDescriptionText`, `DT_PalFirstActivatedInfoText`,
  `DT_SkillNameText`, `DT_SkillDescText`) — USED per-locale.
- **DT_PalRaidBoss_Common** (11) — summon-altar rituals. USED: reward pal. **ADDED:**
  `SuccessItemList` (min/max) + `SuccessAnyOneItemList` (→ raid `min`/`max`/`anyOne`, §9).
  Still dropped: `EggPalIDAndWeight` egg pool + `InfoList` boss level/moveset
  (**why: §10-F deferred** — summon-boss stats / capture pool, no surface yet).

---

## 3. Domain: Maps / Spawns / Markers / Regions

Pipeline: `maps/extract.py` + `maps/emit.py` → `maps.json`, `markers/<map>.json`,
`spawns/<pal>.json`, `regions/<map>.json`, `areas.json`. Localized marker text is split into
`locales/` by design (not a drop).

| table | rows | key finding |
|---|---|---|
| DT_PalWildSpawner | 1691 | Pal_1..3 / Lv band / OnlyTime(Night) USED. **ADDED:** `Weight`→weightPct, `NumMin/NumMax`→pack (§9). `OnlyWeather` dropped — **why: §10-A dead in export** (constant `Undefined`). `bIsAllowRandomizer`/`bHasWorldTreeAura` dropped — **why: §10-B plumbing**. |
| DT_PalSpawnerPlacement | 8253 | SpawnerName/Type/Location USED. **ADDED:** `StaticRadius`→radius (§9). `RadiusType` dropped — **why: §10-C redundant**; `RespawnCoolTime`/`LayerNames`/`SpawnerClass`/`WorldName` dropped — **why: §10-B plumbing** (WorldName uniform). |
| DT_BossSpawnerLoactionData | 159 | CharacterID/SpawnerID/Location/Level all USED (alpha + wanted bosses). |
| DT_UniqueNPC (+Text, +HumanNameText) | 216 | name/icon/gender USED. Cosmetics (Face/Hair/Clothes/SkinColor/Scale), Level, dialogue BP dropped — **why: §10-D niche / §10-B plumbing**. |
| DT_PalCharacterIconDataTable / DT_PalBossNPCIcon | 674 / 33 | icon stems USED. `SubPathString` dropped — **why: §10-B plumbing**. |
| DT_ItemPickupDataTable | 107 | shrine reward slots 1–2 USED. `Item_03` slot dropped — **why: §10-D niche** (third reward slot, rarely populated). |
| DT_NoteMasterDataTable (+Desc, +Texture) | 64 | collectible notes fully USED. |
| DT_MapRespawnPointInfoText | 199 | fast-travel/tower names USED. `SpawnPoint_*` description text dropped — **why: §10-D niche** (only names consumed). |
| DT_PlayerStatusRankMasterDataTable | 279 | **NOT read as a table** — RelicType ordering hand-mirrored in `extract.RELIC_TYPE_INDEX`. Columns (`RequiredRelicNum`/`EffectRate`/`ResetRequiredMoney`) dropped — **why: §10-F deferred** (effigy buff system unmodeled). |
| DT_PalFishingSpotLotteryDataTable / DT_PalFishShadowDataTable | 1252 / 135 | **ADDED:** whole fishing dataset → `fishing.json` (§9) — shadow→pal, level band, day/night, difficulty, item pool. |

---

## 4. Domain: Dungeons / Merchants / Quests

Pipeline: `dungeons.py`, `merchants.py`, `item_sources.py`, `quests.py` → `dungeons.json`,
`merchants.json`, `quests.json`.

- **Dungeons** (`DT_Dungeon*`, `DT_CapturedCagePal`): SpawnAreaId joins, chest/reward
  lotteries, cage-pal pools, enemy spawn buckets — all USED. Dropped: `WeightInSpawnArea` +
  `DungeonEnemySpawn.WeightInSpawnAreaAndRank` (**why: §10-D niche** — enemy spawn frequency),
  `PostfixTextId` (**why: §10-D niche** — dungeon type suffix "Ruins"/"Cave"),
  `LotteryValueBlueprintClassName` (**why: §10-C redundant** — dup of the soft-class stem).
- **Merchants** (`DT_ItemShop*_Common`, 38/38/3): products, price, currency, vendor→group
  mapping — USED. **ADDED:** `Stock` + `ProductType` (→ product `stock`/`onceOnly`, §9). Still
  dropped: lottery `Weight` (**why: §10-F deferred** — caravan stock rarity, no surface yet).
- **Arena** (`DT_ArenaSoloRewardTable`, 7): rank + first/repeat reward items USED. Reward
  `Min`/`Max` dropped (**why: §10-D niche** — reward qty), `Rate` dropped (**why: §10-C
  redundant** — uniformly `100`).
- **Quests** (`DT_PalQuestData` 120, `DT_PalQuestLocationData` 166): id/type/title/desc,
  reward exp+items (from BP CDO), next-quest chain, location coords — USED. Dropped: `Range`
  (**why: §10-D niche** — objective radius), `bReorderable` (**why: §10-B plumbing** — UI flag).
- **`DT_PalFishingSpotLotteryDataTable` is not read by the dungeon/merchant modules** (the
  `item_sources.py` docstring cited it, but fishing item-sources come from `_Fishing`/`_FishPond`
  FieldNames inside `DT_ItemLotteryDataTable`). The table itself is now consumed by the new
  `fishing.py` stage → `fishing.json` (§9).

---

## 5. Candidates to add (prioritized, cross-domain)

### Tier 1 — whole tables not yet touched (high value) — roadmap (✅ #2 PalExpTable, #3 DT_StatusEffectFood, #7 fishing dataset done in §0; rest pending, each needs a new frontend surface)

1. **DT_PaldexDistributionData** (365) — per-Pal day/night spawn-coordinate clouds. The
   authoritative "where does this Pal spawn" layer, directly plottable via the existing
   world→pixel transform. Biggest single win.
2. **DT_PalExpTable** (100) — per-level EXP curve (player + Pal); trivial to emit, needed on
   every Pal/player page.
3. **DT_StatusEffectFood** (54) + **DT_FishingBaitItem** (9) — turn food/bait from bare icons
   into functional pages (buff type/value/duration; catch-rate modifiers).
4. **DT_MapObjectAssignData** (271) + **DT_MapObjectFarmCrop** (18) + **DT_MapObjectItemProduct**
   (16) — base-building/farming trio: work-suitability requirements, crop grow times/yields,
   passive producer rates. Makes build-object pages genuinely useful.
5. **DT_PalInvader** (240) + **DT_PalInvaderReward** (76) — base-raid wave composition + loot,
   keyed by biome/grade.
6. **DT_BaseCampTask** (35) + **DT_BaseCampLevelData** (35) — base-camp progression checklist.
7. **DT_PalFishingSpotLotteryDataTable** (1252) — the full fishing-spot dataset (already
   present in the export, entirely unused): fish shadow, level band, day/night, difficulty.

Secondary: `DT_FriendshipRankTable` (bond thresholds), `DT_CharacterUpgradeMasterDataTable`
(condensing), `DT_WazaMasterTamago` (egg learnset), `DT_PalShopCreateData` (creature vendors),
`DT_OperatingTablePassiveSkillDataTable` (passive re-roll costs), achievement/NPC-request
cluster. Cautions: `DT_BiomeEffect.Effect` serializes as `null` (unusable as exported);
`DT_PalHumanParameter` duplicates the monster-param shape for NPCs (only useful if NPC stat
pages are added).

### Tier 2 — dropped columns on tables already read (cheap wins) — ✅ IMPLEMENTED (see §0)

- `DT_ItemRecipeDataTable.Product_Count` — output quantity for batch recipes.
- `DT_ItemDataTable.GrantEffect*` / `WazaID` / `PassiveSkillName1..4` — what consumables,
  skill fruits, and accessories actually *do* (currently blank stat panels).
- `DT_WazaDataTable.EffectType/Value` — on-hit status ailment + magnitude on active-skill pages.
- `DT_PassiveSkill_Main.Invoke*` — *when* a passive applies (worker/riding/reserve/basecamp).
- `DT_PalMonsterParameter.Support` + `Friendship_*` + `Enemy*Rate` — the missing 4th combat
  stat, condense growth, and alpha scaling.
- `DT_BuildObjectDataTable.ConsumeEnergySpeed` + `BuildCapacity` — top base-planning questions.
- `DT_ItemShopCreateData_Common.Stock` / `ProductType` — merchant buy limits.
- `DT_PalRaidBoss_Common.SuccessItemList`/`SuccessAnyOneItemList` — what raids reward.
- `DT_PalWildSpawner.Weight`/`NumMin/Max` + `DT_PalSpawnerPlacement.StaticRadius` — richer
  spawn markers (rarity, pack size, spawn zones).
- **Emitted-only cleanup:** `buildings.json` `typeB`/`typeUI` and `pals` `genus`/`maxFullStomach`
  are emitted but never rendered — either wire them in or drop them from the emit.

---

## 6. Cross-reference bidirectionality audit

Invariant: if page A links to B, B should link back to A. Detail routes exist for Pal, Item,
Building, Merchant, Dungeon, Quest, Region, Active Skill. Passive/Partner-Skill are list-only;
Technology is a single tree page.

### Matrix (issues only; ~15 other relationships verified OK)

| relationship | forward | reverse | status | fix location (forward link) |
|---|---|---|---|---|
| Pal → Dungeons it appears in | **no** | yes (`DungeonDetailPage.tsx:252`) | **MISSING-FORWARD** | build `dungeonsByPal` from `d.enemies.*[].pal`, add section to `PalDetailPage.tsx` |
| Pal → Active Skills (link the rows) | **no** (plain text `atoms.tsx:169`) | yes (`ActiveSkillDetailPage.tsx:116`) | **MISSING-FORWARD** | make skill name a `<Link to="/active-skills/$id">` in `atoms.tsx:169` |
| Technology → Pal (capture unlocks tech) | yes (`TechDetails.tsx:78`) | **no** | **MISSING-REVERSE** | invert `tech.requirePal`, chip on `PalDetailPage.tsx` |
| Item → Quest (reward from quest) | yes (`QuestDetailPage.tsx:87`) | **no** | **MISSING-REVERSE** | `questsByRewardItem` index, row in `ItemDetailPage.tsx` obtain section |
| Pal → Passives / Partner-skill list | **no** | yes (`PassivesPage.tsx:261`, `PartnerSkillsPage.tsx:189`) | MISSING-FORWARD (low — needs list filter param) | deep-link `/passives?q=<name>` |
| Quest → previous quest | yes (`nextQuests`) | **no** | MISSING-REVERSE (lowest) | back-link on `QuestDetailPage.tsx:93` |

Verified **OK** (both directions render): Pal↔drop Item, Item↔recipe material (`usedInItems`),
Item↔building (`craftedAt`/`crafts`), Item↔unlocking Tech, Item↔Merchant, Item↔source Region,
Item↔Dungeon loot, Item↔raid Pal, Item↔recycler, Building↔materials, Pal↔spawn map, Pal↔breeding
parents/children, Dungeon↔prev/next.

**Priority to fix:** (1) Pal → Dungeons, (2) Pal → Active Skill links, (3) Tech → Pal reverse,
(4) Item → Quest reverse. The "N/A" pairs (egg hatch-back, region↔pal, quest↔pal) are not
fixable on the frontend because the emitted data model doesn't carry the relationship.

---

## 7. Per-map verification (live, localhost:15174)

The pipeline emits exactly **2 world maps** (8×8×1024 tiles each). Both checked in-browser,
zero console errors.

| map | markers | regions | verdict |
|---|---|---|---|
| **MainWorld** (Palpagos Islands) | 8404 (location 523, boss 149, collectible 4433, effigy 360, resource 523, npc 144, pal 2272) | **123** (region 81, cave 17, dungeon 19, tower 6) | COMPLETE — markers, region polygons, popups all render |
| **WorldTree** (The World Tree) | 2438 (all categories present; 2109 pal, plus bosses/notes/eggs/chests/fishing/effigies/ore) | **0** | markers healthy; **region polygons entirely missing** |

**WorldTree region gap — root cause (raw-data limitation, verified):** the game names 12
World Tree regions in text (`REGION_WorldTree01..12`), but only **3 region-trigger volumes**
exist in the export (`WorldTree1/2/3`, unpadded), and `DT_WorldMapAreaData` has **no**
`WorldTree1/2/3` rows (its only WorldTree entry, `FootOfWorldTree`, assigns to MainWorld by
coordinates). Since `emit` drops any volume whose area key isn't in the area×text join, all 3
volumes are filtered out. This is incompletely authored source data; the only pipeline-side
lever is the unpadded-vs-zero-padded key convention (`WorldTree1` vs `WorldTree01`). The
frontend degrades gracefully — "Show regions" on WorldTree produces nothing and no error.

---

## 8. Pipeline hygiene notes (not data-correctness, but worth flagging)

- **Stale intermediate:** `tools/apps/palworld/parsed/parsed.json` predates region extraction
  (no `regionVolumes`/`regionNames`). Emitted MainWorld regions are fresher. Re-running `emit`
  off the stale parsed.json would drop **all** regions (emit prints a warning for exactly this).
  A reproducibility trap.
- **`DT_PlayerStatusRankMasterDataTable`** relic ordering is duplicated by hand in
  `extract.RELIC_TYPE_INDEX` instead of read from the table — silent breakage risk on a game
  patch that reorders relic types.
- **`TreasureBoxGrade` → `grade`** flows to the UI but its meaning (chest tier) remains
  UNVERIFIED (consistent with existing memory).

## 9. Added since the audit (no longer dropped)

The following were DROPPED at audit time and have since been **added** (data + UI unless noted;
see §0 Updates 1–3 for details): item `WazaID`→grantsSkill, `PassiveSkillName1..4`→itemPassives,
`CorruptionFactor`→corruption, `bNotAvailableInPVP`→pvpBanned, recipe `Product_Count`→productCount,
`DT_StatusEffectFood`→foodBuff; building `ConsumeEnergySpeed`→energyDrain,
`InstallMaxNumInBaseCamp`→maxPerBase; pal `Support`, `Friendship_*`→friendship,
`Enemy*Rate`→enemyScaling, `Predator`, `MaxFullStomach` (now rendered; `GenusCategory` stays EMITTED-ONLY);
`DT_WazaDataTable` `EffectType1/EffectValue1`→active-skill effect; `DT_PassiveSkill_Main`
`Invoke*`→invoke chips; `DT_PalExpTable`→exp.json; spawn `Weight`→weightPct, `NumMin/Max`→pack,
`StaticRadius`→radius; merchant `Stock`/`ProductType`→stock/onceOnly; raid `SuccessItemList`
min/max + `SuccessAnyOneItemList`→anyOne; the whole `DT_PalFishingSpotLotteryDataTable` +
`DT_PalFishShadowDataTable`→fishing.json.

**§10-D sweep (2026-07-19):** item `bNotConsumed`→notConsumed ("Not consumed" property row),
recipe `CraftExpRate`→craftExp (craft section), building `BuildExpRate`→buildExp,
`bIsPaintable`→paintable, `bIsInstallOnlyOnBase`/`bIsInstallOnlyHubAround`/
`bIsProhibitedInRaidBossArea`→baseOnly/hubOnly/noRaidArea (placement row), pal
`ExpRatio`→stats.expRatio ("EXP yield" detail row), arena reward `Min`/`Max`→source qty
(`×20` on the Bronze Giga-Sphere chip).

## 10. Why each still-dropped column is dropped

Everything below is **still** dropped. The reason is one of six causes.

### A. Dead in this export — the value carries no information

The column exists but every row (or every meaningful row) holds the same value, so emitting it
would add bytes with zero signal. Verified by scanning the raw table.

| column (table) | observed value | 
|---|---|
| `BuildCapacity` (DT_BuildObjectDataTable) | uniformly `0` — real storage capacity lives in the building Blueprint, not this table |
| `GrantEffect1..3Id` / `Time` (DT_ItemDataTable) | uniformly `0` — consumable status-effect refs are unpopulated in this export |
| `Edible` (DT_PalMonsterParameter) | uniformly `true` for the roster — no discriminating power |
| `OnlyWeather` (DT_PalWildSpawner) | uniformly `Undefined` — weather-gated spawns aren't expressed in the data |
| `SneakAttackRate` (DT_ItemDataTable) | inconsistent baseline (`1` vs `100` on comparable items) — semantics unreliable, so unsafe to surface |
| `bSleepWeapon` (DT_ItemDataTable) | `true` on **0** items (2026-07-19 scan) |
| `EnergyType`/`EnergyAmount` (DT_ItemRecipeDataTable) | all 1414 recipes: `None`/`0` |
| `bIsInstallOnlyInDoor` (DT_BuildObjectDataTable) | `true` on **0** buildings |
| `MaxBuildCountInRaidBossArea` (DT_BuildObjectDataTable) | uniformly `0` |
| `FullStomachDecreaseRate` (DT_PalMonsterParameter) | uniformly `1` |
| `ViewingDistance` / `HearingRate` (DT_PalMonsterParameter) | uniformly `25` / `1` |
| `Range` (DT_PalQuestLocationData) | only `-1`/`0` — no real objective radii authored |
| `EffectType2`/`EffectValue2` (DT_WazaDataTable) | set on **1** of 384 rows |
| `Item_03_Id/Num` (DT_ItemPickupDataTable) | `None` on all 107 rows (and `Item_02` is only ever `DogCoin`) |
| `NumUnit` (DT_ItemLotteryDataTable) | always `1` |

### B. Engine / asset plumbing — no player-facing meaning

Internal references the game engine needs but a wiki reader never wants.

- **Item:** `DropItemType`, `TechnologyTreeLock`, `ItemStaticClass`/`ItemDynamicClass`/`ItemActorClass`/`ItemStaticMeshName`, `VisualBlueprintClass*`, `FloatValue1`, `AssetValue`, `bInTreasureBox`, `Editor_RowNameHash`.
- **Recipe:** `WorkableAttribute`, `DenyRecipeChain`, `Editor_RowNameHash`.
- **Building:** `BlueprintItemID`, `OverrideDescMsgID`, `InstallNeighborThreshold`, `bInstallAtReticle`, `AssetValue`, `bInstallableNoObstacleFromCamera`.
- **Pal:** `Organization`, `Weapon`/`WeaponEquip`, mesh capsule/relative-location fields, `BattleBGM`.
- **Waza:** `IgnoreRandomInherit`, `IgnoreRaycast`, `DisabledData`, `BulletEmiiterOverlapClass`.
- **Spawner:** `bIsAllowRandomizer`, `bHasWorldTreeAura`, `SpawnerClass`, `LayerNames`, `WorldName` (uniform `PL_MainWorld5`), `RespawnCoolTime`.
- **Passive:** `SortKeyJP`.

### C. Redundant / derivable elsewhere

The information is already available from another emitted field, so the column is duplicative.

| column (table) | why redundant |
|---|---|
| `Rank` (DT_BuildObjectDataTable) | constant `1`; the UI shows the *unlocking tech's* level instead |
| `Tier` (DT_TechnologyRecipeUnlock) | secondary ordering; `LevelCap` already drives tree grouping |
| `IconName` (DT_TechnologyRecipeUnlock) | tech tile icon is derived from the unlocked item/building instead |
| `SwimDashSpeed` (DT_PalMonsterParameter) | tracks `SwimSpeed`; the base swim speed already shown |
| `RadiusType` (DT_PalSpawnerPlacement) | `StaticRadius` already emitted; the S/NPC type adds nothing |
| `LotteryValueBlueprintClassName` (DT_DungeonRewardSpawnerLotteryDataTable) | duplicate of the soft-class stem already used |
| `Rate` (DT_ArenaSoloRewardTable) | uniformly `100` in the data (guaranteed rewards) |

### D. Niche / low wiki value — real, but rarely wanted

Genuine data with a coherent meaning, judged not worth the UI/i18n cost for a general wiki.
**2026-07-19 sweep:** every D entry was distribution-scanned; the meaningful ones were added
(see §9), several turned out dead-in-export (moved to §10-A above). What remains, with the
scan evidence:

- **Pal:** `StatusResistUpRate` (only two values `{100, 1}`, semantics unverified),
  `ViewingAngle` (only `{90, 360}` — near-uniform), `NooseTrap` (`true` on 50 pals but the
  mechanic is unverified — presenting it risks misinformation), `BiologicalGrade`
  (values 0–9/99/999, meaning unknown), boss-variant flags
  (`IsBoss`/`IsTowerBoss`/`IsRaidBoss`/`UseBossHPGauge`/`IgnoreLeanBack`/…).
- **Waza:** `MaxHeightDiff` (varied 250–9999 but the gameplay default/sentinel is unclear, so
  a shown value could mislead), `bIsWeaponDamage` (3 rows) / `bIsExplosionDamage` (16 rows),
  `IsLeanBack`/`CameraShake`/`ForceRagdollSize` (animation feel),
  `SpecialAttackRateInfos`/`WazaCustomExecuteConditions` (conditional multipliers — complex
  nested shapes, tiny audience).
- **Passive:** `TargetElementType` (set on 96 rows but concentrated in non-displayable
  partner-buff/test rows), non-mutation `Add*` applicability flags (dominated by
  non-displayable rows: AddArmor/AddAccessory 158 incl. test rows), `AddInvokeTriggerType_1/2`.
- **Item/loot:** lottery `BonusExpRate` (per-pickup XP), `bIsWeaponDamage`-style internals.
- **Quest:** `bReorderable` (quest-log UI flag).
- **NPC/text:** `DT_UniqueNPC` cosmetics (Face/Hair/Clothes/Scale),
  `DT_MapRespawnPointInfoText` `SpawnPoint_*` descriptions, partner-skill riding-mode
  internals.

### E. Collapsed by pipeline design — intentional aggregation

The raw column varies per row, but the pipeline deliberately merges rows and keeps the
best/union value. **Investigated in detail 2026-07-19** — what each collapse actually loses:

**E1. `Level` (DT_PalDropItem) — the one collapse with real player-facing distortion.**
`_drops` unions items across a pal's rows and keeps each item's best rate. Scan of the
1044-row table: 894 CharacterIDs; **128** have multiple level-banded rows, and in **126** of
those the *item sets differ across levels*. Example — Anubis: Lv 0 drops
`Bone / PalUpgradeStone3 / TechnologyBook_G2`; the Lv 80 row *adds*
`PalAwakening_Material_Ground ×10–20` and `WorldTreeRelic_01..05`. The site shows the union
unconditionally, so **level-gated drops (World Tree relics, awakening materials) appear to
drop from any-level spawns — they don't**. The 2 remaining pals (MimicDog, BOSS_MimicDog,
9 level bands) keep the same items but scale rates/counts, so best-rate overstates low-level
farms. **Fix planned** (deferred-systems plan §1): emit a per-drop `minLevel`.

**E2. `Power` vs `DisplayPower` (DT_WazaDataTable) — negligible.** Of 380 rows with both,
only **3** differ (`Unique_LegendDeer_RadiantPurge_Otomo`, `GrassGolem[_Dark]_PartnerSkill`)
— all partner-skill internals, none in a player-visible learnset. Loss ≈ zero.

**E3. per-row `Weight` (DT_PalWildSpawner) — marginal.** The emitted `weightPct` sums a
pal's row-weights per spawner. Across 422 spawners, **37** (spawner, pal) pairs have
differing weights across their rows; **0** of those correlate with day/night, **14**
correlate with level band (MimicDog on `worldtree_9_*` spawners: the wider level band is
rarer than the pooled share suggests). Loss: a slightly smoothed rarity signal on 14 pairs.

**E4. multi-slot `ItemSlot2..15_ProbabilityPercent` (DT_FieldLotteryNameDataTable) — zero
loss.** 174 of 511 lottery-name rows are multi-slot, but every multi-slot consumer
(dungeons.py, item_sources.py) reads all 15 slots. Only the ranch path assumes single-slot,
and it *asserts* that shape on every pipeline run — the assertion holds, so nothing is lost.

### F. Deferred — real value, but needs a new page or section

Not "dropped" in the sense of worthless — these are whole systems the site doesn't model yet.
**Implementation plan (2026-07-19):** every F item now has a concrete plan — data source,
emit shape, frontend surface, effort, and recommended order — in
`docs/superpowers/specs/2026-07-19-palworld-deferred-systems-plan.md` (the per-level-drops
fidelity fix from §10-E1 is its first item). Listed here so the classification is complete:

| columns / tables | the system it would power |
|---|---|
| `DT_LabResearchDataTable` `EffectType`/`EffectValue`/materials/work | the research-lab upgrade system (a dedicated page) |
| `DT_PlayerStatusRankMasterDataTable` `RequiredRelicNum`/`EffectRate`/`ResetRequiredMoney` | effigy (Lifmunk) buff progression |
| `DT_PalMonsterParameter` `FirstDefeatRewardItemID`, `ExpRatio` | first-defeat rewards + XP-yield notes on pal pages |
| `DT_PassiveSkill_Main` `LotteryWeight` | how commonly a passive rolls (rarity odds) |
| raid `EggPalIDAndWeight`, `InfoList` level/moveset | summon-ritual boss stats + capture pool |
| merchant lottery `Weight` | wandering-caravan stock rarity |
| `DT_PalInvader(+Reward)`, `DT_BaseCampTask`/`LevelData`, `DT_MapObjectAssignData`/`FarmCrop`/`ItemProduct`, `DT_PaldexDistributionData` | base-raids, base-camp progression, farming, per-species spawn clouds |
