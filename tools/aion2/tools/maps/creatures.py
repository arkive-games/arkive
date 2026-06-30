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

import math

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

# De-overlap: creature markers (across pets) whose pixel positions fall within
# COLLIDE_RADIUS are fanned out onto a small circle of DEOVERLAP_OFFSET so stacked
# pins (different pets sharing one spawn point) stay individually visible.
COLLIDE_RADIUS = 24.0
DEOVERLAP_OFFSET = 16.0

# Per-pet portrait icon, served from the resource repo at /UI. The pet's
# ``Name`` (e.g. "KrallReg_01") maps to ``UT_Vehicle_Portrait_<Name>.webp``.
PORTRAIT_DIR = "UI/Resource/Texture/Portrait/Portrait_Vehicle/"


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
    """Deterministic greedy clustering of ``(x, y, z)`` points.

    Groups by the (x, y) pixel distance only; ``z`` (world height) is carried as
    the per-cluster mean. Sorts the points first (so the result is independent of
    input order), then merges each point into the first existing cluster whose
    running centroid is within ``radius``; otherwise it starts a new cluster.

    Returns ``[{"x", "y", "z", "count"}]`` with values rounded to 2 decimals.
    """
    r2 = radius * radius
    clusters: list[dict] = []  # each: {"sx", "sy", "sz", "n"}
    for x, y, z in sorted(points):
        placed = False
        for c in clusters:
            cx = c["sx"] / c["n"]
            cy = c["sy"] / c["n"]
            if (cx - x) ** 2 + (cy - y) ** 2 <= r2:
                c["sx"] += x
                c["sy"] += y
                c["sz"] += z
                c["n"] += 1
                placed = True
                break
        if not placed:
            clusters.append({"sx": x, "sy": y, "sz": z, "n": 1})
    return [
        {"x": round(c["sx"] / c["n"], 2), "y": round(c["sy"] / c["n"], 2),
         "z": round(c["sz"] / c["n"], 2), "count": c["n"]}
        for c in clusters
    ]


def _ids(lst):
    return [x.get("Value") if isinstance(x, dict) else x for x in lst]


def build_creature_markers(spawn_info_list, transform, index, l10n,
                           available_portraits=None, radius=CLUSTER_RADIUS):
    """Build clustered creature WorldMarker dicts for one map.

    Pools every source NPC's spawn positions per pet (keyed by the pet's
    ``descKey``), transforms (x, y) world->pixel while carrying world Z, and
    clusters each pet's points. Each marker carries:
    ``{"kind", "name_en", "name_zhCN", "Location": [None, None, worldZ],
       "px": [x, y], "count", "petKey"[, "icon"]}`` where ``Location[2]`` is the
    cluster's mean world Z (emit_frontend scales it to pixel-z), and ``icon`` is
    the per-pet portrait (set only when its stem is in ``available_portraits``;
    ``None`` means "set it unconditionally").

    Finally runs a de-overlap pass so stacked pins (different pets sharing a
    spawn point) are fanned apart. Returns ``[]`` when there is no transform or
    empty index.
    """
    if transform is None or not index:
        return []

    pet_points: dict[str, list] = {}  # descKey -> [(px, py, worldZ), ...]
    pet_meta: dict[str, dict] = {}    # descKey -> {"subtype", "descKey", "petName"}
    for s in spawn_info_list:
        metas = [index[n] for n in _ids(s.get("NpcIdList", [])) if n in index]
        if not metas:
            continue
        positions = s.get("Positions") or []
        if not positions:
            continue
        pts = []
        for p in positions:
            loc = p["Location"]
            px, py = transform.world_to_pixel(loc["X"], loc["Y"])
            pts.append((px, py, loc["Z"]))
        for meta in metas:
            key = meta["descKey"]
            pet_points.setdefault(key, []).extend(pts)
            pet_meta[key] = meta

    markers: list[dict] = []
    for key in sorted(pet_points):  # deterministic output order
        meta = pet_meta[key]
        name_en = l10n.en(key)
        name_zh = l10n.zh_cn(key)
        stem = "UT_Vehicle_Portrait_" + meta.get("petName", "")
        icon = (
            PORTRAIT_DIR + stem + ".webp"
            if meta.get("petName") and (available_portraits is None or stem in available_portraits)
            else None
        )
        for c in cluster_points(pet_points[key], radius):
            m = {
                "kind": meta["subtype"],
                "name_en": name_en,
                "name_zhCN": name_zh,
                # x, y unused (clustered in pixel space); Z is the cluster's mean
                # world height, scaled to pixel-z by emit_frontend.
                "Location": [None, None, c["z"]],
                "px": [c["x"], c["y"]],
                "count": c["count"],
                # Stable pet identity (its Desc.Key). emit_frontend uses this to
                # give every cluster of the same pet ONE indexInSubtype, so the
                # sidebar counts a pet once regardless of cluster count.
                "petKey": key,
            }
            if icon:
                m["icon"] = icon
            markers.append(m)

    return _deoverlap(markers, COLLIDE_RADIUS, DEOVERLAP_OFFSET)


def _deoverlap(markers, collide_r, offset):
    """Fan apart creature markers whose pixel positions collide.

    Markers within ``collide_r`` px of a group's seed marker are grouped (greedy,
    in a deterministic order); each group of size > 1 is spread evenly onto a circle
    of radius ``offset`` around the group centroid. Single markers are untouched.
    Mutates and returns ``markers`` (only ``px`` changes; ``Location``/z stay).
    """
    n = len(markers)
    if n < 2:
        return markers
    r2 = collide_r * collide_r
    order = sorted(range(n), key=lambda i: (markers[i]["px"][0], markers[i]["px"][1], markers[i]["petKey"]))
    used = [False] * n
    for ai in order:
        if used[ai]:
            continue
        group = [ai]
        used[ai] = True
        ax, ay = markers[ai]["px"]
        for bi in order:
            if used[bi]:
                continue
            dx = ax - markers[bi]["px"][0]
            dy = ay - markers[bi]["px"][1]
            if dx * dx + dy * dy <= r2:
                group.append(bi)
                used[bi] = True
        if len(group) < 2:
            continue
        cx = sum(markers[i]["px"][0] for i in group) / len(group)
        cy = sum(markers[i]["px"][1] for i in group) / len(group)
        members = sorted(group, key=lambda i: (markers[i]["petKey"], markers[i]["px"][0], markers[i]["px"][1]))
        k = len(members)
        for j, i in enumerate(members):
            ang = 2 * math.pi * j / k
            markers[i]["px"] = [round(cx + offset * math.cos(ang), 2),
                                round(cy + offset * math.sin(ang), 2)]
    return markers
