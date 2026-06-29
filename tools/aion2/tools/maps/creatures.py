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


def cluster_points(points, radius):
    """Deterministic greedy clustering of ``(x, y)`` points.

    Sorts the points first (so the result is independent of input order), then
    merges each point into the first existing cluster whose running centroid is
    within ``radius``; otherwise it starts a new cluster.

    Returns ``[{"x", "y", "count"}]`` with centroids rounded to 2 decimals.
    """
    r2 = radius * radius
    clusters: list[dict] = []  # each: {"sx", "sy", "n"}
    for x, y in sorted(points):
        placed = False
        for c in clusters:
            cx = c["sx"] / c["n"]
            cy = c["sy"] / c["n"]
            if (cx - x) ** 2 + (cy - y) ** 2 <= r2:
                c["sx"] += x
                c["sy"] += y
                c["n"] += 1
                placed = True
                break
        if not placed:
            clusters.append({"sx": x, "sy": y, "n": 1})
    return [
        {"x": round(c["sx"] / c["n"], 2), "y": round(c["sy"] / c["n"], 2), "count": c["n"]}
        for c in clusters
    ]


def _ids(lst):
    return [x.get("Value") if isinstance(x, dict) else x for x in lst]


def build_creature_markers(spawn_info_list, transform, index, l10n, radius=CLUSTER_RADIUS):
    """Build clustered creature WorldMarker dicts for one map.

    Pools every source NPC's spawn positions per pet (keyed by the pet's
    ``descKey``), transforms them world->pixel, and clusters each pet's points.
    Returns dicts shaped like the other ``WorldMarkers`` plus a ``count``:
    ``{"kind", "name_en", "name_zhCN", "Location": None, "px": [x, y], "count"}``.
    Returns ``[]`` when there is no transform or empty index.
    """
    if transform is None or not index:
        return []

    pet_points: dict[str, list] = {}  # descKey -> [(px, py), ...]
    pet_meta: dict[str, dict] = {}    # descKey -> {"subtype", "descKey", "petName"}
    for s in spawn_info_list:
        metas = [index[n] for n in _ids(s.get("NpcIdList", [])) if n in index]
        if not metas:
            continue
        positions = s.get("Positions") or []
        if not positions:
            continue
        pxs = []
        for p in positions:
            loc = p["Location"]
            pxs.append(transform.world_to_pixel(loc["X"], loc["Y"]))
        for meta in metas:
            key = meta["descKey"]
            pet_points.setdefault(key, []).extend(pxs)
            pet_meta[key] = meta

    markers: list[dict] = []
    for key in sorted(pet_points):  # deterministic output order
        meta = pet_meta[key]
        name_en = l10n.en(key)
        name_zh = l10n.zh_cn(key)
        for c in cluster_points(pet_points[key], radius):
            markers.append({
                "kind": meta["subtype"],
                "name_en": name_en,
                "name_zhCN": name_zh,
                "Location": None,
                "px": [c["x"], c["y"]],
                "count": c["count"],
            })
    return markers
