"""Emit stage (port of emit.mjs).

Builds the contract-v1 dataset (maps/types/markers/regions + per-language
locales) from ``parsed.json`` and the hand-authored ``data_src/types.yaml``.
"""

from __future__ import annotations

import math
import re
import shutil
from pathlib import Path

import yaml

from ..item_sources import _classify
from .bounds import assign_map
from .cluster import cluster_points
from .common import js_round, round2, write_json
from .extract import read_parsed
from .orientation import ORIENTATIONS
from .transform import make_inverse_transform, make_transform

SIZE = 8192
_HERE = Path(__file__).resolve().parent
_TYPES_YAML = _HERE.parent / "data_src" / "types.yaml"

_BOSS_PREFIX = re.compile(r"^BOSS_", re.IGNORECASE)

_NPC_VERSION_SUFFIX = re.compile(r"_v?\d+$")

# Source kinds whose blueprint_sources entries carry an ``area`` key — the
# namespace marker ``lootArea`` joins against (salvage/treasureMap/… don't).
_AREA_KINDS = {"chest", "fishing", "supply", "camp", "oilrig"}


def _loot_area(fields: list) -> str | None:
    """The blueprint-sources area key a spawner's lottery fields classify to.
    A spawner's fields (e.g. a fishing spot's 01/02 pools) are expected to
    agree on one area; disagreement is a data change worth a warning."""
    areas: list[str] = []
    for f in fields:
        cls = _classify(f)
        if cls and cls[0] in _AREA_KINDS and cls[1] not in areas:
            areas.append(cls[1])
    if len(areas) > 1:
        print(f"emit: WARNING loot fields {fields} span areas {areas}; using {areas[0]}")
    return areas[0] if areas else None


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
    # Name-table keys are lowercased (extract._read_pal_names): the text tables
    # occasionally disagree with CharacterID casing (Windchimes vs WindChimes).
    return names.get(_base_id(pid).lower()) or names.get(pid.lower()) or pid


def _pal_icon(pal_icons: set, pid: str) -> str | None:
    # ``pal_icons`` holds lowercased stems: UE is case-insensitive and exporters
    # disagree on filename casing for the odd asset. Match case-insensitively but
    # return the canonical stem (matches the webp the breeding stage writes).
    stem = f"T_{_base_id(pid)}_icon_normal"
    return stem if stem.lower() in pal_icons else None


def _orient_json(o) -> dict:
    return {"pxAxis": o.px_axis, "flipX": o.flip_x, "flipY": o.flip_y}


def build_dataset(parsed: dict) -> dict:
    src = yaml.safe_load(_TYPES_YAML.read_text(encoding="utf-8"))
    bounds = parsed["bounds"]
    map_names = parsed["mapNames"]
    names_by_lang = parsed["namesByLang"]
    pal_icons = {s.lower() for s in parsed["palIcons"]}
    pal_meta = parsed.get("palMeta") or {}
    languages = src["languages"]
    missing = [lng for lng in languages if not names_by_lang.get(lng)]
    if missing:
        raise RuntimeError(f"Parsed pal names are missing languages: {', '.join(missing)}")

    def _map_name(mid: str, lng: str) -> str:
        names = map_names.get(mid, {})
        return names.get(lng) or names.get("en-US") or mid

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

    # --- named regions (trigger volumes, see extract._extract_region_volumes) --
    # Interior volumes (caves / fixed dungeons / towers) overlap the surface
    # regions in 2D but separate in Z: a marker claims one only by a full 3D
    # hit, while the 2D fallback (markers above/below every volume's z-range,
    # e.g. on a mountain top) considers surface regions alone.
    def _region_type(key: str) -> str:
        k = key.lower()
        if "undergroundcave" in k:
            return "cave"
        if "fixeddungeon" in k:
            return "dungeon"
        if k.startswith("tower_"):
            return "tower"
        return "region"

    region_names = parsed.get("regionNames") or {}
    region_volumes: dict[str, list] = {mid: [] for mid in map_ids}
    for v in parsed.get("regionVolumes") or []:
        # Drop volumes the game itself doesn't name (no DT_WorldMapAreaData row)
        # so no marker ever carries an unlabeled region key.
        if v["area"] not in region_names:
            continue
        mid = assign_map({"X": v["x"], "Y": v["y"]}, assign_order)
        if mid:
            region_volumes[mid].append({**v, "type": _region_type(v["area"])})
    if not any(region_volumes.values()):
        print("emit: WARNING no region volumes in parsed.json — re-run extract for regions")

    def _make_region_lookup(volumes: list):
        vols = sorted(volumes, key=lambda v: v["hx"] * v["hy"])  # most specific first

        def _hit2d(v: dict, x: float, y: float) -> bool:
            dx, dy = x - v["x"], y - v["y"]
            a = math.radians(-v["yaw"])
            lx = dx * math.cos(a) - dy * math.sin(a)
            ly = dx * math.sin(a) + dy * math.cos(a)
            if v["shape"] == "sphere":
                return lx * lx + ly * ly <= v["hx"] * v["hx"]
            return abs(lx) <= v["hx"] and abs(ly) <= v["hy"]

        def lookup(x: float, y: float, z: float | None) -> str | None:
            surface2d = None
            for v in vols:
                if not _hit2d(v, x, y):
                    continue
                if z is not None and abs(z - v["z"]) <= v["hz"]:
                    return v["area"]
                if surface2d is None and v["type"] == "region":
                    surface2d = v["area"]
            return surface2d

        return lookup

    region_lookup = {mid: _make_region_lookup(region_volumes[mid]) for mid in map_ids}

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
    en_names = names_by_lang["en-US"]
    for pid in pal_id_order:
        z = z_for_id(pid)
        zi = z["zukanIndex"] if isinstance(z["zukanIndex"], (int, float)) else -1
        # Wild creatures without a Paldeck number: the Terraria-collab
        # (Yakushima) creatures are real catchable Pals with their own name and
        # icon — keep them (their markers sit on the dungeon-entrance point the
        # instanced spawners are placed at). Nameless/iconless internal
        # codenames would render as raw ids, so those stay dropped.
        if zi <= 0 and not (
            _pal_icon(pal_icons, pid) and (en_names.get(_base_id(pid).lower()) or en_names.get(pid.lower()))
        ):
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
    effigy_icons = parsed.get("effigyIcons") or {}  # subtype id -> relic icon stem
    effigy_descs = parsed.get("effigyDescriptions") or {}  # subtype id -> {lng: buff desc}
    effigy_subtypes = []
    for sid, pal in effigy_pal_by_sub.items():
        # Prefer the official effigy item name (ITEM_NAME_Relic_<NN>); fall back
        # to the bare pal name for any language the item table doesn't cover.
        item_name = effigy_names.get(sid) or {}
        item_desc = effigy_descs.get(sid) or {}
        names = {lng: (item_name.get(lng) or _pal_name(names_by_lang[lng], pal)) for lng in languages}
        # Each effigy's buff (its EPalRelicType) as a per-language default
        # description shared by every marker of the subtype.
        descriptions = {lng: item_desc.get(lng, "") for lng in languages}
        effigy_subtypes.append({
            # One-time pickups: completable, like the hand-authored lifmunkEffigy.
            "id": sid, "category": "effigy", "effigyPal": pal, "canComplete": True,
            # The relic item icon (falls back to the pal icon if unresolved).
            "icon": effigy_icons.get(sid) or _pal_icon(pal_icons, pal),
            "names": names,
            "descriptions": descriptions,
        })
    effigy_subtypes.sort(key=lambda s: (
        0 if z_for_id(s["effigyPal"])["zukanIndex"] >= 0 else 1,
        z_for_id(s["effigyPal"])["zukanIndex"],
        z_for_id(s["effigyPal"]).get("zukanIndexSuffix", ""),
        s["names"]["en-US"],
    ))

    # The base Lifmunk Effigy subtype is hand-authored in types.yaml (not
    # generated from a poi's ``effigyPal``); attach its buff description the same
    # way pal effigies carry theirs, so every effigy exposes its player attribute.
    for s in src["subtypes"]:
        d = effigy_descs.get(s["id"])
        if d and not s.get("descriptions"):
            s["descriptions"] = {lng: d.get(lng, "") for lng in languages}

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
            # Curated default-visible subtypes (hand-tagged in types.yaml): the
            # frontend seeds its initial filter selection from these; every other
            # subtype starts hidden.
            if s.get("defaultActive"):
                row["defaultActive"] = True
            # One-time markers (bosses, effigies): the frontend offers per-marker
            # completion tracking. Emit-only-when-true, like defaultActive.
            if s.get("canComplete"):
                row["canComplete"] = True
            subs.append(row)
        cat["subtypes"] = subs
        types["categories"].append(cat)

    candidates = {mid: [] for mid in map_ids}
    subtype_cat = {s["id"]: s["category"] for s in subtype_defs}

    # Per-pal exact spawn points (spawns/<palId>.json): the pre-cluster
    # placements plus fieldBoss/predator points, so the pal detail map can show
    # exact positions with a single fetch. Coords are integer world cm — sub-cm
    # precision is meaningless at the 8192 px map resolution.
    pal_subtype_ids = {s["id"] for s in pal_subtypes}
    spawn_files: dict[str, dict] = {}

    def _spawn_entry(pid: str, mid: str, kind: str) -> list:
        maps_ = spawn_files.setdefault(pid, {"maps": {}})["maps"]
        return maps_.setdefault(mid, {}).setdefault(kind, [])

    def _spawn_xyz(loc) -> dict:
        return {"x": js_round(loc["X"]), "y": js_round(loc["Y"]), "z": js_round(loc.get("Z", 0))}

    def _is_deck_pal(pid: str) -> bool:
        return is_real_pal(pid) and z_for_id(pid)["zukanIndex"] > 0

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
        # Dungeon portals link to their SpawnAreaId (keys dungeons.json loot).
        if p.get("dungeonArea"):
            c["dungeonArea"] = p["dungeonArea"]
        # Ancient Shrine reward (schematic item + Dog Coins) for the popup.
        if p.get("reward"):
            c["reward"] = p["reward"]
        # Loot spawners (chests, fishing spots, supply points, camps, oil-rig
        # boxes): the blueprint-sources area key their lottery fields belong to.
        if p.get("lootFields"):
            area = _loot_area(p["lootFields"])
            if area:
                c["lootArea"] = area
        # Warp altars: partner altar's sourceName, resolved to the partner's
        # final marker id after id assignment below.
        if p.get("warpPartnerSource"):
            c["warpPartnerSource"] = p["warpPartnerSource"]
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
        # Night-restricted field bosses (spawner OnlyTime=Night).
        if b.get("nightOnly"):
            c["nightOnly"] = True
        if b.get("drops"):
            c["drops"] = b["drops"]
        if _is_deck_pal(boss_pal):
            entry = {**_spawn_xyz(b["location"]), "kind": "fieldBoss"}
            if b.get("level"):
                entry["level"] = b["level"]
            if b.get("nightOnly"):
                entry["nightOnly"] = True
            _spawn_entry(boss_pal, mid, "bosses").append(entry)
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
        # Kill drops (bounty tokens, gold, keys) for the popup's drop badges.
        if w.get("drops"):
            c["drops"] = w["drops"]
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
        if _is_deck_pal(pred_pal):
            entry = {**_spawn_xyz(p["location"]), "kind": "predator"}
            if p.get("level"):
                entry["level"] = p["level"]
            _spawn_entry(pred_pal, mid, "bosses").append(entry)
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
            by_map_pal[mid].setdefault(p["id"], []).append(
                {**px, "lvMin": p["lvMin"], "lvMax": p["lvMax"], "night": bool(p.get("nightOnly"))}
            )
            if p["id"] in pal_subtype_ids:
                point = {**_spawn_xyz(s["location"]), "lvMin": p["lvMin"], "lvMax": p["lvMax"]}
                if p.get("nightOnly"):
                    point["nightOnly"] = True
                if p.get("numMax"):
                    point["numMin"], point["numMax"] = p["numMin"], p["numMax"]
                if p.get("weightPct"):
                    point["weightPct"] = p["weightPct"]
                if s.get("radius"):
                    point["radius"] = s["radius"]
                _spawn_entry(p["id"], mid, "points").append(point)
    # Paldex habitat clouds (deferred-systems plan §8): the game's own per-species
    # day/night point clouds, split per map, as compact [x, y] pairs alongside the
    # spawner-derived points (which keep the level/pack/share detail).
    for pid, dn in (parsed.get("paldex") or {}).items():
        # Skip boss/raid codename rows: their clouds are the fixed alpha
        # locations the map already shows as boss markers, and the frontend
        # only ever fetches spawn files by roster pal id.
        if re.match(r"^(boss|raid|gym)_", pid, re.I):
            continue
        if not is_real_pal(pid):
            continue
        for key, pts in (("paldexDay", dn.get("day") or []), ("paldexNight", dn.get("night") or [])):
            per_map: dict[str, list] = {}
            for p in pts:
                mid = assign_map(p, assign_order)
                if mid:
                    per_map.setdefault(mid, []).append([js_round(p["X"]), js_round(p["Y"])])
            for mid, arr in per_map.items():
                maps_ = spawn_files.setdefault(pid, {"maps": {}})["maps"]
                maps_.setdefault(mid, {})[key] = arr

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
                # Night-only when EVERY clustered point is night-restricted (a
                # mixed cluster also spawns in daytime, so it gets no flag).
                if all(it["night"] for it in c["items"]):
                    cand["nightOnly"] = True
                icon = _pal_icon(pal_icons, pal_id)
                if icon:
                    cand["icon"] = icon
                candidates[mid].append(cand)

    # Assign stable ids: per map+subtype, sort by sortKey then coords, index from 1.
    markers = {}
    marker_loc = {lng: {mid: {} for mid in map_ids} for lng in languages}
    # Warp-altar link resolution: sourceName (= poi sortKey) -> map-qualified
    # marker ref, plus the (marker, partnerSource) pairs still to resolve. Two
    # passes because a partner's final id may be assigned later (or on another
    # map — the World Tree entrance/exit pair spans maps).
    warp_ref_by_source: dict[str, dict] = {}
    warp_pending: list[tuple[dict, str]] = []
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
                region = region_lookup[mid](c["x"], c["y"], c.get("z"))
                if region:
                    marker["region"] = region
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
                if c.get("nightOnly"):
                    marker["nightOnly"] = True
                if c.get("image"):
                    marker["image"] = c["image"]
                if c.get("reward"):
                    marker["reward"] = c["reward"]
                if c.get("drops"):
                    marker["drops"] = c["drops"]
                if c.get("dungeonArea"):
                    marker["dungeonArea"] = c["dungeonArea"]
                if c.get("lootArea"):
                    marker["lootArea"] = c["lootArea"]
                marker["images"] = []
                marker["contributors"] = []
                marker["indexInSubtype"] = i + 1
                if s["id"] == "warpAltar":
                    warp_ref_by_source[c["sortKey"]] = {"map": mid, "id": mid_id}
                    if c.get("warpPartnerSource"):
                        warp_pending.append((marker, c["warpPartnerSource"]))
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

    # Second pass: point each warp altar at its partner's final marker id.
    for marker, partner_source in warp_pending:
        ref = warp_ref_by_source.get(partner_source)
        if ref:
            marker["warpTo"] = ref

    # --- region polygons (pixel space) + localized names --------------------
    # GameMapBorders projects borders with a raw vertical flip (NOT the
    # world->pixel transform it applies to markers), so the polygon must be
    # emitted already in map-pixel space. Box volumes become their four rotated
    # corners; spheres a 24-gon. Only areas the game actually names are kept
    # (a volume with no DT_WorldMapAreaData text is internal).
    def _volume_polygon(mid: str, v: dict) -> list:
        cx, cy, yaw = v["x"], v["y"], math.radians(v["yaw"])
        cos, sin = math.cos(yaw), math.sin(yaw)
        if v["shape"] == "sphere":
            local = [
                (v["hx"] * math.cos(2 * math.pi * k / 24), v["hx"] * math.sin(2 * math.pi * k / 24))
                for k in range(24)
            ]
        else:
            hx, hy = v["hx"], v["hy"]
            local = [(-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy)]
        ring = []
        for lx, ly in local:
            wx = cx + lx * cos - ly * sin
            wy = cy + lx * sin + ly * cos
            px, py = transforms[mid]({"X": wx, "Y": wy})
            ring.append([round2(px), round2(py)])
        ring.append(ring[0])  # close the ring
        return ring

    regions = {mid: [] for mid in map_ids}
    for mid in map_ids:
        for v in sorted(region_volumes[mid], key=lambda v: v["area"]):
            if v["area"] not in region_names:
                continue  # unnamed internal volume
            regions[mid].append({
                "id": v["area"], "name": v["area"], "type": v["type"],
                "borders": [_volume_polygon(mid, v)],
            })

    region_loc = {lng: {mid: {} for mid in map_ids} for lng in languages}
    for mid in map_ids:
        for r in regions[mid]:
            names = region_names.get(r["name"]) or {}
            for lng in languages:
                nm = names.get(lng) or names.get("en-US")
                if nm:
                    region_loc[lng][mid][r["name"]] = {"name": nm}

    locales = {}
    for lng in languages:
        locales[lng] = {
            # Map name + switcher shortName both use the game's official WorldMap
            # L10N name (fall back to en-US, then the map id, if a lang is absent).
            "maps": {m["id"]: {"name": _map_name(m["id"], lng), "description": "", "shortName": _map_name(m["id"], lng)} for m in src["maps"]},
            "types": {
                "categories": {c["id"]: {"name": c["names"][lng]} for c in src["categories"]},
                "subtypes": {
                    s["id"]: {"name": s["names"][lng], "description": (s.get("descriptions") or {}).get(lng, "")}
                    for s in subtype_defs
                },
            },
            "markers": marker_loc[lng],
            "regions": region_loc[lng],
        }

    # Order the per-pal spawn files deterministically (points by coords, maps in
    # map_ids order) so re-runs produce byte-identical artifacts.
    spawns = {}
    for pid in sorted(spawn_files):
        by_map = spawn_files[pid]["maps"]
        ordered = {}
        for mid in map_ids:
            if mid not in by_map:
                continue
            mp = {}
            if "points" in by_map[mid]:
                mp["points"] = sorted(
                    by_map[mid]["points"], key=lambda p: (p["x"], p["y"], p["z"], p["lvMin"], p["lvMax"])
                )
            if "bosses" in by_map[mid]:
                mp["bosses"] = sorted(by_map[mid]["bosses"], key=lambda b: (b["kind"], b["x"], b["y"]))
            for cloud_key in ("paldexDay", "paldexNight"):
                if cloud_key in by_map[mid]:
                    mp[cloud_key] = by_map[mid][cloud_key]
            ordered[mid] = mp
        spawns[pid] = {"maps": ordered}

    # --- loot-area index (areas.json) ----------------------------------------
    # Per blueprint-sources area key: which map(s) its loot spawners sit on and
    # how many markers of each subtype — enough for the item page's region
    # hovercard (counts + link target) without fetching the full markers files.
    area_counts: dict[str, dict] = {}
    for mid in map_ids:
        for m in markers[mid]:
            la = m.get("lootArea")
            if not la:
                continue
            per_map = area_counts.setdefault(la, {}).setdefault(mid, {})
            per_map[m["subtype"]] = per_map.get(m["subtype"], 0) + 1
    areas = {
        area: {"maps": {mid: dict(sorted(area_counts[area][mid].items()))
                        for mid in map_ids if mid in area_counts[area]}}
        for area in sorted(area_counts)
    }

    return {"maps": maps, "types": types, "markers": markers, "regions": regions,
            "locales": locales, "spawns": spawns, "areas": areas}


def run_emit(parsed_dir: Path, data_out: Path) -> None:
    ds = build_dataset(read_parsed(parsed_dir))
    data_out = Path(data_out)

    def w(rel, obj):
        write_json(data_out / rel, obj)

    w("maps.json", {"maps": ds["maps"]})
    w("types.json", ds["types"])
    w("areas.json", {"areas": ds["areas"]})
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
    # Per-pal exact spawn points. Rebuild the directory from scratch so files
    # for renamed/removed pals don't linger from earlier runs.
    spawns_dir = data_out / "spawns"
    if spawns_dir.exists():
        shutil.rmtree(spawns_dir)
    for pid, obj in ds["spawns"].items():
        w(f"spawns/{pid}.json", obj)
    for mid, lst in ds["markers"].items():
        print(f"emit: {mid} {len(lst)} markers")
    print(f"emit: spawns {len(ds['spawns'])} pals")
