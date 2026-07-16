"""Extract stage (port of extract.mjs).

Parses the raw Palworld UE export (persistent level actors, world-partition
cells, and DataTables) into an intermediate ``parsed.json`` consumed by ``emit``.
"""

from __future__ import annotations

import json
import math
import re
import subprocess
from pathlib import Path

from .common import js_round, read_rows

# L10N folder -> BCP47 tag. The game's BASE tables (SourceString) are authored
# in Japanese, so ja-JP is sourced from the base tables rather than an L10N folder.
L10N_LANG_TAGS = {
    "de": "de-DE", "en": "en-US", "es": "es-ES", "es-MX": "es-MX", "fr": "fr-FR",
    "id": "id-ID", "it": "it-IT", "ko": "ko-KR", "pl": "pl-PL", "pt-BR": "pt-BR",
    "ru": "ru-RU", "th": "th-TH", "tr": "tr-TR", "vi": "vi-VN",
    "zh-Hans": "zh-CN", "zh-Hant": "zh-TW",
}
JA_TAG = "ja-JP"

# Map display names come from the game's WorldMap UI text
# (DT_WorldMap_Common_Text_Common); each map id maps to one WORLDMAP_NAME_* key.
MAP_NAME_KEYS = {"MainWorld": "WORLDMAP_NAME_MainMap", "WorldTree": "WORLDMAP_NAME_Tree"}

# Persistent-level actors (Maps/MainWorld_5/PL_MainWorld5.json).
POI_CLASSES = [
    ("fastTravel", re.compile(r"^BP_LevelObject_TowerFastTravelPoint_C$")),
    ("eagleStatue", re.compile(r"^BP_LevelObject_UnlockMapPoint_C$")),
    ("tower", re.compile(r"^BP_PalBossTower(_.+)?_C$")),
    ("dungeon", re.compile(r"^BP_DungeonPortalMarker_.+_C$")),
    ("treasureMap", re.compile(r"^BP_LevelObject_TreasureMapPoint_C$")),
    # Ancient Shrine: a lock-gated pickup tower granting one gear schematic + Dog
    # Coins (reward from DT_ItemPickupDataTable). ~106 across the overworld, split
    # between the persistent level (2) and the world-partition cells (104).
    ("ancientShrine", re.compile(r"^BP_LevelObject_ItemPickupTower_C$")),
    ("note", re.compile(r"^BP_LevelObject_Note_C$")),
    ("copper", re.compile(r"^BP_PalMapObjectSpawner_RockCopper_C$")),
    ("quartz", re.compile(r"^BP_PalMapObjectSpawner_RockQuartz_C$")),
    ("coal", re.compile(r"^BP_PalMapObjectSpawner_RockCoal_C$")),
    ("sulfur", re.compile(r"^BP_PalMapObjectSpawner_Sulfur_C$")),
]

# World-Partition cell actors. They appear at inconsistent LODs, so we scan every
# MainGrid cell referencing a target class and dedup by rounded world location.
CELL_CLASSES = [
    ("lifmunkEffigy", re.compile(r"^BP_LevelObject_Relic_C$")),
    ("skillFruit", re.compile(r"^BP_PalMapObjectSpawner_SkillFruits_.+_C$")),
    ("egg", re.compile(r"^bp_palmapobjectspawner_palegg_.+_C$", re.IGNORECASE)),
    ("chest", re.compile(r"^BP_PalMapObjectSpawner_Treasure_.+_C$")),
    ("camp", re.compile(r"^BP_NPCCampSpawner_.+_C$")),
    # Post-1.0 Oil Rig raid treasure boxes; exact `_C` excludes `_Goal_C`.
    ("oilrigTreasure", re.compile(r"^BP_OilrigTreasureBoxSpawner_C$")),
    # Mineable resources that live only in the cells (no persistent-level
    # BoxPlacementTool deposit): crude-oil fields, Sky Island ore (Soralite),
    # World Tree ore (Paloxite). Copper/coal/quartz/sulfur come from the level.
    ("oil", re.compile(r"^BP_LevelObject_OilField_C$")),
    ("skyIslandOre", re.compile(r"^BP_PalMapObjectSpawner_SkyIslandOre_C$")),
    ("worldTreeOre", re.compile(r"^BP_PalMapObjectSpawner_WorldTreeOre_C$")),
    # Hot springs that heal pals, and player warp altars (Sky Island altars plus
    # the World Tree entrance/exit). All world-partition-only (no persistent-level
    # instance), so they are scanned from the cells alongside the ores above.
    ("healingSpring", re.compile(r"^BP_LevelObject_HealSpring_C$")),
    ("warpAltar", re.compile(r"^BP_LevelObject_(SkylandWarpAlter|WarpAltar_WorldTree(Entrance|Exit))_C$")),
    # Collectible notes: only ~15 sit in the always-loaded persistent level; the
    # rest live in the world-partition cells (the L15 aggregate). Scan both and
    # dedup globally (see _dedup_pois_by_location) so all note pickups surface.
    ("ancientShrine", re.compile(r"^BP_LevelObject_ItemPickupTower_C$")),
    ("note", re.compile(r"^BP_LevelObject_Note_C$")),
]
CELL_GREP = (
    "BP_LevelObject_Relic|BP_PalMapObjectSpawner_SkillFruits_|"
    "palmapobjectspawner_palegg_|BP_PalMapObjectSpawner_Treasure_|"
    "BP_NPCCampSpawner_|BP_OilrigTreasureBoxSpawner_C|"
    "BP_LevelObject_OilField_C|BP_PalMapObjectSpawner_SkyIslandOre_C|"
    "BP_PalMapObjectSpawner_WorldTreeOre_C|BP_LevelObject_Note_C|"
    "BP_LevelObject_ItemPickupTower_C|BP_LevelObject_HealSpring_C|"
    "BP_LevelObject_SkylandWarpAlter_C|BP_LevelObject_WarpAltar_WorldTree"
)

# NPC spawners placed on the map: the generic BP_MonoNPCSpawner_C carries a
# UniqueName key (e.g. "BountyTrader", "U_Male_Farmer01_v01"); named variants
# (BP_MonoNPCSpawner_MedalTrader_C, BP_QuestTargetNPCSpawner_Breeder03_C) bake
# the identity into the class name. We surface these talkable/merchant/quest
# NPCs; combat squads, enemy-dungeon spawns and decorative "_NPC_C" props are
# intentionally excluded.
NPC_SPAWNER_RX = re.compile(r"^BP_(?:Mono|QuestTarget)NPCSpawner(?:_([A-Za-z0-9]+))?_C$")

# Per-pal effigy buff-relics: BP_LevelObject_Relic_<Pal>_C (e.g. _SheepBall_C).
# They share the PalLevelObjectRelic base with the plain Lifmunk Effigy
# (BP_LevelObject_Relic_C, matched exactly above) but each grants a passive
# buff (EPalRelicType) and is skinned as a specific pal. Captured as their own
# `effigy<Pal>` subtypes; the base class stays `lifmunkEffigy`.
EFFIGY_VARIANT_RX = re.compile(r"^BP_LevelObject_Relic_([A-Za-z0-9]+)_C$")

# Each effigy relic grants one player status buff (its BP's `EPalRelicType`).
# The buff's localized name/description is the Statue-of-Power UI text
# `BUILDUP_PLAYER_STATUS[_DESC]_<NN>`, where NN is the relic type's index below
# (same order as DT_PlayerStatusRankMasterDataTable).
RELIC_TYPE_INDEX = {
    "CapturePower": 0, "HungerReduction": 1, "SwimSpeed": 2, "FoodDecayReduction": 3,
    "JumpPower": 4, "GliderSpeed": 5, "ClimbSpeed": 6, "StatusAilmentResist": 7,
    "StaminaReduction": 8, "SphereHoming": 9, "ExpBonus": 10, "RainbowPassiveRate": 11,
    "MoveSpeed": 12,
}
_RELIC_TYPE_RX = re.compile(r"EPalRelicType::([A-Za-z]+)")


def _relic_type_of(raw: Path, pal: str) -> str | None:
    """Read the `EPalRelicType` a per-pal effigy grants, from its level-object BP."""
    p = raw / "Blueprint/MapObject/Object/LevelObject" / f"BP_LevelObject_Relic_{pal}.json"
    if not p.exists():
        return None
    m = _RELIC_TYPE_RX.search(p.read_text(encoding="utf-8"))
    return m.group(1) if m else None


def _relic_buff_desc(rtype: str | None, buildup: dict) -> dict:
    """The Statue-of-Power status description for an EPalRelicType, per language.

    ``buildup`` is {tag: {key: string}}; returns {tag: description} or ``{}``."""
    idx = RELIC_TYPE_INDEX.get(rtype) if rtype else None
    if idx is None:
        return {}
    dkey = f"BUILDUP_PLAYER_STATUS_DESC_{idx:02d}"
    return {tag: tbl[dkey] for tag, tbl in buildup.items() if tbl.get(dkey)}

# Post-1.0 content not covered by the pre-1.0 taxonomy — surfaced for reporting.
NEW_TYPE_WATCH = [
    ("oilrigTreasure", "Oil Rig raid treasure boxes", "BP_OilrigTreasureBoxSpawner_C"),
    ("oilrigGoal", "Oil Rig raid goal points", "BP_OilrigTreasureBoxSpawner_Goal_C"),
    ("dlcCamp", "DLC syndicate camps (fold into camp)", "BP_NPCCampSpawner_DLC[0-9]"),
]

_CELLS_REL = "Maps/MainWorld_5/PL_MainWorld5/_Generated_"
_LEVEL_REL = "Maps/MainWorld_5/PL_MainWorld5.json"

# Warp-point destination actors (persistent level): the base class covers the
# Sky Island altars, the WorldTreeEntrance subclass the World Tree pair.
_WARP_DEST_RX = re.compile(r"^BP_LevelObject_WarpPointDestination(_[A-Za-z0-9]+)?_C$")


def _match(classes, t: str):
    for subtype, rx in classes:
        if rx.match(t):
            return subtype
    return None


def _read_pal_names(table_path: Path) -> dict:
    # Keys are lowercased: the name table's casing occasionally disagrees with
    # CharacterID (PAL_NAME_Windchimes vs WindChimes) — probe with pid.lower()
    # (see breeding._pal_name; emit._pal_name does the same for markers).
    rows = read_rows(table_path)
    names = {}
    for key, r in rows.items():
        if key.startswith("PAL_NAME_"):
            names[key[len("PAL_NAME_"):].lower()] = r["TextData"]["SourceString"]
    return names


def _read_l10n_pal_names(raw: Path, folder: str, tag: str) -> dict:
    p = raw.parent / "L10N" / folder / "Pal/DataTable/Text/DT_PalNameText_Common.json"
    if not p.exists():
        raise RuntimeError(f"Missing Palworld L10N name table for {folder} ({tag}): {p}")
    return _read_pal_names(p)


def _read_respawn_names(table_path: Path) -> dict:
    # Base table holds ja SourceString; each L10N folder holds LocalizedString.
    if not table_path.exists():
        return {}
    rows = read_rows(table_path)
    m = {}
    for key, r in rows.items():
        td = r.get("TextData") or {}
        s = td.get("LocalizedString") or td.get("SourceString")
        if s:
            m[key] = s
    return m


def _read_text_by_lang(raw: Path, rel: str) -> dict:
    """{tag: {key: string}} for a text table, ja from base + each L10N folder
    layered over base (so missing translations fall back to ja)."""
    base = _read_respawn_names(raw / "DataTable/Text" / rel)
    by_lang = {JA_TAG: base}
    for folder, tag in L10N_LANG_TAGS.items():
        loc = _read_respawn_names(raw.parent / "L10N" / folder / "Pal/DataTable/Text" / rel)
        by_lang[tag] = {**base, **loc}
    return by_lang


def _ft_name_by_lng(ft_names: dict, point_id) -> dict | None:
    if not point_id:
        return None
    by_lng = {}
    for tag, table in ft_names.items():
        name = table.get(point_id) or table.get(f"{point_id}_Title")
        if name:
            by_lng[tag] = name
    return by_lng or None


def _split_note_text(s: str) -> tuple[str, str]:
    """Split a note's localized string into (title, body). The game authors each
    note as ``Title\\r\\n\\r\\nBody`` — the first line is the note's name, the rest
    (its blank-line-separated paragraphs) the description. Fall back to the first
    line as the title when there is no blank-line separator."""
    text = s.replace("\r\n", "\n").replace("\r", "\n")
    title, sep, body = text.partition("\n\n")
    if not sep:
        title, _, body = text.partition("\n")
    return title.strip(), body.strip()


def _note_resolver(raw: Path):
    """Return ``resolve(row) -> (nameByLng | None, descByLng | None, imageStem |
    None)`` for note POIs. Each ``BP_LevelObject_Note_C`` carries a NoteRowName
    keying ``DT_NoteMasterDataTable`` (-> ``TextId_Description``), whose text lives
    in ``DT_NoteDescText`` (base ja + per-language L10N). Each string splits into a
    title (name) and body (description). ``DT_NoteTextureDataTable`` maps the row to
    a full-page illustration under ``Texture/Note/`` (``T_Note_<row>``)."""
    def _rows_or_empty(p: Path) -> dict:
        return read_rows(p) if p.exists() else {}

    master = _rows_or_empty(raw / "DataTable/NoteData/DT_NoteMasterDataTable.json")
    textures = _rows_or_empty(raw / "DataTable/NoteData/DT_NoteTextureDataTable.json")
    desc_by_lng = _read_text_by_lang(raw, "DT_NoteDescText.json")

    def resolve(row: str):
        text_id = (master.get(row) or {}).get("TextId_Description") or row
        name_by_lng, desc_out = {}, {}
        for tag, table in desc_by_lng.items():
            s = table.get(text_id)
            if not s:
                continue
            title, body = _split_note_text(s)
            if title:
                name_by_lng[tag] = title
            if body:
                desc_out[tag] = body
        asset = ((textures.get(row) or {}).get("Texture") or {}).get("AssetPathName") or ""
        stem = asset.split(".")[-1] if asset else None
        return (name_by_lng or None, desc_out or None, stem or None)

    return resolve


def _strip_entrance_suffixes(name_maps: list[dict]) -> None:
    """Drop the shared trailing "Entrance" token per language (data-driven)."""
    langs = set()
    for m in name_maps:
        langs.update(m.keys())
    for lng in langs:
        counts: dict[str, int] = {}
        for m in name_maps:
            s = m.get(lng)
            i = s.rfind(" ") if s else -1
            if i < 0:
                continue
            tok = s[i + 1:]
            counts[tok] = counts.get(tok, 0) + 1
        suffix, best = None, 0
        for tok, n in counts.items():
            if n > best:
                best, suffix = n, tok
        if not suffix or best < 3:
            continue
        tail = f" {suffix}"
        for m in name_maps:
            if m.get(lng, "").endswith(tail):
                m[lng] = m[lng][: -len(tail)]


def _actor_location(actor: dict, exports: list) -> dict | None:
    obj_path = (actor.get("Properties") or {}).get("RootComponent", {}).get("ObjectPath")
    if not obj_path:
        return None
    idx = int(obj_path.split(".")[-1])
    if idx >= len(exports):
        return None
    comp = exports[idx]
    loc = (comp.get("Properties") or {}).get("RelativeLocation") or {}
    # Most actors' root component is unparented, so RelativeLocation IS the world
    # position. But some actors carry NO RelativeLocation on their root (it lives
    # up an AttachParent chain via an intermediate ChildActorComponent — e.g. the
    # Ancient Shrine pickup towers), and some spawners (copper/quartz/coal/sulfur
    # ore rocks) attach their root to a BP_BoxPlacementTool parent, making
    # RelativeLocation a small offset in the parent's frame. So seed from the root
    # (0,0,0 when absent) and compose the AttachParent chain — parent location +
    # parent-yaw-rotated child offset — to recover the world position. (Parents
    # carry only Z-yaw; pitch/roll are 0.) Return None only if NO component in the
    # chain supplied a location, preserving the old "locationless actor" skip.
    found = bool(loc)
    x, y, z = loc.get("X", 0), loc.get("Y", 0), loc.get("Z", 0)
    parent = (comp.get("Properties") or {}).get("AttachParent")
    depth = 0
    while parent and depth < 16:
        p_idx = int(parent["ObjectPath"].split(".")[-1])
        if p_idx >= len(exports):
            break
        p_props = exports[p_idx].get("Properties") or {}
        p_loc = p_props.get("RelativeLocation")
        found = found or bool(p_loc)
        p_loc = p_loc or {}
        yaw = math.radians((p_props.get("RelativeRotation") or {}).get("Yaw", 0) or 0)
        cos, sin = math.cos(yaw), math.sin(yaw)
        x, y = x * cos - y * sin + p_loc.get("X", 0), x * sin + y * cos + p_loc.get("Y", 0)
        z += p_loc.get("Z", 0)
        parent = p_props.get("AttachParent")
        depth += 1
    return {"X": x, "Y": y, "Z": z} if found else None


# Region trigger volumes: the game's named-region definitions. One placed
# BP_PalRegionTriggerBox_C / BP_PalRegionTriggerSphere_C actor per region
# (124 across the persistent level + world-partition cells), each carrying
# `AreaName.Key` (a DT_WorldMapAreaData row) and its geometry as a transform
# chain: the root DefaultSceneRoot (location/yaw/scale) x the Box/Sphere child
# component (own relative transform + BoxExtent/SphereRadius, engine default
# 32). BOTH levels must be composed — island volumes carry their scale on the
# child component, mainland ones on the root; reading only the root yields
# 32-unit boxes.
_REGION_TRIGGER_TYPES = {"BP_PalRegionTriggerBox_C": "box", "BP_PalRegionTriggerSphere_C": "sphere"}


def _region_volume(actor: dict, exports: list) -> dict | None:
    """World-space volume of one region trigger actor: rotated box (half
    extents hx/hy, z half-range hz) or circle (hx == hy), in world units."""
    props = actor.get("Properties") or {}
    area = (props.get("AreaName") or {}).get("Key")
    if not area or area == "None":
        return None
    path = (props.get("RootComponent") or {}).get("ObjectPath") or ""
    root: dict = {}
    if path:
        idx = int(path.rsplit(".", 1)[-1])
        if idx < len(exports):
            root = exports[idx].get("Properties") or {}
    comp: dict = {}
    aname = actor.get("Name") or ""
    for e in exports:
        outer = e.get("Outer")
        outer_name = outer.get("ObjectName", "") if isinstance(outer, dict) else str(outer or "")
        if aname and aname in outer_name and e.get("Type") in ("BoxComponent", "SphereComponent"):
            comp = e.get("Properties") or {}
            break
    rl, rs, rr = root.get("RelativeLocation"), root.get("RelativeScale3D") or {}, root.get("RelativeRotation") or {}
    cl, cs, cr = comp.get("RelativeLocation") or {}, comp.get("RelativeScale3D") or {}, comp.get("RelativeRotation") or {}
    if rl is None and not cl:
        return None  # locationless actor (mirrors the poi skip)
    rl = rl or {}
    rsx, rsy, rsz = rs.get("X", 1), rs.get("Y", 1), rs.get("Z", 1)
    yaw0 = math.radians(rr.get("Yaw", 0) or 0)
    ox, oy = cl.get("X", 0) * rsx, cl.get("Y", 0) * rsy
    ext = comp.get("BoxExtent") or {}
    shape = _REGION_TRIGGER_TYPES[actor["Type"]]
    if shape == "sphere":
        r = comp.get("SphereRadius", 32.0) * cs.get("X", 1) * rsx
        hx = hy = r
        hz = comp.get("SphereRadius", 32.0) * cs.get("Z", 1) * rsz
    else:
        hx = ext.get("X", 32.0) * cs.get("X", 1) * rsx
        hy = ext.get("Y", 32.0) * cs.get("Y", 1) * rsy
        hz = ext.get("Z", 32.0) * cs.get("Z", 1) * rsz
    return {
        "area": area, "shape": shape,
        "x": rl.get("X", 0) + ox * math.cos(yaw0) - oy * math.sin(yaw0),
        "y": rl.get("Y", 0) + ox * math.sin(yaw0) + oy * math.cos(yaw0),
        "z": rl.get("Z", 0) + cl.get("Z", 0) * rsz,
        "hx": abs(hx), "hy": abs(hy), "hz": abs(hz),
        "yaw": (rr.get("Yaw", 0) or 0) + (cr.get("Yaw", 0) or 0),
    }


def _extract_region_volumes(raw: Path) -> list[dict]:
    """All placed region trigger volumes (persistent level + cells)."""
    cells_dir = raw / _CELLS_REL
    files = [raw / "Maps/MainWorld_5/PL_MainWorld5.json"]
    if cells_dir.is_dir():
        files += [cells_dir / rel for rel in _grep_files(cells_dir, "PalRegionTrigger", ["MainGrid*.json"])]
    volumes = []
    for f in files:
        if not f.exists():
            continue
        exports = json.loads(f.read_text(encoding="utf-8"))
        for actor in exports:
            if actor.get("Type") in _REGION_TRIGGER_TYPES:
                v = _region_volume(actor, exports)
                if v:
                    volumes.append(v)
    volumes.sort(key=lambda v: v["area"])
    return volumes


def _region_names(raw: Path) -> dict:
    """{areaKey: {lng: localizedName}} — DT_WorldMapAreaData rows joined onto
    the world-map text table (the same names the in-game map shows)."""
    area_table = raw / "DataTable/WorldMapAreaData/DT_WorldMapAreaData.json"
    if not area_table.exists():
        return {}
    area_rows = read_rows(area_table)
    text = _read_text_by_lang(raw, "DT_WorldMap_Common_Text_Common.json")
    out = {}
    for key, row in area_rows.items():
        msg = row.get("MsgID")
        if not msg or msg == "None":
            continue
        by_lng = {tag: name for tag, table in text.items() if (name := table.get(msg))}
        if by_lng:
            out[key] = by_lng
    return out


def _grep_files(cwd: Path, pattern: str, includes: list[str]) -> list[str]:
    args = ["grep", "-rlEi", *[f"--include={g}" for g in includes], pattern, "."]
    r = subprocess.run(args, cwd=cwd, capture_output=True, text=True, encoding="utf-8")
    if r.returncode not in (0, 1):
        raise RuntimeError(f"grep failed ({r.returncode}): {r.stderr}")
    return [ln for ln in r.stdout.split("\n") if ln.strip()]


def _extract_cell_pois(raw: Path) -> list[dict]:
    cells_dir = raw / _CELLS_REL
    files = _grep_files(
        cells_dir, CELL_GREP,
        ["MainGrid*.json", "oilrig_L0_*.json", "CloseRange_L0_*.json"],
    )
    pois: list[dict] = []
    seen = set()
    for rel in files:
        arr = json.loads((cells_dir / rel).read_text(encoding="utf-8"))
        for exp in arr:
            t = exp.get("Type") or ""
            subtype = _match(CELL_CLASSES, t)
            effigy_pal = None
            if not subtype:
                m = EFFIGY_VARIANT_RX.match(t)
                if m:
                    effigy_pal = m.group(1)
                    subtype = f"effigy{effigy_pal}"
            if not subtype:
                continue
            location = _actor_location(exp, arr)
            if not location:
                continue
            k = f"{subtype}|{js_round(location['X'] / 100)}|{js_round(location['Y'] / 100)}"
            if k in seen:
                continue
            seen.add(k)
            poi = {"subtype": subtype, "sourceName": exp["Name"], "location": location}
            if effigy_pal:
                poi["effigyPal"] = effigy_pal
            if subtype == "note":
                row = ((exp.get("Properties") or {}).get("NoteRowName") or {}).get("Key")
                if row:
                    poi["noteRow"] = row
            elif subtype == "ancientShrine":
                row = ((exp.get("Properties") or {}).get("ItemPickupRowName") or {}).get("Key")
                if row:
                    poi["pickupRow"] = row
            elif subtype == "warpAltar":
                # GUID of the altar's own WarpPointDestination actor; resolved to
                # the partner altar in _link_warp_altars, then stripped.
                dest = (exp.get("Properties") or {}).get("SourceDestinationLevelObjectId")
                if dest:
                    poi["warpDestId"] = dest
            pois.append(poi)
    return pois


def _link_warp_altars(pois: list[dict], level: list) -> None:
    """Resolve each warp altar's partner altar and record it as
    ``warpPartnerSource`` (the partner's actor sourceName; ``emit`` maps it to
    the partner's final marker id).

    The connection is a two-hop GUID chain: an altar's
    ``SourceDestinationLevelObjectId`` names its OWN ``WarpPointDestination``
    actor (placed beside it in the persistent level); destinations reference
    each other via ``PairedDestinationLevelObjectId``. Altars A and B are
    connected iff their destinations form such a pair — using an altar warps
    the player to the paired (far) destination, so links are bidirectional."""
    pair_of = {}
    for exp in level:
        if not _WARP_DEST_RX.match(exp.get("Type") or ""):
            continue
        p = exp.get("Properties") or {}
        inst, pair = p.get("LevelObjectInstanceId"), p.get("PairedDestinationLevelObjectId")
        if inst and pair:
            pair_of[inst] = pair
    altar_by_dest = {p["warpDestId"]: p for p in pois if p.get("warpDestId")}
    for p in pois:
        dest = p.pop("warpDestId", None)
        if not dest:
            continue
        partner = altar_by_dest.get(pair_of.get(dest))
        if partner is not None and partner is not p:
            p["warpPartnerSource"] = partner["sourceName"]


def _dedup_pois_by_location(pois: list[dict], subtypes: set[str]) -> list[dict]:
    """Drop duplicate POIs of the given subtypes at the same rounded world
    location. Notes exist in BOTH the persistent level and the world-partition
    cells (the L15 aggregate), so the combined list would otherwise double-count
    them. Other subtypes are left untouched (first occurrence wins)."""
    seen: set = set()
    out: list[dict] = []
    for p in pois:
        if p["subtype"] in subtypes:
            k = (p["subtype"], js_round(p["location"]["X"] / 100), js_round(p["location"]["Y"] / 100))
            if k in seen:
                continue
            seen.add(k)
        out.append(p)
    return out


def _npc_identity(exp: dict) -> str | None:
    """Identity of an NPC spawner actor, or None if it isn't one we surface.

    The generic ``BP_MonoNPCSpawner_C`` carries the identity in its
    ``UniqueName`` key; named variants bake it into the class suffix. Prefer the
    UniqueName key (more specific), else the class suffix."""
    m = NPC_SPAWNER_RX.match(exp.get("Type") or "")
    if not m:
        return None
    uk = ((exp.get("Properties") or {}).get("UniqueName") or {}).get("Key")
    if uk and uk not in ("None", ""):
        return uk
    return m.group(1)  # class suffix (None for the bare BP_MonoNPCSpawner_C)


# Portrait-icon fallbacks for NPCs whose identity maps to no
# DT_PalCharacterIconDataTable key by the general rules in `_npc_name_icon`
# (generic/quest NPCs with no dedicated portrait row). identity -> icon key.
NPC_ICON_ALIASES = {
    # Wildlife-sanctuary guide: a generic male "Mobu" NPC with no portrait row
    # (CharacterID WildlifeSanctuary_guide, NameTextID BattlePaltamer001) — use
    # the generic male-citizen portrait.
    "U_WildlifeSanctuary_guide": "MobuCitizen_Male",
}

# Trailing spawn/variant index on a CharacterID (Male_DarkTrader01_03 -> _03).
_ICON_VARIANT_IDX_RX = re.compile(r"_\d+$")
# Trailing digits on a spawner class-suffix role (Breeder03 -> Breeder).
_ICON_TRAIL_DIGITS_RX = re.compile(r"\d+$")

# Sub-quest title text id embedded in a BP_SubQuest_<X> blueprint (the quest name).
_QUESTNAME_RX = re.compile(r"QUEST_SUB_QUESTNAME_[A-Za-z0-9_]+")


def _quest_npc_names(raw: Path) -> dict[str, dict]:
    """{npcId: {tag: questTitle}} for quest-target NPCs with no DT_UniqueNPC row.

    Such NPCs (e.g. Breeder03, Ranger02, StrongOldMan01) are the target of a
    ``Sub_<npcId>`` sub-quest (DT_PalQuestData). That quest's blueprint embeds a
    ``QUEST_SUB_QUESTNAME_*`` text id whose localized value ("The Fugitive",
    "Captured Adventurer", …, in DT_UI_Common_Text) is the only per-NPC label
    available — used as the marker name so these otherwise-nameless quest markers
    read meaningfully."""
    quest_path = raw / "DataTable/Quest/DT_PalQuestData.json"
    if not quest_path.exists():
        return {}
    quest = read_rows(quest_path)
    ui = _read_text_by_lang(raw, "DT_UI_Common_Text_Common.json")
    out: dict[str, dict] = {}
    for qid, row in quest.items():
        if not qid.startswith("Sub_"):
            continue
        asset = (row.get("QuestData") or {}).get("AssetPathName") or ""
        rel = asset.split(".")[0].replace("/Game/Pal/", "")
        bp = raw / f"{rel}.json"
        if not rel or not bp.exists():
            continue
        m = _QUESTNAME_RX.search(bp.read_text(encoding="utf-8"))
        if not m:
            continue
        names = {tag: t[m.group(0)] for tag, t in ui.items() if m.group(0) in t}
        if names:
            out[qid[len("Sub_"):]] = names
    return out


def _npc_name_icon(raw: Path):
    """Resolver: NPC UniqueName -> (nameByLng | None, iconStem | None).

    ``DT_UniqueNPC`` (keyed by the spawner's UniqueName) gives a ``NameTextID``
    (localized in ``DT_UniqueNPCText``, with ``DT_HumanNameText`` as a fallback
    for role-name ids) and a ``CharacterID``. ``DT_PalCharacterIconDataTable``
    maps a character key to a portrait texture under ``Texture/PalIcon``.

    The portrait key rarely matches the UniqueName/CharacterID verbatim, so the
    lookup walks an ordered candidate chain (`_icon_stem`): exact ids, the
    CharacterID minus its ``_NN`` variant index (Male_DarkTrader01_03 ->
    Male_DarkTrader01), the ``NameTextID`` minus its ``NAME_`` prefix
    (NAME_Male_SorajimaPeople01 -> Male_SorajimaPeople01), a gender-prefixed bare
    id (StrongOldMan02 -> Male_StrongOldMan02), then a role-base match for
    quest-spawner suffixes (Breeder03 -> Male_Breeder01_v01, Ranger02 ->
    Female_Ranger01_v01), and finally a hand-curated ``NPC_ICON_ALIASES`` entry.
    The rare NPC still unresolved falls back to a humanized label + color pin in
    ``emit``."""
    def _rows(rel: str) -> dict:
        p = raw / rel
        return read_rows(p) if p.exists() else {}

    uniq = _rows("DataTable/Character/DT_UniqueNPC_Common.json")
    icon_rows = _rows("DataTable/Character/DT_PalCharacterIconDataTable_Common.json")
    unpc = _read_text_by_lang(raw, "DT_UniqueNPCText_Common.json")
    human = _read_text_by_lang(raw, "DT_HumanNameText_Common.json")
    quest_names = _quest_npc_names(raw)
    tags = [JA_TAG, *L10N_LANG_TAGS.values()]

    def _stem(row: dict | None) -> str:
        path = (row.get("Icon") or {}).get("AssetPathName", "") if row else ""
        return path.split(".")[-1] if path else ""

    def _icon_stem(npc_id: str, cid: str | None, nt: str | None, row: dict) -> str:
        """First portrait stem from the ordered candidate chain (see docstring)."""
        cands = [npc_id]
        if cid and cid != "None":
            cands += [cid, _ICON_VARIANT_IDX_RX.sub("", cid)]
        if nt and nt != "None":
            cands.append(re.sub(r"^NAME_", "", nt))
        gender = (row.get("Gender") or "").split("::")[-1]
        genders = [gender] if gender in ("Male", "Female") else ["Male", "Female"]
        cands += [f"{g}_{npc_id}" for g in genders]
        for k in cands:
            st = _stem(icon_rows.get(k))
            if st:
                return st
        # Role-base match: strip the spawner suffix's trailing index to the bare
        # role, then take the lowest-sorted <Gender>_<role>NN(_vNN) portrait.
        role = _ICON_TRAIL_DIGITS_RX.sub("", npc_id)
        if len(role) >= 4:
            rx = re.compile(rf"^(?:{'|'.join(genders)})_{re.escape(role)}\d*(?:_v\d+)?$")
            for k in sorted(icon_rows):
                if rx.match(k) and (st := _stem(icon_rows.get(k))):
                    return st
        return _stem(icon_rows.get(NPC_ICON_ALIASES.get(npc_id)))

    def resolve(npc_id: str) -> tuple[dict | None, str | None]:
        row = uniq.get(npc_id) or {}
        nt, cid = row.get("NameTextID"), row.get("CharacterID")
        name_by_lng = {}
        if nt and nt != "None":
            for tag in tags:
                nm = unpc.get(tag, {}).get(nt) or human.get(tag, {}).get(nt)
                if nm:
                    name_by_lng[tag] = nm
        # No DT_UniqueNPC name -> fall back to the sub-quest title (quest targets).
        name = name_by_lng or quest_names.get(npc_id)
        return (name or None, _icon_stem(npc_id, cid, nt, row) or None)

    return resolve


def _extract_npcs(raw: Path, level: list) -> list[dict]:
    """Talkable/merchant/quest NPC spawners from the persistent level and the
    world-partition cells, deduped by (npcId, rounded world location).

    Each NPC is enriched with a localized name and portrait icon resolved via
    _npc_name_icon."""
    resolve = _npc_name_icon(raw)
    npcs: list[dict] = []
    seen: set = set()

    def add(exp: dict, exports: list) -> None:
        nid = _npc_identity(exp)
        if not nid:
            return
        loc = _actor_location(exp, exports)
        if not loc:
            return
        k = (nid, js_round(loc["X"] / 100), js_round(loc["Y"] / 100))
        if k in seen:
            return
        seen.add(k)
        entry = {"npcId": nid, "sourceName": exp["Name"], "location": loc}
        name_by_lng, icon = resolve(nid)
        if name_by_lng:
            entry["nameByLng"] = name_by_lng
        if icon:
            entry["icon"] = icon
        npcs.append(entry)

    for exp in level:
        add(exp, level)
    cells_dir = raw / _CELLS_REL
    for rel in _grep_files(cells_dir, "NPCSpawner", ["MainGrid*.json"]):
        arr = json.loads((cells_dir / rel).read_text(encoding="utf-8"))
        for exp in arr:
            add(exp, arr)
    return npcs


def _grep_count(cwd: Path, regex: str, target: str, include: str | None) -> int:
    args = ["grep", "-rhoEi"]
    if include:
        args.append(f"--include={include}")
    args += [regex, target]
    r = subprocess.run(args, cwd=cwd, capture_output=True, text=True, encoding="utf-8")
    if r.returncode not in (0, 1):
        raise RuntimeError(f"grep failed ({r.returncode}): {r.stderr}")
    return len([ln for ln in r.stdout.split("\n") if ln])


def _count_new_type_candidates(raw: Path) -> dict:
    cells_dir = raw / _CELLS_REL
    level_file = str(raw / _LEVEL_REL)
    out = {}
    for key, desc, pattern in NEW_TYPE_WATCH:
        regex = f'"Type": "{pattern}[A-Za-z0-9_]*"'
        in_cells = _grep_count(cells_dir, regex, ".", "*.json")
        in_level = _grep_count(cells_dir, regex, level_file, None)
        out[key] = {"desc": desc, "pattern": pattern, "count": in_cells + in_level}
    return out


# ja/zh join a name prefix without a space; others use a space.
_CJK_TAIL = re.compile("[぀-ヿ㐀-鿿豈-﫿]")
_VARIANT_SUFFIX = re.compile(r"_(Ice|Fire|Dark|Ground|Electric|Grass|Water)$")


def run_extract(raw: Path) -> dict:
    raw = Path(raw)
    ui_rows = read_rows(raw / "DataTable/WorldMapUIData/DT_WorldMapUIData.json")
    bounds = {
        "MainWorld": {"min": ui_rows["MainMap"]["landScapeRealPositionMin"],
                      "max": ui_rows["MainMap"]["landScapeRealPositionMax"]},
        "WorldTree": {"min": ui_rows["Tree"]["landScapeRealPositionMin"],
                      "max": ui_rows["Tree"]["landScapeRealPositionMax"]},
    }

    ft_names = _read_text_by_lang(raw, "DT_MapRespawnPointInfoText.json")

    # Dungeon portals: each BP_DungeonPortalMarker_<Biome>_C carries a default
    # SpawnAreaId list (its dungeon type); some placed actors override it
    # (that's how Grass002/Forest002 and the PvP-island caverns reach the map).
    # The area id keys the dungeons.json loot dataset; the localized dungeon
    # name comes from DT_DungeonNameText via the spawn-area table.
    portal_default_area: dict[str, str] = {}
    portal_bp_dir = raw / "Blueprint/MapObject/Dungeon"
    if portal_bp_dir.exists():
        for bp in sorted(portal_bp_dir.rglob("BP_DungeonPortalMarker_*.json")):
            for obj in json.loads(bp.read_text(encoding="utf-8")):
                ids = (obj.get("Properties") or {}).get("SpawnAreaIds")
                if ids and (obj.get("Name") or "").startswith("Default__"):
                    portal_default_area[f"{bp.stem}_C"] = ids[0].get("Key")
    area_table = raw / "DataTable/Dungeon/DT_DungeonSpawnAreaDataTable.json"
    dungeon_area_rows = read_rows(area_table) if area_table.exists() else {}
    dungeon_names = _read_text_by_lang(raw, "DT_DungeonNameText.json")

    def dungeon_name_by_lng(area: str) -> dict | None:
        text_id = (dungeon_area_rows.get(area) or {}).get("DungeonNameTextId")
        if not text_id:
            return None
        nm = {tag: tbl[text_id] for tag, tbl in dungeon_names.items() if tbl.get(text_id)}
        return nm or None

    # Localized map display names, from the game's WorldMap UI text table.
    worldmap_text = _read_text_by_lang(raw, "DT_WorldMap_Common_Text_Common.json")
    map_names = {
        mid: {tag: tbl[key] for tag, tbl in worldmap_text.items() if tbl.get(key)}
        for mid, key in MAP_NAME_KEYS.items()
    }

    level = json.loads((raw / _LEVEL_REL).read_text(encoding="utf-8"))

    # Tower fast-travel points (both BP_LevelObject_ and BP_MapObject_ variants)
    # carry a FastTravelPointID keying the tower name; each tower actor sits at
    # exactly one (1:1 mutual nearest), so a nearest-point lookup resolves it.
    tower_ft_points = []
    for exp in level:
        if not (exp.get("Type") or "").endswith("TowerFastTravelPoint_C"):
            continue
        fid = (exp.get("Properties") or {}).get("FastTravelPointID")
        loc = _actor_location(exp, level)
        if fid and loc:
            tower_ft_points.append((fid, loc))

    def tower_name_by_lng(loc):
        best, bd = None, math.inf
        for fid, floc in tower_ft_points:
            d = math.hypot(floc["X"] - loc["X"], floc["Y"] - loc["Y"])
            if d < bd:
                bd, best = d, fid
        return _ft_name_by_lng(ft_names, best) if best is not None else None

    pois: list[dict] = []
    for exp in level:
        subtype = _match(POI_CLASSES, exp.get("Type") or "")
        if not subtype:
            continue
        location = _actor_location(exp, level)
        if not location:
            continue
        poi = {"subtype": subtype, "sourceName": exp["Name"], "location": location}
        # fastTravel and eagleStatue (UnlockMapPoint, the map-reveal "watchtower")
        # both carry their own FastTravelPointID keying DT_MapRespawnPointInfoText
        # (eagle statues use the WatchTower_* / WatchTower_WorldTree_* rows).
        if subtype in ("fastTravel", "eagleStatue"):
            nm = _ft_name_by_lng(ft_names, (exp.get("Properties") or {}).get("FastTravelPointID"))
            if nm:
                poi["nameByLng"] = nm
        elif subtype == "tower":
            nm = tower_name_by_lng(location)
            if nm:
                poi["nameByLng"] = nm
        elif subtype == "note":
            row = ((exp.get("Properties") or {}).get("NoteRowName") or {}).get("Key")
            if row:
                poi["noteRow"] = row
        elif subtype == "ancientShrine":
            row = ((exp.get("Properties") or {}).get("ItemPickupRowName") or {}).get("Key")
            if row:
                poi["pickupRow"] = row
        elif subtype == "dungeon":
            ids = (exp.get("Properties") or {}).get("SpawnAreaIds")
            area = (ids[0].get("Key") if ids else None) or portal_default_area.get(exp.get("Type") or "")
            if area:
                poi["dungeonArea"] = area
                nm = dungeon_name_by_lng(area)
                if nm:
                    poi["nameByLng"] = nm
        pois.append(poi)
    _strip_entrance_suffixes([p["nameByLng"] for p in pois if p["subtype"] == "tower" and "nameByLng" in p])
    pois.extend(_extract_cell_pois(raw))
    # Notes and shrines are scanned from both the level and the cells; dedup the union.
    pois = _dedup_pois_by_location(pois, {"note", "ancientShrine"})
    # Warp altars: resolve each altar's partner via the persistent-level
    # WarpPointDestination pairing (done after dedup so links land on the
    # surviving poi objects).
    _link_warp_altars(pois, level)

    # Resolve note names/descriptions/illustrations from their NoteRowName. Done
    # after the level+cell dedup so each surviving note gets labelled once.
    note_resolve = _note_resolver(raw)
    for p in pois:
        if p["subtype"] != "note" or not p.get("noteRow"):
            continue
        name_by_lng, desc_by_lng, image = note_resolve(p["noteRow"])
        if name_by_lng:
            p["nameByLng"] = name_by_lng
        if desc_by_lng:
            p["descByLng"] = desc_by_lng
        if image:
            p["image"] = image

    # Resolve Ancient Shrine rewards + names from their ItemPickupRowName. Each
    # shrine grants one gear schematic + Dog Coins (DT_ItemPickupDataTable); label
    # the marker by the schematic's localized item name (DT_ItemNameText).
    if any(p["subtype"] == "ancientShrine" for p in pois):
        pickup_rows = read_rows(raw / "DataTable/Item/DT_ItemPickupDataTable.json")
        shrine_item_names = _read_text_by_lang(raw, "DT_ItemNameText_Common.json")
        for p in pois:
            if p["subtype"] != "ancientShrine":
                continue
            rec = pickup_rows.get(p.pop("pickupRow", None) or "")
            item = (rec or {}).get("Item_01_Id")
            if not rec or not item or item == "None":
                continue
            reward = {"item": item, "count": rec.get("Item_01_Num", 1)}
            if rec.get("Item_02_Id") == "DogCoin":
                reward["dogCoin"] = rec.get("Item_02_Num", 0)
            p["reward"] = reward
            key = f"ITEM_NAME_{item}"
            names = {tag: t[key] for tag, t in shrine_item_names.items() if key in t}
            if names:
                p["nameByLng"] = names

    npcs = _extract_npcs(raw, level)

    boss_rows = read_rows(raw / "DataTable/UI/DT_BossSpawnerLoactionData.json")
    bosses = []
    for key, r in boss_rows.items():
        cid = r.get("CharacterID")
        if cid and re.match(r"^BOSS_", cid, re.IGNORECASE):
            bosses.append({
                "key": key, "characterId": cid, "level": r["Level"],
                "location": {"X": r["Location"]["X"], "Y": r["Location"]["Y"], "Z": r["Location"].get("Z", 0)},
            })

    # Wanted criminals: human bosses (CharacterID "None" + BOSS_* SpawnerID).
    human_names = _read_text_by_lang(raw, "DT_HumanNameText_Common.json")
    boss_npc_icon = read_rows(raw / "DataTable/Character/DT_PalBossNPCIcon.json")
    # Their SpawnerID doubles as the CharacterID keying DT_PalDropItem, so the
    # kill drops (bounty tokens, gold, keys) resolve like a pal's. One outlier
    # (BOSS_Police_Old) has no drop row and simply gets no drops. (Deferred
    # import: encyclopedia reaches back into maps.extract via breeding, so a
    # top-level import would be circular.)
    from ..encyclopedia import _drops
    drop_path = raw / "DataTable/Character/DT_PalDropItem.json"
    drop_rows = read_rows(drop_path) if drop_path.exists() else {}
    wanted_seen = set()
    wanted = []
    for r in boss_rows.values():
        sid = r.get("SpawnerID") or ""
        if r.get("CharacterID") and r.get("CharacterID") != "None":
            continue
        if not re.match(r"^BOSS_", sid, re.IGNORECASE):
            continue
        k = f"{sid}|{js_round(r['Location']['X'])}|{js_round(r['Location']['Y'])}"
        if k in wanted_seen:
            continue
        wanted_seen.add(k)
        name_by_lng = {}
        for tag, table in human_names.items():
            nm = table.get(f"NAME_{sid}")
            if nm:
                name_by_lng[tag] = nm
        icon_asset = (boss_npc_icon.get(sid, {}).get("Icon") or {}).get("AssetPathName", "")
        icon_stem = icon_asset.split(".")[-1] if icon_asset else ""
        entry = {"spawnerId": sid, "level": r["Level"],
                 "location": {"X": r["Location"]["X"], "Y": r["Location"]["Y"], "Z": r["Location"].get("Z", 0)}}
        if icon_stem:
            entry["icon"] = icon_stem
        if name_by_lng:
            entry["nameByLng"] = name_by_lng
        drops = _drops(sid, drop_rows)
        if drops:
            entry["drops"] = drops
        wanted.append(entry)

    wild_rows = read_rows(raw / "DataTable/Spawner/DT_PalWildSpawner.json")
    # A SpawnerName spans MANY rows — an area spawner lists each of its possible
    # pals (and day/night, level-band, weather variants) in its own row. Aggregate
    # the union of pals per name; keying by name alone would keep only the last row
    # and drop the rest (most wild pals). Dedup by pal id, widening the level band.
    # ``OnlyTime`` is the spawn system's only time restriction: ``Night`` rows
    # spawn only at night, ``Undefined`` rows any time (no Day-only rows exist).
    # A pal is night-only at a spawner iff every row listing it there is Night.
    wild_by_name: dict[str, dict[str, dict]] = {}
    for r in wild_rows.values():
        name = r["SpawnerName"]
        is_night = r.get("OnlyTime") == "EPalOneDayTimeType::Night"
        for n in (1, 2, 3):
            pid = r.get(f"Pal_{n}")
            if not pid or pid == "None":
                continue
            slot = wild_by_name.setdefault(name, {})
            lv_min, lv_max = r[f"LvMin_{n}"], r[f"LvMax_{n}"]
            cur = slot.get(pid)
            if cur:
                cur["lvMin"] = min(cur["lvMin"], lv_min)
                cur["lvMax"] = max(cur["lvMax"], lv_max)
                if not is_night:
                    cur.pop("nightOnly", None)
            else:
                slot[pid] = {"id": pid, "lvMin": lv_min, "lvMax": lv_max}
                if is_night:
                    slot[pid]["nightOnly"] = True
    place_rows = read_rows(raw / "DataTable/Spawner/DT_PalSpawnerPlacement.json")
    pal_spawns = []
    for r in place_rows.values():
        if r.get("SpawnerType") != "EPalSpawnedCharacterType::Common":
            continue
        pals = wild_by_name.get(r["SpawnerName"])
        if not pals:
            continue
        pal_spawns.append({
            "spawnerName": r["SpawnerName"], "pals": list(pals.values()),
            "location": {"X": r["Location"]["X"], "Y": r["Location"]["Y"], "Z": r["Location"].get("Z", 0)},
        })

    # Paldeck order metadata.
    mon_param = read_rows(raw / "DataTable/Character/DT_PalMonsterParameter.json")
    pal_meta = {}
    for pid, r in mon_param.items():
        pal_meta[pid] = {"zukanIndex": r.get("ZukanIndex", -1), "zukanIndexSuffix": r.get("ZukanIndexSuffix", "")}

    # Field bosses: fixed boss spawns placed via DT_PalSpawnerPlacement (type
    # FieldBoss). Their spawner rows list BOSS_<pal> codenames (a placement may
    # offer a small pool). Emit each as an alpha-boss (same path as the bosses
    # above). Most duplicate DT_BossSpawnerLoactionData at identical coords — skip
    # those — leaving only bosses that table omits (e.g. BlackCentaur).
    # Dedup on the stripped pal id (not the raw codename): the two tables label
    # the same boss slightly differently (e.g. BOSS_X vs a variant), so keying on
    # characterId would leave duplicate markers at identical coords.
    def _boss_base(cid: str) -> str:
        return re.sub(r"^BOSS_", "", cid, flags=re.IGNORECASE)

    boss_seen = {
        (_boss_base(b["characterId"]), js_round(b["location"]["X"]), js_round(b["location"]["Y"]))
        for b in bosses
    }
    for r in place_rows.values():
        if r.get("SpawnerType") != "EPalSpawnedCharacterType::FieldBoss":
            continue
        pals = wild_by_name.get(r["SpawnerName"])
        if not pals:
            continue
        loc = {"X": r["Location"]["X"], "Y": r["Location"]["Y"], "Z": r["Location"].get("Z", 0)}
        lx, ly = js_round(loc["X"]), js_round(loc["Y"])
        for cid, info in pals.items():
            base = _boss_base(cid)
            if base not in pal_meta:  # skip non-roster codenames (RowName, mixed-case, …)
                continue
            key = (base, lx, ly)
            if key in boss_seen:
                continue
            boss_seen.add(key)
            # Normalise to BOSS_<base> so every boss entry is uniform (some
            # FieldBoss rows reference the pal by its plain id).
            bosses.append({
                "key": f"FB-{r['SpawnerName']}-{base}",
                "characterId": f"BOSS_{base}",
                "level": info["lvMax"],
                "location": loc,
            })

    # Night-only field bosses (their spawner rows carry OnlyTime=Night): flag
    # every boss entry whose pal+coords match such a placement — the entry may
    # have come from the placement loop above OR from DT_BossSpawnerLoactionData
    # (in which case the placement duplicate was skipped but the boss is still
    # the night-restricted spawn).
    night_boss_keys = set()
    for r in place_rows.values():
        if r.get("SpawnerType") != "EPalSpawnedCharacterType::FieldBoss":
            continue
        for cid, info in (wild_by_name.get(r["SpawnerName"]) or {}).items():
            if info.get("nightOnly"):
                night_boss_keys.add(
                    (_boss_base(cid), js_round(r["Location"]["X"]), js_round(r["Location"]["Y"]))
                )
    for b in bosses:
        key = (_boss_base(b["characterId"]), js_round(b["location"]["X"]), js_round(b["location"]["Y"]))
        if key in night_boss_keys:
            b["nightOnly"] = True

    # Kill drops for field bosses: BOSS_ entries in DT_PalDropItem include rare
    # schematic drops (3%) alongside guaranteed PalCrystal_Ex/sell-item slots.
    # Zero-rate slots are intentional overrides (base pal materials suppressed for
    # the boss form) — exclude them.
    for b in bosses:
        drops = [d for d in _drops(b["characterId"], drop_rows) if d["rate"] > 0]
        if drops:
            b["drops"] = drops

    names_by_lang = {tag: _read_l10n_pal_names(raw, folder, tag) for folder, tag in L10N_LANG_TAGS.items()}
    names_by_lang[JA_TAG] = _read_pal_names(raw / "DataTable/Text/DT_PalNameText_Common.json")

    # Sealed Realms: each ImprisonmentBoss placement seals a caged alpha boss.
    # Emit one location POI per realm, labelled with the boss it holds.
    realm_seen = set()
    for r in place_rows.values():
        if r.get("SpawnerType") != "EPalSpawnedCharacterType::ImprisonmentBoss":
            continue
        loc = {"X": r["Location"]["X"], "Y": r["Location"]["Y"], "Z": r["Location"].get("Z", 0)}
        k = (js_round(loc["X"]), js_round(loc["Y"]))
        if k in realm_seen:
            continue
        realm_seen.add(k)
        poi = {"subtype": "sealedRealm", "sourceName": r["SpawnerName"], "location": loc}
        pals = wild_by_name.get(r["SpawnerName"]) or {}
        boss = next(
            (b for pid in pals if (b := re.sub(r"^BOSS_", "", pid, flags=re.IGNORECASE)) in pal_meta),
            None,
        )
        if boss:
            lb = boss.lower()
            name_by_lng = {tag: names[lb] for tag, names in names_by_lang.items() if names.get(lb)}
            if name_by_lng:
                poi["nameByLng"] = name_by_lng
        pois.append(poi)

    # Recursive: the Terraria-collab (Yakushima) pal icons live in a subfolder.
    pal_icons = sorted(p.stem for p in (raw / "Texture/PalIcon/Normal").rglob("*.png"))
    pal_icon_set = set(pal_icons)

    # Predators: BP_PalSpawner_Sheets_*_PreBOSS_* actors in the cells.
    predator_prefix = {JA_TAG: _prefix(raw / "DataTable/Text/DT_NamePrefixText_Common.json")}
    for folder, tag in L10N_LANG_TAGS.items():
        predator_prefix[tag] = _prefix(
            raw.parent / "L10N" / folder / "Pal/DataTable/Text/DT_NamePrefixText_Common.json"
        ) or predator_prefix[JA_TAG]
    sheet_dir = raw / "Blueprint/Spawner/SheetsVariant"
    predator_sheet: dict[str, dict] = {}  # spawner-class Type -> {pal, level}
    for f in sheet_dir.iterdir():
        if "PreBOSS" not in f.name or f.suffix != ".json":
            continue
        for e in json.loads(f.read_text(encoding="utf-8")):
            for g in (e.get("Properties") or {}).get("SpawnGroupList") or []:
                for pl in g.get("PalList") or []:
                    if (pl.get("PalId") or {}).get("Key", "").startswith("PREDATOR_"):
                        predator_sheet[e["Type"]] = {"pal": pl["PalId"]["Key"], "level": pl["Level"]}

    def predator_name(base: str) -> dict:
        out = {}
        for tag, names in names_by_lang.items():
            pn = names.get(base.lower()) or names.get(_VARIANT_SUFFIX.sub("", base).lower())
            if not pn:
                continue
            pre = predator_prefix.get(tag)
            if pre:
                sep = "" if _CJK_TAIL.search(pre[-1]) else " "
                out[tag] = f"{pre}{sep}{pn}"
            else:
                out[tag] = pn
        return out

    predators = []
    cells_dir = raw / _CELLS_REL
    pred_files = _grep_files(cells_dir, "PreBOSS", ["MainGrid*.json"])
    pred_seen = set()
    for rel in pred_files:
        arr = json.loads((cells_dir / rel).read_text(encoding="utf-8"))
        for e in arr:
            info = predator_sheet.get(e.get("Type"))
            if not info:
                continue
            location = _actor_location(e, arr)
            if not location:
                continue
            k = f"{info['pal']}|{js_round(location['X'] / 100)}|{js_round(location['Y'] / 100)}"
            if k in pred_seen:
                continue
            pred_seen.add(k)
            base = info["pal"][len("PREDATOR_"):]
            icon_stem = f"T_{base}_icon_normal"
            nm = predator_name(base)
            entry = {"pal": info["pal"], "level": info["level"], "location": location}
            if icon_stem in pal_icon_set:
                entry["icon"] = icon_stem
            if nm:
                entry["nameByLng"] = nm
            predators.append(entry)

    new_type_candidates = _count_new_type_candidates(raw)

    # Effigy statue names: each pal effigy is the item ITEM_NAME_Relic_<NN>
    # (Japanese "<pal>像"). Map each captured `effigy<Pal>` subtype to its
    # localized item name by matching the pal's Japanese name, so subtypes read
    # e.g. "Lamball Effigy" / "棉悠悠雕像" rather than the bare pal name.
    item_names = _read_text_by_lang(raw, "DT_ItemNameText_Common.json")
    buildup = _read_text_by_lang(raw, "DT_UI_Common_Text_Common.json")  # Statue-of-Power UI text
    ja_relic_key = {}  # ja pal name -> ITEM_NAME_Relic_<NN> key
    for key, name in item_names[JA_TAG].items():
        if key.startswith("ITEM_NAME_Relic_") and name.endswith("像"):
            ja_relic_key[name[:-1]] = key
    ja_pal_names = names_by_lang[JA_TAG]
    effigy_names: dict[str, dict] = {}  # effigy subtype id -> {tag: name}
    effigy_icons: dict[str, str] = {}   # effigy subtype id -> relic item icon stem
    effigy_descs: dict[str, dict] = {}  # effigy subtype id -> {tag: buff description}
    for poi in pois:
        pal = poi.get("effigyPal")
        if not pal or poi["subtype"] in effigy_names:
            continue
        key = ja_relic_key.get(ja_pal_names.get(pal.lower(), ""))
        if key:
            effigy_names[poi["subtype"]] = {
                tag: tbl[key] for tag, tbl in item_names.items() if key in tbl
            }
            # Relic item icon: ITEM_NAME_Relic_<NN> -> texture stem
            # "T_itemicon_Relic_<NN>" (resolved from Others/InventoryItemIcon).
            effigy_icons[poi["subtype"]] = "T_itemicon_" + key[len("ITEM_NAME_"):]
        # Buff description: the relic's EPalRelicType -> Statue-of-Power status text.
        desc = _relic_buff_desc(_relic_type_of(raw, pal), buildup)
        if desc:
            effigy_descs[poi["subtype"]] = desc

    # The plain Lifmunk Effigy (base relic, subtype "lifmunkEffigy") has no
    # EPalRelicType in its BP: it grants the default Capture Power buff (index 0,
    # the effect Lifmunk Effigies feed into at the Statue of Power). Give it the
    # same player-attribute description every pal effigy carries.
    base_desc = _relic_buff_desc("CapturePower", buildup)
    if base_desc:
        effigy_descs.setdefault("lifmunkEffigy", base_desc)

    return {
        "bounds": bounds, "mapNames": map_names, "pois": pois, "bosses": bosses, "wanted": wanted,
        "predators": predators, "palSpawns": pal_spawns, "palMeta": pal_meta,
        "namesByLang": names_by_lang, "palIcons": pal_icons,
        "effigyNames": effigy_names, "effigyIcons": effigy_icons,
        "effigyDescriptions": effigy_descs, "npcs": npcs,
        "newTypeCandidates": new_type_candidates,
        "regionVolumes": _extract_region_volumes(raw), "regionNames": _region_names(raw),
    }


def _prefix(path: Path):
    try:
        r = read_rows(path).get("PREDATOR_NAME") or {}
        td = r.get("TextData") or {}
        return td.get("LocalizedString") or td.get("SourceString")
    except (FileNotFoundError, OSError, KeyError, IndexError):
        return None


def write_parsed(raw: Path, out_dir: Path) -> dict:
    from .common import dumps  # local import to avoid cycle at module load
    out = run_extract(raw)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "parsed.json").write_text(dumps(out), encoding="utf-8")
    return out


def read_parsed(out_dir: Path) -> dict:
    p = json.loads((Path(out_dir) / "parsed.json").read_text(encoding="utf-8"))
    return p
