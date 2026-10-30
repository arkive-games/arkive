"""Placed pickups and bosses (from ``scan``'s ``placements.json``) as map markers.

The legend markers ``emit`` reads from ``DT_MapItemData`` are what the in-game map
tracks; these are everything else in the levels:

* **Loot actors.** Each carries a ``LootItemID`` that ``DT_LevelLootDataTable``
  resolves to its contents: items with amounts, Remnant Dust, or equipment. The
  marker's kind is decided by the most notable thing it holds (``KIND_ORDER``),
  using the item's own ``ItemType`` / ``ItemDetailType`` / ``MaterialType`` from
  ``DT_InventoryData`` -- the same split the inventory screen's tabs use, so every
  kind is named by the game's own tab label.
* **Bosses.** The enemy spawners whose class ``DT_CodexEnemyDataTable`` flags as
  ``bIsBoss``, named and pictured by their codex entry. A boss's later phases are
  separate codex entries spawned in the same arena, so bosses within
  ``BOSS_MERGE_DISTANCE`` of each other collapse into the first phase.

Loot the legend already shows -- equipment, keys, shards, memory flowers, and the
major chests themselves -- is left out, so nothing is drawn twice. A legend chest's
own contents are read back through its actor (``chest_contents``), and a book page
is written out in full (``reading``) rather than listed by title.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from .projection import AnchorProjection

# Contents the legend owns: a loot actor holding any of these is the legend's.
# Shards are listed in the legend without an item id, so they go by prefix; keys
# and other story items only when the legend lists that very item (``collect``'s
# ``legend_items``) -- most keepsakes are story items the legend never tracks.
LEGEND_ITEM_PREFIXES = ("Item_Piece_",)
LEGEND_ITEM_TYPES = {"EItemTypes::MemoryFlower"}
BOSS_MERGE_DISTANCE = 3000.0

# Most notable first: a breakable holding a note and some dust is a note.
KIND_ORDER = [
    "notes", "memoryPetal", "storyItem", "treasure", "progression", "accessoryFragment",
    "phantomEdgeMaterial", "weaponMaterial", "accessoryMaterial", "medicineMaterial",
    "phantomEdgeTemper", "weaponTemper", "consumable", "dust",
]
MATERIAL_KINDS = {
    "EItemMaterialType::WeaponUpgradeMaterial": "weaponMaterial",
    "EItemMaterialType::ShaChiWeaponUpgradeMaterial": "phantomEdgeMaterial",
    "EItemMaterialType::AccessoryUpgradeMaterial": "accessoryMaterial",
    "EItemMaterialType::MedicineUpgradeMaterial": "medicineMaterial",
    "EItemMaterialType::WeaponSnapSoulMaterial": "weaponTemper",
    "EItemMaterialType::ShaChiWeaponSnapSoulMaterial": "phantomEdgeTemper",
    "EItemMaterialType::CoreProgressionMaterial": "progression",
}
DETAIL_KINDS = {
    "EItemDetailType::NarrativeItem": "storyItem",
    "EItemDetailType::Treasures": "treasure",
    "EItemDetailType::AccessoryFragment": "accessoryFragment",
    "EItemDetailType::AddAttribute": "progression",  # whole Blackstone, Sha-Chi Amber, cores
}


@dataclass
class Placement:
    """One marker's worth of placed content, before projection."""

    kind: str
    world: tuple[float, float, float]
    level: str
    seed: str  # stable identity for the marker id
    name_key: str | None = None  # Game.locres key of the marker name
    name_text: str | None = None  # a name the game spells out in one language only (NPCDesc)
    contents: list[tuple[str, int]] = field(default_factory=list)  # (item name key, amount)
    dust: tuple[int, int] | None = None
    icon: str | None = None  # per-marker icon override (boss portraits)
    # Game text keys the name / description are formatted into: "{0}" takes the
    # name (or the listed contents); a template without one is prefixed.
    name_template: str | None = None
    desc_template: str | None = None
    # Book pages held, written out in full: (book name key, "page/pages", body key).
    reading: list[tuple[str | None, str, str]] = field(default_factory=list)


# Equipment a loot entry hands out, and the field naming each piece.
EQUIPMENT_FIELDS = (("Weapons", "WeaponID"), ("Accessories", "AccessoryID"), ("Medicines", "MedicineID"))


def book_pages(items: dict[str, dict]) -> dict[str, int]:
    """``{book id: page count}``: how many pages make up each book."""
    out: dict[str, int] = {}
    for item in items.values():
        if item["ItemType"] == "EItemTypes::BookPage" and item.get("IntegrationItemID") not in (None, "None"):
            out[item["IntegrationItemID"]] = out.get(item["IntegrationItemID"], 0) + 1
    return out


def page_reading(item: dict, items: dict[str, dict], books: dict[str, int]) -> tuple[str | None, str, str]:
    """A book page as ``(book name key, "page/pages", body key)``."""
    book_id = item.get("IntegrationItemID")
    book = items.get(book_id or "")
    count = books.get(book_id or "", 0)
    page = f"{item['SequentialIndex']}/{count}" if count else ""
    return (book["ItemName"]["Key"] or None) if book else None, page, item["ItemDescription"]["Key"]


def entry_contents(entry: dict, items: dict[str, dict],
                   equipment: dict[str, str]) -> tuple[list[tuple[str, int]], tuple[int, int] | None]:
    """Everything one loot entry holds, named: ``([(name key, amount)], dust range)``.
    ``equipment`` maps a weapon, Phantom Edge, accessory or medicine id to its name key."""
    contents = []
    for fld, id_field in EQUIPMENT_FIELDS:
        for e in entry[fld]:
            key = equipment.get(e[id_field])
            if key:
                contents.append((key, 1))
    for li in entry["LootItems"]:
        item = items.get(li["ItemId"])
        if item is not None and item_name_key(item):
            contents.append((item_name_key(item), li["MinAmount"]))
    dust = None
    if entry["LootDusts"]:
        d = entry["LootDusts"][0]
        dust = (int(d["MinDust"]), int(d["MaxDust"]))
    return contents, dust


def item_name_key(item: dict) -> str:
    """An item's display-name key. Notes and petals leave ``ItemName`` empty and
    carry their title in ``Subhead`` instead."""
    return item["ItemName"]["Key"] or item["Subhead"]["Key"]


def item_kind(item: dict) -> str:
    if item["ItemType"] in ("EItemTypes::BookPage", "EItemTypes::Book"):
        return "notes"
    if item["ItemType"] == "EItemTypes::MemoryFlowerPetal":
        return "memoryPetal"
    if item["MaterialType"] in MATERIAL_KINDS:
        return MATERIAL_KINDS[item["MaterialType"]]
    if item["ItemDetailType"] == "EItemDetailType::AddAttribute" and item.get("bCanSell"):
        # The reforge talismans share the detail type of Blackstone and the cores,
        # but are bought and sold like any consumable; the upgrades never are.
        return "consumable"
    if item["ItemDetailType"] in DETAIL_KINDS:
        return DETAIL_KINDS[item["ItemDetailType"]]
    if item["ItemId"].startswith(("R_", "TU_")):  # stray notes and keepsakes
        return "storyItem"
    return "consumable"


def is_legend_loot(entry: dict, items: dict[str, dict], legend_items: frozenset[str] = frozenset()) -> bool:
    if entry["Weapons"] or entry["Medicines"] or entry["Accessories"]:
        return True
    for li in entry["LootItems"]:
        item = items.get(li["ItemId"])
        if (li["ItemId"].startswith(LEGEND_ITEM_PREFIXES) or li["ItemId"] in legend_items
                or (item and item["ItemType"] in LEGEND_ITEM_TYPES)):
            return True
    return False


def actor_entry(rec: dict, loot: dict, flow_items: dict[str, list] | None = None) -> dict | None:
    """What a placed actor holds, as a loot entry: its ``LootItemID``'s first entry,
    or its own ``PickupMap`` -- or what its flow graph hands out -- in the same shape."""
    if rec.get("loot"):
        row = loot.get(rec["loot"])
        return row["EntryDatas"][0] if row and row["EntryDatas"] else None
    held = rec.get("pickups") or (flow_items or {}).get(rec.get("flow", ""))
    if held:
        return {"LootItems": [{"ItemId": i, "MinAmount": n, "MaxAmount": n} for i, n in held],
                "LootDusts": [], "Weapons": [], "Medicines": [], "Accessories": []}
    return None


def loot_placement(rec: dict, level: str, loot: dict, items: dict[str, dict],
                   books: dict[str, int] | None = None,
                   legend_items: frozenset[str] = frozenset(),
                   flow_items: dict[str, list] | None = None) -> Placement | None:
    entry = actor_entry(rec, loot, flow_items)
    if entry is None or is_legend_loot(entry, items, legend_items):
        return None
    contents, kinds, reading = [], [], []
    for li in entry["LootItems"]:
        item = items.get(li["ItemId"])
        if item is None:
            continue
        kinds.append((KIND_ORDER.index(item_kind(item)), item))
        if item["ItemType"] == "EItemTypes::BookPage":
            # Written out in full rather than listed: its title is the marker's name.
            reading.append(page_reading(item, items, books if books is not None else book_pages(items)))
        else:
            contents.append((item_name_key(item), li["MinAmount"]))
    dust = None
    if entry["LootDusts"]:
        d = entry["LootDusts"][0]
        dust = (int(d["MinDust"]), int(d["MaxDust"]))
    if not kinds and dust is None:
        return None
    if kinds:
        _, top = min(kinds, key=lambda k: k[0])
        kind, name_key = item_kind(top), item_name_key(top) or None
    else:
        kind, name_key = "dust", None
    # The loot id keeps the seeds of markers already published; the others have none.
    seed = f"{rec['actor']}|{rec.get('loot') or ('flow' if rec.get('flow') else 'pickups')}"
    return Placement(kind, tuple(rec["loc"]), level, seed,
                     name_key=name_key, contents=contents, dust=dust, reading=reading)


def legend_entry(save_guid: str, actors: dict[str, dict], loot: dict) -> dict | None:
    """What the placed actor behind a legend entry holds. Its ``SaveGuidString``
    (``<level>-<actor>``) names the actor; ``None`` when the scan never saw it."""
    rec = actors.get(legend_actor(save_guid))
    return actor_entry(rec, loot) if rec else None


def chest_contents(save_guid: str, actors: dict[str, dict], loot: dict, items: dict[str, dict],
                   equipment: dict[str, str]) -> tuple[list[tuple[str, int]], tuple[int, int] | None] | None:
    """What a legend chest holds, named; ``None`` when the scan never saw its actor."""
    entry = legend_entry(save_guid, actors, loot)
    return entry_contents(entry, items, equipment) if entry else None


def entry_treasure(entry: dict, items: dict[str, dict]) -> str | None:
    """The name key of the first treasure an entry holds: the curio the game files
    under its own Treasure tab, which is what such a chest is for."""
    for li in entry["LootItems"]:
        item = items.get(li["ItemId"])
        if item is not None and item["ItemDetailType"] == "EItemDetailType::Treasures" and item_name_key(item):
            return item_name_key(item)
    return None


def boss_classes(codex: dict) -> dict[str, dict]:
    """``{spawned class name: codex row}`` for every boss and its aliases."""
    out = {}
    for row in sorted(codex.values(), key=lambda r: r["DisplayOrder"]):
        if not row["bIsBoss"]:
            continue
        for ref in [row["EnemyClass"], *row["AliasEnemyClasses"]]:
            name = ref["AssetPathName"].rsplit(".", 1)[-1]
            if name:
                out.setdefault(name, row)
    return out


def boss_placements(placements: dict[str, list[dict]], codex: dict) -> list[Placement]:
    bosses = boss_classes(codex)
    order = {id(r): i for i, r in enumerate(bosses.values())}
    found = []
    for level, recs in placements.items():
        for rec in recs:
            row = bosses.get(rec.get("spawns", ""))
            if row is not None:
                found.append((order[id(row)], level, rec, row))
    found.sort(key=lambda f: f[0])
    kept: list[Placement] = []
    for _, level, rec, row in found:
        world = tuple(rec["loc"])
        if any(math.dist(world, k.world) < BOSS_MERGE_DISTANCE for k in kept):
            continue  # a later phase of a boss already placed here
        icon = row["WhiteIcon"]["AssetPathName"].rsplit(".", 1)[-1] or None
        kept.append(Placement("boss", world, level, f"{rec['actor']}|{rec['spawns']}",
                              name_key=row["EnemyName"]["Key"] or None, icon=icon))
    return kept


def legend_actor(save_guid: str) -> str:
    """The placed actor a legend entry stands for: its ``SaveGuidString`` is
    ``<level>-<actor>``."""
    return save_guid.partition("-")[2]


def collect(placements: dict[str, list[dict]], loot: dict, items: dict[str, dict],
            codex: dict, legend_actors: set[str],
            legend_items: frozenset[str] = frozenset(),
            flow_items: dict[str, list] | None = None) -> list[Placement]:
    """``legend_actors`` are the actors the legend already draws. They are matched by
    name, not distance: a breakable full of dust a metre from a shard is its own pickup.
    ``legend_items`` are the item ids the legend lists, wherever it places them."""
    books = book_pages(items)
    out = []
    for level, recs in placements.items():
        for rec in recs:
            if not (rec.get("loot") or rec.get("pickups") or rec.get("flow")) or rec["actor"] in legend_actors:
                continue
            p = loot_placement(rec, level, loot, items, books, legend_items, flow_items)
            if p is not None:
                out.append(p)
    return out + boss_placements(placements, codex)


def home_area(p: Placement, candidates: list[str], projections: dict[str, AnchorProjection]) -> str | None:
    """The area whose anchors lie nearest ``p``, among those drawn for its level.

    A level no area draws is not a place a player goes: ``PSOCombat`` alone
    spawns every boss in the game side by side to warm the shader cache.
    """
    pool = [a for a in candidates if a in projections]
    return min(pool, key=lambda a: projections[a].nearest_distance(p.world), default=None)
