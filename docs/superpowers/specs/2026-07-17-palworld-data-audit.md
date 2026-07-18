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
| **TypeB** | EMITTED-ONLY | `typeB` in JSON, no frontend reference |
| PassiveSkillName1..4 | DROPPED | accessory passive bonuses |
| WazaID | DROPPED | active skill granted (skill fruits) |
| GrantEffect1..3Id/Time | DROPPED | consumable status effects (glider/buffs) |
| SneakAttackRate, bSleepWeapon, CorruptionFactor, bNotConsumed, bNotAvailableInPVP | DROPPED | weapon/consumable flags |
| DropItemType, TechnologyTreeLock, Item*Class, VisualBlueprint*, FloatValue1, AssetValue, bInTreasureBox, Editor_RowNameHash | DROPPED | engine plumbing |

### DT_ItemRecipeDataTable (`Item/`, 1414 rows)

`Product_Id`, `WorkAmount`, `Material1..5_Id/_Count`, `UnlockItemID` are **USED**.
**`Product_Count` is DROPPED** (recipes yielding >1 — ammo/money/medicine — show inputs but
not output qty). `EnergyType/EnergyAmount`, `CraftExpRate` dropped.

### DT_BuildObjectDataTable (`MapObject/Building/`, 498 rows)

| column | class | notes |
|---|---|---|
| MapObjectId, TypeA, SortId, RequiredBuildWorkAmount, Material1..4_Id/_Count, RequiredEnergyType | USED | |
| **TypeB, TypeUIDisplay** | EMITTED-ONLY | `typeB`/`typeUI` in JSON, unused |
| ConsumeEnergySpeed | DROPPED | power-draw rate |
| BuildCapacity | DROPPED | storage cap / pal work slots |
| InstallMaxNumInBaseCamp, placement flags, BuildExpRate, bIsPaintable | DROPPED | build constraints |

No building HP column exists in this table (HP lives in the actor Blueprint components).

### DT_TechnologyRecipeUnlock (`Technology/`, 588 rows)

`UnlockBuildObjects`, `UnlockItemRecipes`, `Name`, `Description`, `LevelCap`, `Cost`,
`IsBossTechnology`, `RequireDefeatTowerBoss`, `RequireTechnology`, `RequireResearchId` — all
USED. `IconName`, `Tier` dropped.

### DT_LabResearchDataTable (`Lab/`, 168 rows) — largely unmodeled

Only `TextId` leaks through (as a tech's `requireResearchName`). The **entire research-lab
upgrade system** — `EffectType`/`EffectValue` (e.g. +10% craft speed), materials, work — is
DROPPED. A dedicated research page could be built almost entirely from these dropped columns.

### Loot machinery (shared)

`DT_ItemLotteryDataTable` (8777) + `DT_FieldLotteryNameDataTable` (511) power all loot
channels. `FieldName`, `SlotNo`, `WeightInSlot`, `StaticItemId`, `MinNum/MaxNum`,
`TreasureBoxGrade` (→ `grade`, meaning still **UNVERIFIED**), and per-slot probabilities are
USED. `NumUnit`, `BonusExpRate` dropped. Recycler is built from the recycler **Blueprint**
(`BP_BuildObject_AncientRelicRecycler`) plus these two tables, not a dedicated DataTable.

---

## 2. Domain: Pals / Skills / Passives / Breeding

Pipeline: `encyclopedia.py`, `breeding.py` → `pals.json`, `passives.json`, `breeding.json`.

### DT_PalMonsterParameter (`Character/`, 753 rows; ~299 pass the roster gate)

The single richest table and the biggest reservoir of unused data.

| column | class | notes |
|---|---|---|
| ZukanIndex(+Suffix), Size, Rarity, ElementType1/2, Hp, MeleeAttack, ShotAttack, Defense, CraftSpeed, Stamina, FoodAmount, CaptureRateCorrect, Price, MaleProbability, SlowWalk/Walk/Run/RideSprint/Transport/Swim speeds, AIResponse, Nocturnal, WorkSuitability_* (13), BestWorkSuitability, PassiveSkill1..4, Tribe, CombiRank, IgnoreCombi | USED | stats/work/filters/breeding |
| **GenusCategory** | EMITTED-ONLY | `pals[].genus` typed but never rendered |
| **MaxFullStomach** | EMITTED-ONLY | in `stats` but not in rendered stat list |
| Support | DROPPED | the 4th combat stat — conspicuous gap |
| Friendship_HP/ShotAttack/Defense/CraftSpeed | DROPPED | condense/soul growth |
| Enemy{MaxHP,ReceiveDamage,InflictDamage,WazaCoolTime}Rate | DROPPED | alpha/boss scaling |
| SwimDashSpeed, FullStomachDecreaseRate, ExpRatio, StatusResistUpRate | DROPPED | |
| ViewingDistance/Angle, HearingRate, Predator, Edible, NooseTrap, BiologicalGrade | DROPPED | ecology/senses |
| Mesh capsule/size, boss flags, FirstDefeatRewardItemID, CombiDuplicatePriority | DROPPED | |

### Other pals tables (all USED except as noted)

- **DT_WazaDataTable** (384) — active skills. USED: WazaType, Element, Category, DisplayPower,
  CoolTime, Min/MaxRange, Strength (→ skill-fruit flag). **DROPPED: `EffectType1/2` +
  `EffectValue1/2` (on-hit status ailment + magnitude), `MaxHeightDiff`** — core combat info.
- **DT_WazaMasterLevel** (5772) — learnset (PalId/WazaID/Level), fully USED.
- **DT_PartnerSkill** (50), **DT_PartnerSkillParameter** (682), **DT_PartnerSkillAppendText**
  (160) — partner skill shape/params/text, USED (riding-mode internals dropped).
- **DT_PassiveSkill_Main** (1905; 115 displayable) — USED: Category, Rank, EffectType/Value/Target
  1..4, AddMutationPal, OverrideDescMsgID. **DROPPED: `Invoke*` flags (when a passive applies —
  worker/riding/reserve/basecamp/always), `LotteryWeight` (roll odds), `TargetElementType`**.
- **DT_PalDropItem** (1044) — 10 drop slots, USED. `Level` dropped (per-level variation collapsed
  to max rate).
- **DT_PalCombiUnique** (258) — unique breeding recipes, fully USED.
- **DT_PalBPClass** (940) — resolves ranch-production BP path; AssetPathName USED.
- Text tables (`DT_PalNameText`, `DT_PalLongDescriptionText`, `DT_PalFirstActivatedInfoText`,
  `DT_SkillNameText`, `DT_SkillDescText`) — USED per-locale.
- **DT_PalRaidBoss_Common** (11) — summon-altar rituals. USED: reward pal (`EggPalIDAndWeight`).
  **DROPPED: `SuccessItemList`/`SuccessAnyOneItemList` (the guaranteed + pick-one ritual
  rewards), boss level/moveset** — the site shows summon *materials* but not what you *get*.

---

## 3. Domain: Maps / Spawns / Markers / Regions

Pipeline: `maps/extract.py` + `maps/emit.py` → `maps.json`, `markers/<map>.json`,
`spawns/<pal>.json`, `regions/<map>.json`, `areas.json`. Localized marker text is split into
`locales/` by design (not a drop).

| table | rows | key finding |
|---|---|---|
| DT_PalWildSpawner | 1691 | Pal_1..3 / Lv band / OnlyTime(Night) USED. **`Weight` (per-pal spawn probability) and `NumMin/NumMax` (pack size) DROPPED.** OnlyWeather constant Undefined. |
| DT_PalSpawnerPlacement | 8253 | SpawnerName/Type/Location USED. **`StaticRadius` (spawn-zone radius, S=15000) DROPPED** — could render spawn areas instead of points. |
| DT_BossSpawnerLoactionData | 159 | CharacterID/SpawnerID/Location/Level all USED (alpha + wanted bosses). |
| DT_UniqueNPC (+Text, +HumanNameText) | 216 | name/icon/gender USED; cosmetics dropped. |
| DT_PalCharacterIconDataTable / DT_PalBossNPCIcon | 674 / 33 | icon stems USED. |
| DT_ItemPickupDataTable | 107 | shrine reward slots 1–2 USED; **`Item_03` slot DROPPED**. |
| DT_NoteMasterDataTable (+Desc, +Texture) | 64 | collectible notes fully USED. |
| DT_MapRespawnPointInfoText | 199 | fast-travel/tower names USED; descriptions dropped. |
| DT_PlayerStatusRankMasterDataTable | 279 | **NOT read as a table** — its RelicType ordering is hand-mirrored in `extract.RELIC_TYPE_INDEX` (fragile: breaks silently if the game reorders relics). |
| DT_PalFishingSpotLotteryDataTable | 1252 | Only LotteryName→GainItemLotteryName USED for `lootArea`. **`FishShadowId`, `MinLevel/MaxLevel`, `Difficulty`, `OnlyTime` all DROPPED** — a whole fishing dataset unused. |

---

## 4. Domain: Dungeons / Merchants / Quests

Pipeline: `dungeons.py`, `merchants.py`, `item_sources.py`, `quests.py` → `dungeons.json`,
`merchants.json`, `quests.json`.

- **Dungeons** (`DT_Dungeon*`, `DT_CapturedCagePal`): SpawnAreaId joins, chest/reward
  lotteries, cage-pal pools, enemy spawn buckets — all USED. DROPPED: `WeightInSpawnArea`,
  `DungeonEnemySpawn.WeightInSpawnAreaAndRank` (enemy frequency), `PostfixTextId` (dungeon
  type suffix "Ruins"/"Cave").
- **Merchants** (`DT_ItemShop*_Common`, 38/38/3): products, price, currency, vendor→group
  mapping — USED. **DROPPED: `Stock` (restock cap: -1 unlimited / fixed 10–500 — a top wiki
  question), `ProductType` (OnlyPurchaseOne), lottery `Weight` (caravan stock rarity).**
- **Arena** (`DT_ArenaSoloRewardTable`, 7): rank + first/repeat reward items USED. Reward
  `Min/Max/Rate` dropped.
- **Quests** (`DT_PalQuestData` 120, `DT_PalQuestLocationData` 166): id/type/title/desc,
  reward exp+items (from BP CDO), next-quest chain, location coords — USED. **`Range`
  (objective radius) DROPPED.**
- **`DT_PalFishingSpotLotteryDataTable` is never read by any module** despite the
  `item_sources.py` docstring citing it — fishing sources come from `_Fishing`/`_FishPond`
  FieldNames inside `DT_ItemLotteryDataTable`.

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
