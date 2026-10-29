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
major chests themselves -- is left out, so nothing is drawn twice.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
from scipy.spatial import cKDTree

from .projection import AnchorProjection

# Contents the legend owns: a loot actor holding any of these is the legend's.
LEGEND_ITEM_PREFIXES = ("K_", "Item_Piece_")
LEGEND_ITEM_TYPES = {"EItemTypes::MemoryFlower"}
# A loot actor this close (cm) to a legend entry is that entry -- a major chest.
LEGEND_MERGE_DISTANCE = 300.0
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
    contents: list[tuple[str, int]] = field(default_factory=list)  # (item name key, amount)
    dust: tuple[int, int] | None = None
    icon: str | None = None  # per-marker icon override (boss portraits)


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
    if item["ItemDetailType"] in DETAIL_KINDS:
        return DETAIL_KINDS[item["ItemDetailType"]]
    if item["ItemId"].startswith(("R_", "TU_")):  # stray notes and keepsakes
        return "storyItem"
    return "consumable"


def is_legend_loot(entry: dict, items: dict[str, dict]) -> bool:
    if entry["Weapons"] or entry["Medicines"] or entry["Accessories"]:
        return True
    for li in entry["LootItems"]:
        item = items.get(li["ItemId"])
        if li["ItemId"].startswith(LEGEND_ITEM_PREFIXES) or (item and item["ItemType"] in LEGEND_ITEM_TYPES):
            return True
    return False


def loot_placement(rec: dict, level: str, loot: dict, items: dict[str, dict]) -> Placement | None:
    row = loot.get(rec["loot"])
    if row is None or not row["EntryDatas"]:
        return None
    entry = row["EntryDatas"][0]
    if is_legend_loot(entry, items):
        return None
    contents, kinds = [], []
    for li in entry["LootItems"]:
        item = items.get(li["ItemId"])
        if item is None:
            continue
        kinds.append((KIND_ORDER.index(item_kind(item)), item))
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
    return Placement(kind, tuple(rec["loc"]), level, f"{rec['actor']}|{rec['loot']}",
                     name_key=name_key, contents=contents, dust=dust)


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


def collect(placements: dict[str, list[dict]], loot: dict, items: dict[str, dict],
            codex: dict, legend_points: list[tuple[float, float, float]]) -> list[Placement]:
    legend = cKDTree(np.array(legend_points)) if legend_points else None
    out = []
    for level, recs in placements.items():
        for rec in recs:
            if "loot" not in rec:
                continue
            if legend is not None and legend.query(rec["loc"], k=1)[0] < LEGEND_MERGE_DISTANCE:
                continue
            p = loot_placement(rec, level, loot, items)
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
