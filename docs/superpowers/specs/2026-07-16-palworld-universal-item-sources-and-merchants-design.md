# Palworld: universal item sources + merchant pages — design

**Date:** 2026-07-16
**Status:** approved (brainstorming), pending spec review
**Scope:** `tools/apps/palworld`, `frontend/apps/palworld`, `data-palworld` artifacts

## Goal

Today only **blueprint-family items** (`Blueprint_*`) show their full set of acquisition
channels ("How to obtain": chests, fishing, camps, merchants, raids, arena, shrines) on their
item page. Every other item shows only a subset (recipe, pal drops, unlocking tech, dungeons).

Make **every item** surface **all** of its acquisition channels, exactly like blueprints do.
As part of this, promote **merchants** to first-class entities: a browsable merchant catalog
with a detail page per merchant (inventory + prices, currency, portrait/name, and map
locations), replacing today's five hand-mapped blueprint-selling shops.

## Background (verified during brainstorming)

- The **frontend already renders `item.sources` generically** (`BlueprintSourceRows` in
  `features/items/BlueprintSections.tsx`, called unconditionally from `ItemDetailPage`). The
  blueprint restriction lives **entirely in the tools emitter**.
- `tools/apps/palworld/blueprint_sources.py` `collect_sources` filters **every** channel with
  `_is_blueprint(iid)` and `iid in item_id_set`. Removing the blueprint gate is the core change.
- **Volume is already bounded**: `_merge_graded` collapses lottery rows to one entry per
  `(kind, area)` keeping best chance + lowest chest grade. 337 non-blueprint items appear in
  field lotteries; none will produce runaway `sources[]` arrays.
- **Merchant join is clean (0 orphans).** 38 shop groups (`DT_ItemShopCreateData_Common`) each
  trace to a vendor NPC through 36 shop lottery tables:
  vendor NPC BP `itemShopSimpleLotteryTableName` (`Blueprint/Character/NPC/**`) →
  `DT_ItemShopLotteryData_Common` row → `lotteryDataArray[].ShopGroupName` →
  `DT_ItemShopCreateData_Common` group → `productDataArray`.
  - Mapping is ~1:1 table→group. Exceptions: Vagrant `TestTable_1` → 3 groups
    (`Vagrant_Trader_1_1..3`); Village `TestTable_2` → 1 group shared by 2 NPCs
    (Recruiter + SalesPerson).
  - The **25 Caravan shops** (`Caravan_Shop_1..25`) are each a distinct wandering-trader NPC
    variant (`BP_NPC_SalesPerson_Caravan_0N`, `BP_NPC_Male_Trader01_vNN`) with its own stock.
- **Currency** is per-group in `DT_ItemShopSettingData_Common` — only 3 special rows
  (`Medal_Shop_1`→`DogCoin`, `Bounty_Shop_1`→`BountyProof_1`, `Arena_Shop_1`→`BattleTicket`);
  every other group defaults to `Money` (gold).
- **Merchant NPCs are already extracted as `npc` map markers** (`maps/extract.py`
  `_extract_npcs` + `_npc_name_icon`), carrying localized `nameByLng`, a portrait `icon`
  stem, and world locations per map. This supplies merchant name/icon/locations.

## Part A — item acquisition sources for all items

### Tools

- Rename `blueprint_sources.py` → `item_sources.py` (the module is no longer
  blueprint-specific). Update the import in `catalog.py` and the memory note
  `palworld-blueprint-acquisition-channels`.
- **Drop the `_is_blueprint(iid)` gate** in all channel collectors (field lotteries, raids,
  arena, shrines). Keep the `iid in item_id_set` gate (only emit for items that ship).
- Keep `_merge_graded`'s `(kind, area)` collapse — the volume control.
- **`noSource` stays blueprint-only.** It answers "does this craftable schematic have any
  reachable acquisition root?", a concept that only applies to `Blueprint_*` items. The
  reachability fixpoint in `catalog.py` is unchanged; regular items are never stamped.

### Frontend

- No rendering-logic change (already generic). For honesty, rename:
  `features/items/BlueprintSections.tsx` → `features/items/ItemSources.tsx`;
  `BlueprintSourceRows` → `ItemSourceRows` (keep `UnlocksCraftSection`, still
  blueprint-oriented, in the same file or a sibling). Update the import in `ItemDetailPage`.
- The `BlueprintSource` type in `lib/catalog.ts` is renamed `ItemSource` and its doc comment
  broadened; the `merchant` variant changes (see Part B).

## Part B — merchants dataset

### New tools stage: `merchants.py`

Emits `data-palworld/merchants.json` `{merchants: [MerchantEntry]}` and
`data-palworld/locales/<tag>/merchants.json` `{id: {name}}`. Runs **after** `maps`
(reads `markers/*.json` for locations) and after item text is available.

**Merchant entity — one per shop group (38), plus an aggregated Caravan merchant (+1).**
The Caravan aggregation is behind a module constant `AGGREGATE_CARAVAN = True` so it can be
toggled/pruned after review. When on: the 25 `Caravan_Shop_*` groups are ALSO emitted as a
single `Caravan` merchant whose `products` is the union of all 25 (deduped by item, keeping
the lowest price), while the 25 individual groups remain emitted too ("build all, I will
check").

```
MerchantEntry {
  id: string            // shop-group key (e.g. "Village_Shop_1"); caravan union = "Caravan"
  currency: string      // item id from DT_ItemShopSettingData_Common; default "Money"
  icon?: string         // NPC portrait stem (icons/<stem>), from the vendor NPC
  products: [{ item: string, price: number, num: number }]  // price = OverridePrice || item base Price
  npcIds?: string[]     // vendor NPC identity keys, for the map-location join
}
```

- **Name / icon**: resolved from the owning vendor NPC via the existing `_npc_name_icon`
  resolver (localized `nameByLng` → `merchants.json` locale files; portrait stem → `icon`).
  The join is vendor-BP class (e.g. `BP_NPC_SalesPerson_Weapon_2`) → NPC identity key used by
  the marker pipeline (`SalesPerson_Weapon_2`). Merchants whose NPC has no localized name fall
  back to app-side i18n strings (`merchant.name.<id>`), mirroring the `bp.area.*` pattern.
- **Locations**: reuse the emitted `npc` markers. The detail page shows a "view on map" chip
  per map the merchant's NPC appears on, using the same marker search pattern as shrine chips
  (`search={ map, q: merchantName }`). No new coordinate emission for v1.

### `catalog.py` merchant source shape

- The merchant loop in `collect_sources`/`item_sources.py` emits a source **per shop group**
  for **every** product item (blueprint or not). The `_SHOPS` hand-map and its
  "unmapped shop group" warning are removed.
- Merchant source entry changes:
  `{ kind: 'merchant', merchant: <merchantId>, price: <int>, currency: <itemId> }`
  (was `{ shop: <labelKey>, price, currency }`).
- **Caravan collapse on item pages**: when `AGGREGATE_CARAVAN` is on, an item's merchant
  sources point a caravan product at the single `Caravan` merchant id (deduped, lowest
  price) rather than emitting up to 25 near-identical caravan chips. The 25 individual
  merchant pages still exist and are reachable from `/merchants`; they're just not fanned
  out onto every item they sell.
- `catalog.py` calls `merchants.py` (or imports its collector) so `merchants.json` and the
  item `sources[]` merchant entries are produced consistently from one shop-group scan.

## Part C — frontend merchant pages

- `lib/merchants.ts`: `loadMerchants(lng)` → `{ file, byId, text }`, mirroring `loadItems`.
- `features/merchants/MerchantListPage.tsx` (`/merchants`): browsable index (mirror
  `/items` list — search + grid of name/icon/currency).
- `features/merchants/MerchantDetailPage.tsx` (`/merchants/$id`): header (portrait + name +
  currency label), inventory grid (item chips with price + currency glyph), "view on map"
  chips for each map the merchant appears on. Not-found + loading states like item pages.
- `ItemSources.tsx` merchant chip: resolve merchant name from the merchants bundle, link to
  `/merchants/$id`, show price + currency glyph.
- Router: register `/merchants` and `/merchants/$id`. Nav: add a "Merchants" entry.
- i18n: `merchant.*` keys (title, list labels, currency-agnostic strings) and any
  `merchant.name.<id>` fallbacks across the 17 languages in `i18n.ts` / locale files.

## Testing

**tools**
- A known non-blueprint item (e.g. a metal ingot / ore) gains chest and/or merchant sources
  after the gate removal.
- `merchants.py`: every shop group with products yields a merchant; currency resolves
  (`DogCoin`/`BountyProof_1`/`BattleTicket`/`Money`); the aggregated `Caravan` merchant's
  product set equals the union of the 25 caravan groups.
- `noSource` remains stamped only on `Blueprint_*` items.

**frontend**
- Item detail renders `sources` rows for a non-blueprint item.
- Merchant detail renders inventory + a map chip; merchant list lists all emitted merchants.

## Files touched

- **tools:** rename `blueprint_sources.py`→`item_sources.py` (broaden), new `merchants.py`,
  `catalog.py` (merchant source shape + emitter call), `tests/`.
- **frontend:** `lib/catalog.ts` (source type), new `lib/merchants.ts`,
  `features/merchants/*`, `features/items/ItemSources.tsx` (rename), `ItemDetailPage.tsx`,
  router, nav, `i18n.ts` + locale strings.
- **data artifacts (data-palworld):** `merchants.json`, `locales/<tag>/merchants.json`;
  every item's `sources[]` now populated (merchant entries reshaped).

## Out of scope / deferred

- Embedded coordinate pins on merchant pages (using marker query chips instead for v1).
- Any pruning of the 38 individual caravan pages vs the aggregated one — deferred to user
  review after the first build (`AGGREGATE_CARAVAN` toggle preserved for this).
- `noSource` for non-blueprint items.
