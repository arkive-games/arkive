"""Pet/creature ("Pet" category) markers, derived purely from the raw export.

Pets are Vehicle Creatures. Each pet's source creature is an NPC that drops the
pet's "Vehicle Soul" item; that NPC's world spawns are where you obtain the pet.
This module joins VehicleList -> Item -> NpcLoot to map source NpcId -> pet
(CreatureType subtype + localized name), then clusters the NPC's spawn positions
per pet so the map isn't flooded with one marker per spawn point.

All functions are pure (no file IO); callers pass in already-loaded tables, a
WorldMapTransform, and an L10N resolver.
"""
from __future__ import annotations

# ECreatureType::<T> -> the data/types.json subtype key (already defined there).
CREATURE_TYPE_TO_SUBTYPE = {
    "Intellect": "creatureIntellect",
    "Feral": "creatureFeral",
    "Nature": "creatureNature",
    "Trans": "creatureTrans",
    "Special": "creatureSpecial",
}

# Per-pet spawn clustering radius, in map pixels (the world maps are 8192px).
CLUSTER_RADIUS = 200.0


def build_pet_source_index(vehicle_list, item_table, npc_loot):
    """Map each tameable creature's source ``NpcId`` to its pet.

    Args are the raw ``Properties.Data`` lists of ``VehicleList.json``,
    ``Item.json`` and ``NpcLoot.json``.

    Returns ``{npc_id: {"subtype", "descKey", "petName"}}``. Pets with
    ``SoulItemName == "None"`` (shop/Special pets) and NPCs whose
    ``VehicleSoulItemId`` matches no pet soul are omitted.
    """
    item_id_by_name = {it["Name"]: it["ID"]["Value"] for it in item_table}

    pet_by_soul_id: dict[int, dict] = {}
    for v in vehicle_list:
        soul_name = v.get("SoulItemName")
        if not soul_name or soul_name == "None":
            continue
        soul_id = item_id_by_name.get(soul_name)
        if soul_id is None:
            continue
        ctype = str(v.get("CreatureType", "")).split("::")[-1]
        subtype = CREATURE_TYPE_TO_SUBTYPE.get(ctype)
        if not subtype:
            continue
        pet_by_soul_id[soul_id] = {
            "subtype": subtype,
            "descKey": (v.get("Desc") or {}).get("Key", ""),
            "petName": v.get("Name", ""),
        }

    index: dict[int, dict] = {}
    for row in npc_loot:
        soul_id = (row.get("VehicleSoulItemId") or {}).get("Value")
        meta = pet_by_soul_id.get(soul_id)
        if meta is not None:
            index[row["NpcId"]["Value"]] = meta
    return index
