# Palworld blueprint detail: craft target + acquisition sources

2026-07-15. Improves the item detail page for blueprint (schematic) items and the
items list. Three user-facing goals:

1. Show which item a blueprint lets you craft.
2. Show **every** data-supported way to obtain each blueprint.
3. Surface blueprints that have **no** obtain method at all.

## Findings (raw-data ground truth)

594 `Blueprint_*` rows in `DT_ItemDataTable_Common`; 582 pass the has-name gate
(101 of those `bLegalInGame=false` → hidden). 113 have no source anywhere in the
export — mostly tier 2–5 cosmetic-head variants and `Blueprint_Salvage_*` baits
referenced only by item/recipe tables (dead data), but some are legal+visible.

Acquisition surfaces that reference blueprint item ids:

| Surface | Raw source | Grounding |
|---|---|---|
| Treasure chests (overworld + dungeon interior share pools) | `DT_ItemLotteryDataTable` fields `Grass01/02`, `Forest01/02`, `Desert01/02`, `Snow01/02`, `Volcano01/02`, `<Island>02`, `<Island>_Treasure` | `BP_PalMapObjectSpawner_Treasure_<Biome>_Grade_0N` placed in world cells; dungeons reference the same fields via `DT_DungeonItemLotteryDataTable`. `<Island>02` fields have no BP consumer (runtime/C++ binding) but the family names the island unambiguously. |
| Fishing | fields `*_Fishing`, `*_FishPond` | `DT_PalFishingSpotLotteryDataTable` |
| Salvage (fishing junk spots) | fields `Salvage_Rank1/2` | `BP_MapObject_FishingJunkSpot_Rank2` |
| Supply drops | fields `*_Supply` | `BP_SupplySpawner_*` |
| Faction camp chests | fields `EnemyCamp_*` | `BP_NPCCamp_*` presets |
| Oil rig chests | fields `Oilrig_*` / `Oilrig_Mini_*` / `Oilrig_Large_*` | `BP_OilrigTreasureBoxSpawner*` |
| Treasure-map digs | fields `TreasureMap01–05` (same id as the map item) | `BP_PalTreasureMapWorldSubsystem` |
| Relic recycler | fields `AncientRelicRecycler_*` | already emitted in `recycler.json` → frontend inverse, no new emit |
| Ancient shrines | `DT_ItemPickupDataTable`, joined to placed shrines already in `markers/*.json` (`reward.item`) | 106 placed shrines |
| Merchants | `DT_ItemShopCreateData_Common` groups; NPC → `BP_PalShopVenderDataComponent.itemShopSimpleLotteryTableName` → `DT_ItemShopLotteryData` → group. Blueprint-selling groups: `Village_Shop_1`, `Desert_Shop_2`, `Volcano_Shop_2`, `Medal_Shop_1` (Dog Coins), `Arena_Shop_1` (Battle Tickets) | derived once; emitter warns if a new group starts selling blueprints |
| Arena rewards | `DT_ArenaSoloRewardTable` first/repeat clear per rank | 3 blueprint rewards |
| Pal / boss drops | already emitted (`item.droppedBy`) | 24 blueprints |
| Dungeon chest/boss lotteries | already emitted (`dungeons.json`, "found in dungeons" row) | existing UI |

Lottery slot math (same as dungeons): per-slot independent probability ×
weight-share within slot; rows carry `TreasureBoxGrade` (chest tier, 1–6 —
displayed as "Chest tier N", the same unverified-but-shipped assumption as the
dungeons UI).

Area display names: game L10N where a clean key exists (`DT_WorldMap_Common_Text`:
Sakurajima, Feybreak, Sunreach, The World Tree, the three oil-rig names), app-side
17-language labels for the mainland biome nouns (grasslands / forest / desert /
snowfields / volcano) and the romaji proper noun Yakushima.

## Data design (tools)

All in the `catalog` stage (new helper module `blueprint_sources.py`), items.json
entries gain:

* `unlocksCraft: [itemId]` — inverse of `recipe.unlockItemId` (any gate item, not
  just blueprints).
* `sources: [SourceEntry]` — only on blueprint-type items. Kind-discriminated:
  - `{kind:'chest'|'fishing'|'supply'|'camp'|'oilrig', area, grade, chance}`
    — merged per (kind, area): min grade, max chance (percent, slotProb ×
    weight-share, 2dp).
  - `{kind:'treasureMap', item, grade, chance}` — `item` links to the map item.
  - `{kind:'salvage', rank, chance}`
  - `{kind:'shrine', count}` — count of placed shrine markers granting it.
  - `{kind:'merchant', shop, price, currency}` — `shop` ∈ village/desertWeapon/
    volcanoWeapon/medal/arena; `price` = OverridePrice or item Price; `currency`
    = item id (Money / DogCoin / BattleTicket).
  - `{kind:'arena', rank, repeat?}`
* `noSource: true` — blueprint items with no `sources`, no `droppedBy`, no
  dungeon-lottery appearance (dungeons.json), and no recycler output
  (recycler.json). Reads sibling emitted datasets like catalog already reads
  pals.json.

`locales/<tag>/labels.json` gains `area: {familyKey: localizedName}` for the
game-L10N area names (Sakurajima, DarkIsland→Feybreak, SkyIsland→Sunreach,
WorldTree, Oilrig, OilrigMini, OilrigLarge).

## Frontend design (palworld app)

`ItemDetailPage`:
* "Unlocks crafting" row (top of Obtain section) — ItemLink chips from
  `unlocksCraft`.
* Obtain section renders `sources` grouped by kind, one labelled row per kind,
  chips per entry: area/shop/rank label + chest-tier badge + chance. Treasure-map
  chips are ItemLinks; shrine chip shows ×count; merchant chips show price +
  currency item link.
* Relic-recycler inverse: recycler.json already loaded — recipes whose slots
  contain the item render a "From relic recycling" row (input relic ItemLinks).
* Blueprint with nothing at all → muted "No known source" note in Obtain.

`ItemListPage`: when the Blueprint category chip is active, an extra "No known
source" filter chip (uses `noSource`).

New `blueprintStrings.ts` (17 languages) under the `bp.` namespace: kind labels,
biome area labels, shop labels, arena rank labels, no-source strings, chance/
tier formatting reuses `dungeon.chestTier`.

## Testing

* tools: unit test for the source collector (synthetic raw fixtures, mirroring
  test_dungeons style) — chest merge math, shop mapping warning, noSource logic.
* frontend: e2e spec for a blueprint detail page (sources rows + unlocks-craft
  row) and the no-source list filter.
* Live check on :15174 after rebase-merge back to master.
