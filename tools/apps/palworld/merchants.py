"""Merchant catalog + per-item merchant acquisition sources.

Scans the item-shop tables and their vendor NPC blueprints to produce two
things ``catalog.py`` consumes:

  * ``data-palworld/merchants.json`` ``{merchants: [MerchantEntry]}`` — one
    merchant per shop group, plus an aggregated ``Caravan`` merchant (union of
    the wandering-caravan groups) when ``AGGREGATE_CARAVAN`` is on.
  * ``{itemId: [merchant source]}`` — the merchant channel merged into each
    item's ``sources`` list (caravan products collapse onto the single
    ``Caravan`` merchant so an item isn't fanned out across ~25 near-identical
    chips).

Shop-group -> vendor join (verified 2026-07-16): each vendor NPC BP under
``Blueprint/Character/NPC/**`` carries ``itemShopSimpleLotteryTableName`` naming
a ``DT_ItemShopLotteryData_Common`` table whose ``lotteryDataArray[].ShopGroupName``
lists the shop group(s) it draws from (mapping is ~1:1 across 44 vendor BPs).
Products live in ``DT_ItemShopCreateData_Common`` (``productDataArray``); the
currency (gold — item id ``Money`` — unless overridden) in
``DT_ItemShopSettingData_Common``.

Merchant display names are app-side i18n labels keyed by a small vendor-type
slug (``nameKey``, ``merchant.name.<slug>`` in the frontend): the vendor NPCs
are generically named in-game, so a curated label reads better than the raw NPC
name, and the shop-group id (shown mono in the UI) disambiguates same-typed
merchants. Map locations are a deferred follow-up — the emitted ``npc`` markers
drop the vendor identity — so ``vendor`` (the BP class stem) is emitted to make
that later join cheap.

MerchantEntry: ``{id, nameKey, currency, vendor?, products: [{item, price, num?}]}``.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

from .maps.common import read_rows
from .maps.bounds import assign_map
from .maps.extract import _LEVEL_REL, _extract_npcs, _npc_name_icon

_NONE = {None, "None", ""}

# Aggregate the wandering-caravan shop groups into one "Caravan" merchant (the
# 25 individual groups are still emitted as their own pages). Kept as a toggle
# so the individual-vs-aggregate split can be pruned after review.
AGGREGATE_CARAVAN = True
CARAVAN_ID = "Caravan"
_CARAVAN_RX = re.compile(r"^Caravan_Shop_\d+$")

# vendor BP class stem (BP_NPC_<stem>) -> merchant name-key slug. Caravan
# vendors (SalesPerson_Caravan_*, Male_Trader01_*) resolve to "caravan" by the
# rule in _name_key; only the fixed-identity vendors need listing here.
_VENDOR_NAME_KEY = {
    "SalesPerson": "general",
    "Recruiter": "general",
    "SalesPerson_2": "general",
    "SalesPerson_3": "general",
    "SalesPerson_4": "general",
    "SalesPerson_5": "general",
    "SalesPerson_Weapon_1": "weapon",
    "SalesPerson_Weapon_2": "weapon",
    "MedalTrader": "medal",
    "BountyTrader": "bounty",
    "ArenaShop": "arena",
}

# Location-flavored slug keyed by the shop-group name prefix. For generically
# named vendors (SalesPerson_*) this wins over the vendor map, so the six
# same-typed town shops don't all render as an identical "Merchant" card; it is
# also the fallback when the vendor BP can't be resolved (e.g. groups with no
# simple-lottery vendor, like the vagrant traders).
_GROUP_NAME_KEY = {
    "Village": "village",
    "Desert": "desert",
    "Volcano": "volcano",
    "Wander": "wander",
    "Dungeon": "dungeon",
    "Caravan": "caravan",
    "Medal": "medal",
    "Bounty": "bounty",
    "Arena": "arena",
    "Vagrant": "vagrant",
}

# Emit order of the merchant list, by name-key.
_KEY_ORDER = [
    "village", "desert", "volcano", "wander", "general", "weapon",
    "caravan", "dungeon", "medal", "bounty", "arena", "vagrant",
]

_LOTTERY_TBL_RX = re.compile(
    r'"itemShop(?:Simple)?LotteryTableName"\s*:\s*(?:\{[^{}]*?"Key"\s*:\s*)?"([^"]+)"'
)


def _name_key(group: str, vendor: str | None) -> str:
    """Merchant name-key slug for a shop group. A specialised vendor stem wins
    (it knows Desert/Volcano ``_Shop_2`` are weapon vendors) and caravan
    vendors collapse; a generic vendor ('general') defers to the group-name
    prefix so town shops get location-flavored labels; else warn + 'general'."""
    vkey = None
    if vendor:
        if vendor in _VENDOR_NAME_KEY:
            vkey = _VENDOR_NAME_KEY[vendor]
        elif vendor.startswith(("SalesPerson_Caravan", "Male_Trader01")):
            return "caravan"
    if vkey and vkey != "general":
        return vkey
    prefix = re.split(r"_(?:Shop|Trader)", group, maxsplit=1)[0]
    key = _GROUP_NAME_KEY.get(prefix)
    if key:
        return key
    if vkey:
        return vkey
    print(f"merchants: WARNING unmapped shop group {group} (vendor {vendor}) — using 'general'")
    return "general"


def _vendor_by_group(raw: Path) -> dict[str, str]:
    """{shopGroup: vendor-BP-stem} from the vendor NPC blueprint subtree."""
    lottery = read_rows(raw / "DataTable/ItemShop/DT_ItemShopLotteryData_Common.json")
    tbl_groups = {
        tbl: [x.get("ShopGroupName") for x in (row.get("lotteryDataArray") or [])]
        for tbl, row in lottery.items()
    }
    out: dict[str, str] = {}
    npc_dir = raw / "Blueprint/Character/NPC"
    if not npc_dir.is_dir():
        print("merchants: WARNING Blueprint/Character/NPC missing — no vendor stems")
        return out
    for f in sorted(npc_dir.rglob("BP_NPC_*.json")):
        txt = f.read_text(encoding="utf-8", errors="ignore")
        if "LotteryTableName" not in txt:
            continue
        stem = f.stem[len("BP_NPC_"):]
        for tbl in _LOTTERY_TBL_RX.findall(txt):
            for g in tbl_groups.get(tbl, []):
                if g not in _NONE:
                    out.setdefault(g, stem)  # first vendor wins (shared groups)
    return out


def _roll_shares(raw: Path) -> dict[str, int]:
    """{shopGroup: roll %} for groups drawn from a multi-group lottery table —
    the chance a wandering vendor's stock rolls that group (deferred plan §9).
    Groups in single-group tables (fixed stock) are omitted."""
    lottery = read_rows(raw / "DataTable/ItemShop/DT_ItemShopLotteryData_Common.json")
    out: dict[str, int] = {}
    for row in lottery.values():
        entries = [
            (x.get("ShopGroupName"), x.get("Weight", 0) or 0)
            for x in (row.get("lotteryDataArray") or [])
            if x.get("ShopGroupName") not in _NONE
        ]
        total = sum(w for _, w in entries)
        if len(entries) < 2 or total <= 0:
            continue
        for g, w in entries:
            pct = round(w / total * 100)
            if 0 < pct < 100:
                out[g] = pct
    return out


def _load_groups(raw: Path, item_rows: dict, item_id_set: set) -> dict[str, dict]:
    """{shopGroup: {currency, vendor?, products:[{item, price, num?}]}} for
    every group that sells at least one shipped item."""
    create = read_rows(raw / "DataTable/ItemShop/DT_ItemShopCreateData_Common.json")
    setting = read_rows(raw / "DataTable/ItemShop/DT_ItemShopSettingData_Common.json")
    vendor_by_group = _vendor_by_group(raw)
    groups: dict[str, dict] = {}
    for g, row in create.items():
        products = []
        for p in row.get("productDataArray") or []:
            iid = p.get("StaticItemId")
            if iid in _NONE or iid not in item_id_set:
                continue
            price = p.get("OverridePrice") or int((item_rows.get(iid) or {}).get("Price", 0))
            entry = {"item": iid, "price": price}
            num = p.get("ProductNum", 1) or 1
            if num != 1:
                entry["num"] = num
            # Stock: -1 = unlimited, 0 = default (unspecified), >0 = a fixed
            # per-restock buy limit — emit only the actionable finite caps.
            stock = p.get("Stock", 0) or 0
            if stock > 0:
                entry["stock"] = int(stock)
            if (p.get("ProductType") or "").endswith("OnlyPurchaseOne"):
                entry["onceOnly"] = True
            products.append(entry)
        if not products:
            continue
        info: dict = {
            "currency": (setting.get(g) or {}).get("CurrencyItemID") or "Money",
            "products": products,
        }
        if vendor_by_group.get(g):
            info["vendor"] = vendor_by_group[g]
        groups[g] = info
    return groups


def _merchant_metadata(raw: Path, vendors: set[str]) -> dict[str, dict]:
    """Return portrait and placed world locations keyed by vendor BP stem."""
    ui_rows = read_rows(raw / "DataTable/WorldMapUIData/DT_WorldMapUIData.json")
    bounds = {
        "MainWorld": {"min": ui_rows["MainMap"]["landScapeRealPositionMin"],
                      "max": ui_rows["MainMap"]["landScapeRealPositionMax"]},
        "WorldTree": {"min": ui_rows["Tree"]["landScapeRealPositionMin"],
                      "max": ui_rows["Tree"]["landScapeRealPositionMax"]},
    }
    assign_order = [
        {"mapId": "WorldTree", **bounds["WorldTree"]},
        {"mapId": "MainWorld", **bounds["MainWorld"]},
    ]
    level = json.loads((raw / _LEVEL_REL).read_text(encoding="utf-8"))
    npcs = _extract_npcs(raw, level)
    resolve = _npc_name_icon(raw)
    out: dict[str, dict] = {}
    for vendor in vendors:
        matched = [npc for npc in npcs if npc["npcId"].casefold() == vendor.casefold()]
        _, fallback_icon = resolve(vendor)
        icon = next((npc.get("icon") for npc in matched if npc.get("icon")), fallback_icon)
        locations = []
        for npc in matched:
            loc = npc["location"]
            map_id = assign_map(loc, assign_order)
            if map_id:
                locations.append({
                    "map": map_id,
                    "x": loc["X"],
                    "y": loc["Y"],
                    "z": loc.get("Z", 0),
                })
        meta: dict = {}
        if icon:
            meta["icon"] = icon
        if locations:
            meta["locations"] = locations
        out[vendor] = meta
    return out


def collect_merchants(
    raw: Path, item_rows: dict, item_id_set: set
) -> tuple[list[dict], dict[str, list]]:
    """Return ``(merchants, item_merchant_sources)``.

    ``merchants`` is the MerchantEntry list (one per shop group + the optional
    aggregated Caravan merchant). ``item_merchant_sources`` maps each item id to
    its ``{kind: 'merchant', merchant, price, currency}`` source entries, with
    caravan groups collapsed onto ``Caravan`` (lowest price kept)."""
    groups = _load_groups(raw, item_rows, item_id_set)
    roll_shares = _roll_shares(raw)
    metadata = _merchant_metadata(
        raw, {info["vendor"] for info in groups.values() if info.get("vendor")}
    )

    merchants: list[dict] = []
    for g, info in groups.items():
        entry = {"id": g, "nameKey": _name_key(g, info.get("vendor")), "currency": info["currency"]}
        if info.get("vendor"):
            entry["vendor"] = info["vendor"]
            entry.update(metadata.get(info["vendor"], {}))
        if g in roll_shares:
            entry["rollPct"] = roll_shares[g]
        entry["products"] = info["products"]
        merchants.append(entry)

    if AGGREGATE_CARAVAN:
        caravan_groups = [g for g in groups if _CARAVAN_RX.match(g)]
        if caravan_groups:
            best: dict[str, dict] = {}
            for g in caravan_groups:
                for p in groups[g]["products"]:
                    cur = best.get(p["item"])
                    if cur is None or p["price"] < cur["price"]:
                        best[p["item"]] = p
            caravan_meta = [metadata.get(groups[g].get("vendor", ""), {}) for g in caravan_groups]
            caravan_locations = [loc for meta in caravan_meta for loc in meta.get("locations", [])]
            aggregate = {
                "id": CARAVAN_ID,
                "nameKey": "caravan",
                "currency": "Money",
                "products": list(best.values()),
            }
            aggregate_icon = next((meta.get("icon") for meta in caravan_meta if meta.get("icon")), None)
            if aggregate_icon:
                aggregate["icon"] = aggregate_icon
            if caravan_locations:
                aggregate["locations"] = caravan_locations
            merchants.append(aggregate)

    rank = {k: i for i, k in enumerate(_KEY_ORDER)}
    merchants.sort(key=lambda m: (rank.get(m["nameKey"], len(rank)), m["id"] != CARAVAN_ID, m["id"]))

    # per-item merchant sources; keyed by target merchant so caravan groups
    # collapse to the single Caravan chip (lowest price) and distinct merchants
    # each keep their own chip.
    by_item: dict[str, dict[str, dict]] = defaultdict(dict)
    for g, info in groups.items():
        target = CARAVAN_ID if (AGGREGATE_CARAVAN and _CARAVAN_RX.match(g)) else g
        for p in info["products"]:
            existing = by_item[p["item"]].get(target)
            if existing is None or p["price"] < existing["price"]:
                by_item[p["item"]][target] = {
                    "kind": "merchant",
                    "merchant": target,
                    "price": p["price"],
                    "currency": info["currency"],
                }
    item_sources = {iid: list(t.values()) for iid, t in by_item.items()}
    return merchants, item_sources
