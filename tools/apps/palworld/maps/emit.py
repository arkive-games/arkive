"""Emit stage (port of emit.mjs).

Builds the contract-v1 dataset (maps/types/markers/regions + per-language
locales) from ``parsed.json`` and the hand-authored ``data_src/types.yaml``.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from .bounds import assign_map
from .cluster import cluster_points
from .common import round2, write_json
from .extract import read_parsed
from .orientation import ORIENTATIONS
from .transform import make_inverse_transform, make_transform

SIZE = 8192
_HERE = Path(__file__).resolve().parent
_TYPES_YAML = _HERE.parent / "data_src" / "types.yaml"

_BOSS_PREFIX = re.compile(r"^BOSS_", re.IGNORECASE)

_NPC_VERSION_SUFFIX = re.compile(r"_v?\d+$")


def _base_id(pid: str) -> str:
    return _BOSS_PREFIX.sub("", pid)


def _humanize_npc(npc_id: str) -> str:
    """Readable label from an NPC id (UniqueName key or class suffix).

    The game ships no clean id→localized-name table for placed NPCs, so we
    derive a display label: strip the ``U_`` / gender / trailing-version noise,
    split CamelCase and digit runs. e.g. ``U_Male_Farmer01_v01`` -> "Farmer 01",
    ``BountyTrader`` -> "Bounty Trader", ``MedalTrader`` -> "Medal Trader"."""
    s = re.sub(r"^U_", "", npc_id)
    s = re.sub(r"^(?:Male|Female)_", "", s)
    s = _NPC_VERSION_SUFFIX.sub("", s)
    s = s.replace("_", " ")
    s = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", s)
    s = re.sub(r"(?<=[A-Za-z])(?=\d)", " ", s)
    return re.sub(r"\s+", " ", s).strip() or npc_id


def _pal_name(names: dict, pid: str) -> str:
    return names.get(_base_id(pid)) or names.get(pid) or pid


def _pal_icon(pal_icons: set, pid: str) -> str | None:
    stem = f"T_{_base_id(pid)}_icon_normal"
    return stem if stem in pal_icons else None


def _orient_json(o) -> dict:
    return {"pxAxis": o.px_axis, "flipX": o.flip_x, "flipY": o.flip_y}


def build_dataset(parsed: dict) -> dict:
    src = yaml.safe_load(_TYPES_YAML.read_text(encoding="utf-8"))
    bounds = parsed["bounds"]
    names_by_lang = parsed["namesByLang"]
    pal_icons = set(parsed["palIcons"])
    pal_meta = parsed.get("palMeta") or {}
    languages = src["languages"]
    missing = [lng for lng in languages if not names_by_lang.get(lng)]
    if missing:
        raise RuntimeError(f"Parsed pal names are missing languages: {', '.join(missing)}")

    map_ids = ["MainWorld", "WorldTree"]
    assign_order = [
        {"mapId": "WorldTree", **bounds["WorldTree"]},
        {"mapId": "MainWorld", **bounds["MainWorld"]},
    ]
    transforms = {mid: make_transform(bounds[mid], ORIENTATIONS[mid], SIZE, SIZE) for mid in map_ids}
    inverses = {mid: make_inverse_transform(bounds[mid], ORIENTATIONS[mid], SIZE, SIZE) for mid in map_ids}

    maps = [{
        "id": m["id"], "name": m["id"], "type": "world",
        "tileWidth": 1024, "tileHeight": 1024, "tilesCountX": 8, "tilesCountY": 8,
        "isVisible": True,
        "worldBounds": {
            "min": {"x": bounds[m["id"]]["min"]["X"], "y": bounds[m["id"]]["min"]["Y"]},
            "max": {"x": bounds[m["id"]]["max"]["X"], "y": bounds[m["id"]]["max"]["Y"]},
        },
        "orientation": _orient_json(ORIENTATIONS[m["id"]]),
    } for m in src["maps"]]

    # Per-pal subtypes: one per distinct wild-spawn pal, ordered by ZukanIndex.
    pal_spawn_cfg = next(s for s in src["subtypes"] if s["id"] == "palSpawn")
    radius = pal_spawn_cfg["clusterRadius"]

    def z_for_id(pid: str) -> dict:
        direct = pal_meta.get(pid)
        if direct and direct["zukanIndex"] > 0:
            return direct
        base = pal_meta.get(_base_id(pid))
        if base and base["zukanIndex"] > 0:
            return base
        return direct or base or {"zukanIndex": -1, "zukanIndexSuffix": ""}

    def is_real_pal(pid: str) -> bool:
        return pid in pal_meta

    pal_id_order = {}  # insertion-ordered set
    for s in parsed["palSpawns"]:
        for p in s["pals"]:
            if is_real_pal(p["id"]):
                pal_id_order.setdefault(p["id"], True)

    pal_subtypes = []
    for pid in pal_id_order:
        z = z_for_id(pid)
        zi = z["zukanIndex"] if isinstance(z["zukanIndex"], (int, float)) else -1
        # Wild creatures without a Paldeck number (Yakushima dungeon monsters,
        # cave bats, …) aren't catchable Pals. They're dungeon-instanced spawns
        # that stack on a single dungeon-entrance point, so drop them entirely
        # rather than surfacing a separate "enemy" category on the map.
        if zi <= 0:
            continue
        pal_subtypes.append({
            "id": pid, "category": "pal",
            "icon": _pal_icon(pal_icons, pid),
            "zukanIndex": zi,
            "zukanIndexSuffix": z.get("zukanIndexSuffix", ""),
            "names": {lng: _pal_name(names_by_lang[lng], pid) for lng in languages},
        })
    pal_subtypes.sort(key=lambda s: (
        0 if s["zukanIndex"] >= 0 else 1,
        s["zukanIndex"], s["zukanIndexSuffix"], s["names"]["en-US"],
    ))

    # Per-pal effigy buff-relics (extract sets ``effigyPal`` on each poi): one
    # subtype per pal, named/iconed from that pal, ordered by ZukanIndex. They
    # join the plain Lifmunk Effigy under the hand-authored "effigy" category.
    effigy_pal_by_sub = {}  # subtype id -> pal codename (insertion order)
    for p in parsed["pois"]:
        pal = p.get("effigyPal")
        if pal:
            effigy_pal_by_sub.setdefault(p["subtype"], pal)
    effigy_names = parsed.get("effigyNames") or {}  # subtype id -> {lng: item name}
    effigy_subtypes = []
    for sid, pal in effigy_pal_by_sub.items():
        # Prefer the official effigy item name (ITEM_NAME_Relic_<NN>); fall back
        # to the bare pal name for any language the item table doesn't cover.
        item_name = effigy_names.get(sid) or {}
        names = {lng: (item_name.get(lng) or _pal_name(names_by_lang[lng], pal)) for lng in languages}
        effigy_subtypes.append({
            "id": sid, "category": "effigy", "effigyPal": pal,
            "icon": _pal_icon(pal_icons, pal),
            "names": names,
        })
    effigy_subtypes.sort(key=lambda s: (
        0 if z_for_id(s["effigyPal"])["zukanIndex"] >= 0 else 1,
        z_for_id(s["effigyPal"])["zukanIndex"],
        z_for_id(s["effigyPal"]).get("zukanIndexSuffix", ""),
        s["names"]["en-US"],
    ))

    subtype_defs = (
        [s for s in src["subtypes"] if s["category"] != "pal"] + pal_subtypes + effigy_subtypes
    )

    # types.json — categories nest subtypes; `name` is the machine key (id).
    types = {"categories": []}
    for c in src["categories"]:
        cat = {"id": c["id"], "name": c["id"]}
        if c.get("pinVariant"):
            cat["pinVariant"] = c["pinVariant"]
        subs = []
        for s in subtype_defs:
            if s["category"] != c["id"]:
                continue
            row = {"id": s["id"], "name": s["id"]}
            if s.get("icon"):
                row["icon"] = s["icon"]
            if isinstance(s.get("iconScale"), (int, float)):
                row["iconScale"] = s["iconScale"]
            if s.get("color"):
                row["color"] = s["color"]
            if isinstance(s.get("zukanIndex"), (int, float)) and s["zukanIndex"] > 0:
                row["zukanIndex"] = s["zukanIndex"]
                if s.get("zukanIndexSuffix"):
                    row["zukanIndexSuffix"] = s["zukanIndexSuffix"]
            subs.append(row)
        cat["subtypes"] = subs
        types["categories"].append(cat)

    candidates = {mid: [] for mid in map_ids}
    subtype_cat = {s["id"]: s["category"] for s in subtype_defs}

    def to_px(mid, loc):
        x, y = transforms[mid](loc)
        return {"x": round2(x), "y": round2(y), "z": round2(loc.get("Z", 0))}

    def to_world(loc):
        return {"x": round2(loc["X"]), "y": round2(loc["Y"]), "z": round2(loc.get("Z", 0))}

    for p in parsed["pois"]:
        mid = assign_map(p["location"], assign_order)
        if not mid:
            continue
        c = {"subtype": p["subtype"], **to_world(p["location"]), "sortKey": p["sourceName"]}
        if p.get("nameByLng"):
            c["nameByLng"] = p["nameByLng"]
        if p.get("descByLng"):
            c["descByLng"] = p["descByLng"]
        # Notes carry a full-page illustration (resource-palworld notes/<stem>.webp).
        if p.get("image"):
            c["image"] = p["image"]
        # Effigy relics link to their pal so a pal's page can list them.
        if p.get("effigyPal"):
            c["pal"] = p["effigyPal"]
        candidates[mid].append(c)

    for b in parsed["bosses"]:
        mid = assign_map(b["location"], assign_order)
        if not mid:
            continue
        name_by_lng = {lng: f"{_pal_name(names_by_lang[lng], b['characterId'])} Lv.{b['level']}" for lng in languages}
        z = z_for_id(b["characterId"])
        c = {
            "subtype": "fieldBoss", **to_world(b["location"]),
            "icon": _pal_icon(pal_icons, b["characterId"]) or "T_icon_compass_boss",
            "sortKey": f"{b['characterId']}-{b['key']}",
            "nameByLng": name_by_lng,
        }
        # Link the boss to its catchable pal so a pal's page can list boss spawns.
        boss_pal = _base_id(b["characterId"])
        if is_real_pal(boss_pal):
            c["pal"] = boss_pal
        if z["zukanIndex"] > 0:
            c["zukanIndex"] = z["zukanIndex"]
            if z.get("zukanIndexSuffix"):
                c["zukanIndexSuffix"] = z["zukanIndexSuffix"]
        candidates[mid].append(c)

    for w in parsed.get("wanted", []):
        mid = assign_map(w["location"], assign_order)
        if not mid:
            continue
        name_by_lng = None
        if w.get("nameByLng"):
            name_by_lng = {lng: (f"{n} Lv.{w['level']}" if w.get("level") else n) for lng, n in w["nameByLng"].items()}
        c = {"subtype": "wanted", **to_world(w["location"]), "sortKey": w["spawnerId"]}
        if w.get("icon"):
            c["icon"] = w["icon"]
        if name_by_lng:
            c["nameByLng"] = name_by_lng
        candidates[mid].append(c)

    for p in parsed.get("predators", []):
        mid = assign_map(p["location"], assign_order)
        if not mid:
            continue
        name_by_lng = None
        if p.get("nameByLng"):
            name_by_lng = {lng: (f"{n} Lv.{p['level']}" if p.get("level") else n) for lng, n in p["nameByLng"].items()}
        c = {"subtype": "predator", **to_world(p["location"]), "sortKey": p["pal"]}
        if p.get("icon"):
            c["icon"] = p["icon"]
        if name_by_lng:
            c["nameByLng"] = name_by_lng
        # Predator ids look like ``PREDATOR_<PalId>``; link to the catchable pal.
        pred_pal = re.sub(r"^PREDATOR_", "", p["pal"])
        if is_real_pal(pred_pal):
            c["pal"] = pred_pal
        candidates[mid].append(c)

    for n in parsed.get("npcs", []):
        mid = assign_map(n["location"], assign_order)
        if not mid:
            continue
        # Prefer the game's localized NPC name; fall back to a humanized id for
        # the few quest-target NPCs with no DT_UniqueNPC row.
        name_by_lng = n.get("nameByLng") or {lng: _humanize_npc(n["npcId"]) for lng in languages}
        cand = {
            "subtype": "npc", **to_world(n["location"]), "sortKey": n["npcId"],
            "nameByLng": name_by_lng,
        }
        if n.get("icon"):
            cand["icon"] = n["icon"]
        candidates[mid].append(cand)

    # Pal spawns: split by pal id, cluster within each pal id only.
    by_map_pal = {mid: {} for mid in map_ids}
    for s in parsed["palSpawns"]:
        mid = assign_map(s["location"], assign_order)
        if not mid:
            continue
        px = to_px(mid, s["location"])
        for p in s["pals"]:
            if not is_real_pal(p["id"]):
                continue
            by_map_pal[mid].setdefault(p["id"], []).append({**px, "lvMin": p["lvMin"], "lvMax": p["lvMax"]})
    for mid in map_ids:
        for pal_id, points in by_map_pal[mid].items():
            for c in cluster_points(points, radius):
                lv_min = min(it["lvMin"] for it in c["items"])
                lv_max = max(it["lvMax"] for it in c["items"])
                w = inverses[mid](c["x"], c["y"])
                cand = {
                    "subtype": pal_id, "x": round2(w["X"]), "y": round2(w["Y"]), "z": c["z"],
                    "sortKey": f"{c['x']},{c['y']}",
                    "count": len(c["items"]),
                    "descByLng": {lng: f"Lv.{lv_min}–{lv_max}" for lng in languages},
                }
                icon = _pal_icon(pal_icons, pal_id)
                if icon:
                    cand["icon"] = icon
                candidates[mid].append(cand)

    # Assign stable ids: per map+subtype, sort by sortKey then coords, index from 1.
    markers = {}
    marker_loc = {lng: {mid: {} for mid in map_ids} for lng in languages}
    for mid in map_ids:
        by_subtype: dict[str, list] = {}
        for c in candidates[mid]:
            by_subtype.setdefault(c["subtype"], []).append(c)
        markers[mid] = []
        for s in subtype_defs:
            lst = sorted(by_subtype.get(s["id"], []), key=lambda c: (c["sortKey"], c["x"], c["y"]))
            for i, c in enumerate(lst):
                mid_id = f"{mid}-{s['id']}-{i + 1}"
                marker = {
                    "id": mid_id, "subtype": s["id"], "category": subtype_cat[s["id"]],
                    "x": c["x"], "y": c["y"], "z": c["z"],
                }
                if c.get("icon"):
                    marker["icon"] = c["icon"]
                if c.get("pal"):
                    marker["pal"] = c["pal"]
                if c.get("zukanIndex"):
                    marker["zukanIndex"] = c["zukanIndex"]
                    if c.get("zukanIndexSuffix"):
                        marker["zukanIndexSuffix"] = c["zukanIndexSuffix"]
                if c.get("count") and c["count"] > 1:
                    marker["count"] = c["count"]
                if c.get("image"):
                    marker["image"] = c["image"]
                marker["images"] = []
                marker["contributors"] = []
                marker["indexInSubtype"] = i + 1
                markers[mid].append(marker)
                if c.get("nameByLng") or c.get("descByLng"):
                    for lng in languages:
                        name = (c.get("nameByLng") or {}).get(lng)
                        description = (c.get("descByLng") or {}).get(lng)
                        if name or description:
                            entry = {}
                            if name:
                                entry["name"] = name
                            if description:
                                entry["description"] = description
                            marker_loc[lng][mid][mid_id] = entry

    locales = {}
    for lng in languages:
        locales[lng] = {
            "maps": {m["id"]: {"name": m["names"][lng], "description": "", "shortName": m["shortNames"][lng]} for m in src["maps"]},
            "types": {
                "categories": {c["id"]: {"name": c["names"][lng]} for c in src["categories"]},
                "subtypes": {s["id"]: {"name": s["names"][lng], "description": ""} for s in subtype_defs},
            },
            "markers": marker_loc[lng],
            "regions": {mid: {} for mid in map_ids},
        }

    regions = {mid: [] for mid in map_ids}
    return {"maps": maps, "types": types, "markers": markers, "regions": regions, "locales": locales}


def run_emit(parsed_dir: Path, data_out: Path) -> None:
    ds = build_dataset(read_parsed(parsed_dir))
    data_out = Path(data_out)

    def w(rel, obj):
        write_json(data_out / rel, obj)

    w("maps.json", {"maps": ds["maps"]})
    w("types.json", ds["types"])
    for mid, lst in ds["markers"].items():
        w(f"markers/{mid}.json", {"markers": lst})
    for mid, lst in ds["regions"].items():
        w(f"regions/{mid}.json", {"regions": lst})
    for lng, loc in ds["locales"].items():
        w(f"locales/{lng}/maps.json", loc["maps"])
        w(f"locales/{lng}/types.json", loc["types"])
        for mid in ds["markers"]:
            w(f"locales/{lng}/markers/{mid}.json", loc["markers"][mid])
            w(f"locales/{lng}/regions/{mid}.json", loc["regions"][mid])
    for mid, lst in ds["markers"].items():
        print(f"emit: {mid} {len(lst)} markers")
