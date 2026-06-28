"""Emit the FRONTEND data schema into the `data/` repo from the parsed
per-map JSON (``tools/parsed_data/maps/*.json``).

This is the bridge between the raw-game-export parser and the React frontend.
It is idempotent and re-runnable: every run fully rewrites the generated files.

Generated data is emitted as **JSON** (the frontend consumes JSON). The only
hand-authored source is ``tools/data_src/types.yaml`` (icon/canComplete config),
which is compiled to ``data/types.json``.

Output layout (in the sibling ``data/`` repo)::

    data/
      maps.json                      # {maps: [GameMapMeta]}
      types.json                     # {categories: [...]}   (compiled from data_src/types.yaml)
      regions/<map>.json             # {regions: [RegionInstance]}
      markers/<map>.json             # {markers: [MarkerInstance]}
      locales/<lng>/maps.json
      locales/<lng>/types.json       # (subtype names, built here)
      locales/<lng>/markers/<map>.json
      locales/<lng>/regions/<map>.json

Coverage (from the current parse):
  - fragments         <- Fragments (god-fragment locations)
  - village           <- Subzones with IconType == EIconType::Village
  - battlefield       <- Subzones with IconType == EIconType::Battlefield
  - teleport          <- WorldMarkers (EnvObj Usage TeleportArtifact spawns)
  - seal              <- WorldMarkers (EnterDungeon EnvObj for Seal dungeons)
  - occupation        <- WorldMarkers (garrison EnterInstanceLayer EnvObj spawns, 驻地)
  - hiddenCube        <- WorldMarkers (HiddenCube EnvObj spawns, bIsKeyOnly=False, yellow only)
  - gathering<Mat>    <- WorldMarkers (GatherSource EnvObj spawns, one per node
                         position, subtyped by specific material, SourceType fallback)
  - boss              <- WorldMarkers (spawns referencing a bNamed NPC; named from
                         NpcData.Desc)
  - dungeon           <- WorldMarkers (PartyDungeon + AbyssArtifact field-dungeon
                         entrances spawned on the world map; Seal/Quest/housing excluded)

LOD tiers (per-marker ``tier`` = zoom level at which it first appears; replaces
the old ``rank``):
  - tier 1: subzone village/battlefield whose WorldMapInfoType rank == 1
  - tier 2: teleport, seal, occupation, dungeon, boss
  - tier 3: subzone village/battlefield whose rank == 2; fragments; hiddenCube; gathering
  Markers with no determinable tier omit ``tier`` (never shown under LOD).

Regions: real subzone polygons. The parser (``extract.py``) reads each
subzone's boundary vertices from ``MapData.json`` ``SubzoneVolumeInfoMap`` and
transforms them world->pixel via the SAME ``WorldMapTransform`` as the marker
``px``, emitting them as ``pxBorders``. ``build_regions`` turns those into
``RegionInstance.borders`` so region outlines align with the markers.

Usage::

    uv run python -m aion2.tools.maps.emit_frontend
    uv run python -m aion2.tools.maps.emit_frontend --map World_L_A
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import yaml
from opencc import OpenCC

from . import TOOLS_ROOT
from .l10n import L10N
from .extract import map_title

# --- Paths ----------------------------------------------------------------
PARSED_MAPS_DIR = TOOLS_ROOT / "parsed_data" / "maps"
DATA_REPO = TOOLS_ROOT.parent / "data"
# types is hand-authored config (icons/canComplete). Humans edit this YAML; we
# compile it to data/types.json so the frontend gets JSON.
TYPES_SRC = TOOLS_ROOT / "data_src" / "types.yaml"
# Curated subtype/category display names (carried + adjusted into types.json
# locales). Still YAML sources; we emit JSON.
CURATED_LOCALES = TOOLS_ROOT.parent / "frontend" / "public" / "locales"

LANGS = ("en", "zh-CN", "zh-TW")

# Subtype display names injected into the types locale. ``hiddenCube`` is the
# single yellow (openable) cube — NO faction / key suffix. {subtype: {en, zhCN,
# zhTW}}; zh-TW falls back to OpenCC if not given.
EXTRA_SUBTYPE_NAMES = {
    "hiddenCube": {"en": "Hidden Cube", "zhCN": "隐藏宝箱", "zhTW": "隱藏寶箱"},
    # fragments keeps the legacy monolithMaterial display names (re-keyed).
    "fragments": {"en": "Monolith", "zhCN": "主神痕迹", "zhTW": "主神痕跡"},
    "dungeon": {"en": "Dungeon", "zhCN": "副本", "zhTW": "副本"},
    "boss": {"en": "Boss", "zhCN": "Boss", "zhTW": "Boss"},
    # 驻地 / garrison occupation objectives.
    "occupation": {"en": "Garrison", "zhCN": "驻地", "zhTW": "駐地"},
}

# Visible-map ordering / type, keyed by parsed map Name. Maps not present in
# the parse are still listed (isVisible may stay true) but will have empty
# marker/region files.
MAP_META = {
    "World_L_A": {"type": "light", "order": 0, "isVisible": True},
    "World_D_A": {"type": "dark", "order": 1, "isVisible": True},
    "World_L_B": {"type": "light", "order": 2, "isVisible": True},
    "World_D_B": {"type": "dark", "order": 3, "isVisible": True},
    "World_L_Starter": {"type": "light", "order": 4, "isVisible": True},
    "World_D_Starter": {"type": "dark", "order": 5, "isVisible": True},
    "Abyss_Reshanta_A": {"type": "abyss", "order": 6, "isVisible": True},
    "Abyss_Reshanta_B": {"type": "abyss", "order": 7, "isVisible": False},
    "Abyss_Reshanta_C": {"type": "abyss", "order": 8, "isVisible": True},
}

ICON_TYPE_TO_SUBTYPE = {
    "EIconType::Village": ("location", "village"),
    "EIconType::Battlefield": ("location", "battlefield"),
}

# WorldMarkers.kind -> types.yaml category for the subtype of the same name.
# ``gathering`` is split per SourceType into ``gathering<Type>`` subtypes (the
# category is always ``gathering``), handled separately in build_markers.
WORLD_MARKER_CATEGORY = {
    "teleport": "location",
    "seal": "location",
    "occupation": "location",
    "hiddenCube": "collection",
    "dungeon": "location",
    "boss": "location",
}

# 3-tier LOD model: tier = the zoom level at which a marker first appears.
#   tier 1: subzone village/battlefield with WorldMapInfoType rank == 1
#   tier 2: teleport, seal, dungeon, boss (campsite too, if parsed)
#   tier 3: subzone village/battlefield rank == 2; fragments; hiddenCube; gathering
# Subzone village/battlefield tier comes from IconRank (1->1, 2->3); other kinds
# get a fixed tier here. Markers with no tier omit the field.
WORLD_MARKER_TIER = {
    "teleport": 2,
    "seal": 2,
    "occupation": 2,
    "dungeon": 2,
    "boss": 2,
    "hiddenCube": 3,
    "gathering": 3,
}
FRAGMENTS_TIER = 3
# Subzone IconRank (1/2) -> LOD tier (1/3).
SUBZONE_RANK_TO_TIER = {1: 1, 2: 3}

# Specific GatherSource MATERIAL (EnvObj Desc, english) -> legacy gathering
# subtype key. These 13 materials are the Elyos/World_L_A set and reuse the
# legacy curated subtype names + per-item icons (in data_src/types.yaml). The
# precise material is read from the EnvObj Desc by the parser (WorldMarkers
# ``material``); markers of these materials get the specific subtype below.
GATHER_MATERIAL_SUBTYPES = {
    "Odyle":      "gatheringOdyle",
    "Orichalcum": "gatheringOrichalcumOre",
    "Yggdrasil":  "gatheringYggdrasilLog",
    "Sapphire":   "gatheringSapphireGemstone",
    "Diamond":    "gatheringDiamondGemstone",
    "Ruby":       "gatheringRubyGemstone",
    "Aria":       "gatheringAria",
    "Targena":    "gatheringTargena",
    "Coriolus":   "gatheringCoriolus",
    "Kukuru":     "gatheringKukuru",
    "Mela":       "gatheringMela",
    "Inina":      "gatheringInina",
    "Cypri":      "gatheringCypri",
}

# Fallback: GatherSource SourceType (short) -> broad gathering subtype, used for
# materials with no legacy match (e.g. the Asmodian Asvata/Azpha/... set on
# World_D_A). Generic UT_Marker_Gather icons keyed by SourceType.
GATHER_SOURCETYPE_SUBTYPES = {
    "Od":         "gatheringOd",
    "Herb":       "gatheringHerb",
    "Jewelry":    "gatheringJewelry",
    "Metal":      "gatheringMetal",
    "RareMetal":  "gatheringRareMetal",
    "Tree":       "gatheringTree",
    "Flower":     "gatheringFlower",
    "Berry":      "gatheringBerry",
    "Vegetable":  "gatheringVegetable",
    "Shellfish":  "gatheringShellfish",
}

# Display names for ALL gathering subtypes (specific materials + SourceType
# fallbacks), injected into the types locales. zh from the game L10N of each
# material; zh-TW falls back to OpenCC from zhCN when absent.
GATHER_SUBTYPE_NAMES = {
    # specific materials (Elyos set)
    "gatheringOdyle":            {"en": "Odyle",      "zhCN": "奥德"},
    "gatheringOrichalcumOre":    {"en": "Orichalcum", "zhCN": "奥里哈康"},
    "gatheringYggdrasilLog":     {"en": "Yggdrasil",  "zhCN": "世界树"},
    "gatheringSapphireGemstone": {"en": "Sapphire",   "zhCN": "蓝宝石"},
    "gatheringDiamondGemstone":  {"en": "Diamond",    "zhCN": "钻石"},
    "gatheringRubyGemstone":     {"en": "Ruby",       "zhCN": "红宝石"},
    "gatheringAria":             {"en": "Aria",       "zhCN": "当归"},
    "gatheringTargena":          {"en": "Targena",    "zhCN": "龙蒿"},
    "gatheringCoriolus":         {"en": "Coriolus",   "zhCN": "云芝"},
    "gatheringKukuru":           {"en": "Kukuru",     "zhCN": "库库罗"},
    "gatheringMela":             {"en": "Mela",       "zhCN": "梅拉"},
    "gatheringInina":            {"en": "Inina",      "zhCN": "雪莉"},
    "gatheringCypri":            {"en": "Cypri",      "zhCN": "齐尔利"},
    # SourceType fallbacks
    "gatheringOd":        {"en": "Odyle",      "zhCN": "奥德", "zhTW": "奧德"},
    "gatheringHerb":      {"en": "Herb",       "zhCN": "草药", "zhTW": "草藥"},
    "gatheringJewelry":   {"en": "Gemstone",   "zhCN": "宝石", "zhTW": "寶石"},
    "gatheringMetal":     {"en": "Metal",      "zhCN": "金属", "zhTW": "金屬"},
    "gatheringRareMetal": {"en": "Rare Metal", "zhCN": "稀有金属", "zhTW": "稀有金屬"},
    "gatheringTree":      {"en": "Wood",       "zhCN": "木材", "zhTW": "木材"},
    "gatheringFlower":    {"en": "Flower",     "zhCN": "花卉", "zhTW": "花卉"},
    "gatheringBerry":     {"en": "Berry",      "zhCN": "浆果", "zhTW": "漿果"},
    "gatheringVegetable": {"en": "Vegetable",  "zhCN": "蔬菜", "zhTW": "蔬菜"},
    "gatheringShellfish": {"en": "Shellfish",  "zhCN": "贝类", "zhTW": "貝類"},
}

_cc_s2t = OpenCC("s2t")


def _to_tw(zh_cn: str) -> str:
    return _cc_s2t.convert(zh_cn) if zh_cn else ""


def _slug(name: str) -> str:
    """Stable region key from a subzone Name, e.g. ``DawnLegionBase_Subzone``
    -> ``DawnLegionBase`` (matches the curated region-key convention)."""
    s = re.sub(r"_Subzone$", "", name or "")
    s = re.sub(r"[^A-Za-z0-9]+", "", s)
    return s or (name or "unknown")


# --- Loaders --------------------------------------------------------------
def load_parsed() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for p in sorted(PARSED_MAPS_DIR.glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        out[d["Name"]] = d
    return out


def _round2(v: float) -> float:
    return round(float(v), 2)


# Faction suffix appended to the L10N base title, keyed by faction. Derived from
# the machine name; Abyss/Reshanta maps (no _L_/_D_) get no suffix. zh-TW is
# produced later by the existing _to_tw() pass over the zh-CN string.
_FACTION_SUFFIX = {
    "light": {"en": " (Elyos)", "zh-CN": "（天）"},
    "dark": {"en": " (Asmodian)", "zh-CN": "（魔）"},
}


def _faction(name: str) -> str | None:
    """Faction from the machine name: ``_L_`` -> light, ``_D_`` -> dark, else None."""
    if "_L_" in name:
        return "light"
    if "_D_" in name:
        return "dark"
    return None


def _map_display(name: str, l10n: L10N) -> dict[str, str]:
    """Composed map display names: L10N base title + faction suffix.

    Returns ``{"name_en", "name_zhCN"}`` (the shape ``_locale_block`` expects).
    Base falls back to ``name.replace("_", " ")`` when L10N has no body; zh base
    falls back to the en base when there is no zh body.
    """
    title = map_title(name, l10n)
    base_en = title["en"] or name.replace("_", " ")
    base_zh = title["zhCN"] or base_en
    fac = _faction(name)
    if fac:
        base_en += _FACTION_SUFFIX[fac]["en"]
        base_zh += _FACTION_SUFFIX[fac]["zh-CN"]
    return {"name_en": base_en, "name_zhCN": base_zh}


# --- Builders -------------------------------------------------------------
def build_maps_yaml(parsed: dict[str, dict]) -> dict:
    """maps.yaml — visible maps with GameMapMeta. Tile grid derived from the
    parsed worldmap metadata (px = SectorSize * SectorPlaneSize / tileSize)."""
    from .worldmap import WorldMapMeta
    from . import worldmap_path

    maps = []
    for name, meta in sorted(MAP_META.items(), key=lambda kv: kv[1]["order"]):
        tile = 1024
        tiles_x = tiles_y = None
        wm_path = worldmap_path(name)
        if wm_path.exists():
            wm = WorldMapMeta.from_json(wm_path, name)
            tile = int(wm.sector_plane_size)
            tiles_x = wm.sector_count_x
            tiles_y = wm.sector_count_y
        # MapId from parse when available (else keep a deterministic id).
        map_id = str(parsed.get(name, {}).get("MapId", name))
        entry = {
            "id": map_id,
            "name": name,
            "type": meta["type"],
            "order": meta["order"],
            "isVisible": meta["isVisible"],
            "tileWidth": tile,
            "tileHeight": tile,
        }
        if tiles_x is not None:
            entry["tilesCountX"] = tiles_x
            entry["tilesCountY"] = tiles_y
        maps.append(entry)
    return {"maps": maps}


def build_markers(map_data: dict) -> tuple[list[dict], dict[str, dict]]:
    """Return (markers, locale_entries) for one map.

    locale_entries: {marker_id: {name, description}}.
    """
    markers: list[dict] = []
    locale: dict[str, dict] = {}
    counters: dict[str, int] = {}

    def next_index(subtype: str) -> int:
        i = counters.get(subtype, 0)
        counters[subtype] = i + 1
        return i

    name = map_data["Name"]

    # --- fragments (was monolithMaterial) from Fragments -------------------
    groups = {g["GroupName"]: g for g in map_data.get("MonolithGroups", [])}
    for f in map_data.get("Fragments", []):
        px = f.get("px")
        if not px:
            continue
        subtype = "fragments"
        idx = next_index(subtype)
        # NOTE: Fragment EnvObjId is NOT unique in the export (often repeated),
        # so we key by subtype + running index, which is unique by construction.
        mid = f"{name}-fragments-{idx}"
        grp = groups.get(f.get("GroupName"), {})
        region_key = _slug(grp.get("SubzoneName", ""))
        markers.append({
            "id": mid,
            "category": "collection",
            "subtype": subtype,
            "region": region_key,
            "x": _round2(px[0]),
            "y": _round2(px[1]),
            "tier": FRAGMENTS_TIER,
            "images": [],
            "contributors": [],
            "indexInSubtype": idx,
        })
        locale[mid] = {
            "name_en": grp.get("title_en", "") or str(idx + 1),
            "name_zhCN": grp.get("title_zhCN", "") or str(idx + 1),
        }

    # --- village / battlefield from Subzone IconType -----------------------
    for s in map_data.get("Subzones", []):
        icon_type = s.get("IconType")
        mapping = ICON_TYPE_TO_SUBTYPE.get(icon_type)
        if not mapping:
            continue
        px = s.get("px")
        if not px:
            continue
        category, subtype = mapping
        idx = next_index(subtype)
        mid = f"{name}-{subtype}-{s['ID']}"
        marker = {
            "id": mid,
            "category": category,
            "subtype": subtype,
            "region": _slug(s.get("Name", "")),
            "x": _round2(px[0]),
            "y": _round2(px[1]),
            "images": [],
            "contributors": [],
            "indexInSubtype": idx,
        }
        # tier from the subzone's WorldMapUIRegion rank (1 -> tier 1, 2 -> tier
        # 3); OMIT when the subzone has no rank — never shown under LOD.
        tier = SUBZONE_RANK_TO_TIER.get(s.get("IconRank"))
        if tier is not None:
            marker["tier"] = tier
        markers.append(marker)
        locale[mid] = {
            "name_en": s.get("name_en", "") or s.get("Name", ""),
            "name_zhCN": s.get("name_zhCN", "") or s.get("Name", ""),
        }

    # --- world markers: teleport / seal / hiddenCube / gathering / dungeon /
    #     boss (from SpawnInfoList / instance gates / named spawns),
    #     transformed with the SAME px convention -----------------------------
    for w in map_data.get("WorldMarkers", []):
        px = w.get("px")
        if not px:
            continue
        kind = w.get("kind")
        if kind == "gathering":
            # subtype by SPECIFIC material when it maps to a legacy subtype,
            # else fall back to the broad SourceType subtype. category is always
            # 'gathering'.
            subtype = GATHER_MATERIAL_SUBTYPES.get(w.get("material"))
            if not subtype:
                subtype = GATHER_SOURCETYPE_SUBTYPES.get(w.get("sourceType"))
            if not subtype:
                continue
            category = "gathering"
        else:
            subtype = kind
            category = WORLD_MARKER_CATEGORY.get(subtype)
        if not category:
            continue
        idx = next_index(subtype)
        mid = f"{name}-{subtype}-{idx}"
        marker = {
            "id": mid,
            "category": category,
            "subtype": subtype,
            "x": _round2(px[0]),
            "y": _round2(px[1]),
            "images": [],
            "contributors": [],
            "indexInSubtype": idx,
        }
        tier = WORLD_MARKER_TIER.get(kind)
        if tier is not None:
            marker["tier"] = tier
        markers.append(marker)
        locale[mid] = {
            "name_en": w.get("name_en", "") or str(idx + 1),
            "name_zhCN": w.get("name_zhCN", "") or str(idx + 1),
        }

    markers.sort(key=lambda m: (m["subtype"], m["indexInSubtype"]))
    return markers, locale


def build_regions(map_data: dict) -> tuple[list[dict], dict[str, dict]]:
    """Emit one region per subzone *name*, with the REAL polygon boundary.

    Borders come from the parser's ``pxBorders`` (subzone polygon vertices from
    ``MapData.json`` ``SubzoneVolumeInfoMap``, transformed world->pixel with the
    SAME ``WorldMapTransform`` used for marker ``px``), so region outlines align
    with the village/battlefield/monolith markers. Subzones sharing a slug (e.g.
    several volumes for one named area) are merged into a multi-ring region so
    the region->marker linkage by slug is preserved.

    ``borders`` is ``number[][][]`` = list of rings, each ring a list of
    ``[x, y]`` pixel points (matches ``RegionInstance`` / ``GameMapBorders``).
    """
    regions: list[dict] = []
    locale: dict[str, dict] = {}
    by_key: dict[str, dict] = {}
    for s in map_data.get("Subzones", []):
        if not s.get("bMapEnabled", True):
            continue
        ring = s.get("pxBorders")
        if not ring or len(ring) < 3:
            continue
        # Close the ring so the de-duped border polylines join cleanly.
        ring = [[_round2(x), _round2(y)] for x, y in ring]
        if ring[0] != ring[-1]:
            ring = ring + [ring[0]]
        key = _slug(s.get("Name", ""))
        sub_type = (s.get("SubzoneType") or "").split("::")[-1].lower() or "subzone"
        if key not in by_key:
            by_key[key] = {
                "id": str(s["ID"]),
                "name": key,
                "type": sub_type,
                "borders": [ring],
            }
            locale[key] = {
                "name_en": s.get("name_en", "") or key,
                "name_zhCN": s.get("name_zhCN", "") or key,
            }
        else:
            by_key[key]["borders"].append(ring)
    regions = sorted(by_key.values(), key=lambda r: r["name"])
    return regions, locale


# --- JSON writing ---------------------------------------------------------
def _write_json(path: Path, data) -> None:
    """Write compact JSON (CJK stays readable thanks to ensure_ascii=False)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def _locale_block(entries: dict[str, dict], lang: str) -> dict:
    """{key: {name_en, name_zhCN}} -> {key: {name, description}} for a lang."""
    out = {}
    for key, v in entries.items():
        if lang == "en":
            name = v.get("name_en", "")
        elif lang == "zh-CN":
            name = v.get("name_zhCN", "")
        else:  # zh-TW
            name = _to_tw(v.get("name_zhCN", ""))
        name = name or key
        out[key] = {"name": name, "description": name}
    return out


def _types_locale(lang: str) -> dict:
    """Build the types-locale (category + subtype display names) for ``lang``.

    Carries the curated ``public/locales/<lang>/types.yaml`` and injects the
    single yellow ``hiddenCube`` name (NO faction / key suffix) from
    ``EXTRA_SUBTYPE_NAMES``, dropping any legacy hiddenCube* variants.
    """
    src = CURATED_LOCALES / lang / "types.yaml"
    data = yaml.safe_load(src.read_text(encoding="utf-8")) if src.exists() else {}
    data = data or {}
    subtypes = dict(data.get("subtypes", {}))
    # Drop legacy keys that this pipeline replaces: hiddenCube* variants,
    # monolithMaterial (-> fragments), and the legacy per-material gathering*
    # names (-> per-SourceType gathering* keys defined below).
    for legacy in ("hiddenCube", "hiddenCubeKeyOnly", "hiddenCubeLight",
                   "hiddenCubeDark", "monolithMaterial"):
        subtypes.pop(legacy, None)
    for legacy in [k for k in subtypes if k.startswith("gathering")]:
        subtypes.pop(legacy, None)

    def _pick(names: dict) -> str:
        if lang == "en":
            return names["en"]
        if lang == "zh-CN":
            return names["zhCN"]
        return names.get("zhTW") or _to_tw(names["zhCN"])

    for sub, names in EXTRA_SUBTYPE_NAMES.items():
        name = _pick(names)
        subtypes[sub] = {"name": name, "description": name}
    for sub, names in GATHER_SUBTYPE_NAMES.items():
        name = _pick(names)
        subtypes[sub] = {"name": name, "description": name}
    data["subtypes"] = subtypes
    return data


def emit(only_map: str | None = None) -> None:
    parsed = load_parsed()
    if not parsed:
        raise SystemExit(f"No parsed maps found in {PARSED_MAPS_DIR}")

    DATA_REPO.mkdir(parents=True, exist_ok=True)

    # 1. maps.json
    _write_json(DATA_REPO / "maps.json", build_maps_yaml(parsed))

    # 2. types.json — compiled from the hand-authored data_src/types.yaml.
    if TYPES_SRC.exists():
        _write_json(DATA_REPO / "types.json", yaml.safe_load(TYPES_SRC.read_text(encoding="utf-8")))
    else:
        print(f"WARN: types source not found at {TYPES_SRC}")

    # 3. types locales — built from curated names + hiddenCube split.
    for lng in LANGS:
        _write_json(DATA_REPO / "locales" / lng / "types.json", _types_locale(lng))

    # 4. maps locales — localized titles from game L10N + faction suffix.
    l10n = L10N()
    maps_locale_entries = {name: _map_display(name, l10n) for name in MAP_META}
    for lng in LANGS:
        _write_json(
            DATA_REPO / "locales" / lng / "maps.json",
            _locale_block(maps_locale_entries, lng),
        )

    # 5. per-map markers + regions + their locales
    targets = [only_map] if only_map else list(parsed.keys())
    summary = {}
    for name in targets:
        md = parsed.get(name)
        if not md:
            print(f"WARN: no parsed data for {name}, skipping")
            continue
        markers, m_loc = build_markers(md)
        regions, r_loc = build_regions(md)

        # Marker ids must be globally unique per map (the frontend search index
        # rejects duplicate ids and would crash the app).
        ids = [m["id"] for m in markers]
        if len(ids) != len(set(ids)):
            dupes = {i for i in ids if ids.count(i) > 1}
            raise SystemExit(f"{name}: duplicate marker ids: {sorted(dupes)[:5]}")

        _write_json(DATA_REPO / "markers" / f"{name}.json", {"markers": markers})
        _write_json(DATA_REPO / "regions" / f"{name}.json", {"regions": regions})
        for lng in LANGS:
            _write_json(
                DATA_REPO / "locales" / lng / "markers" / f"{name}.json",
                _locale_block(m_loc, lng),
            )
            _write_json(
                DATA_REPO / "locales" / lng / "regions" / f"{name}.json",
                _locale_block(r_loc, lng),
            )
        by_sub: dict[str, int] = {}
        for m in markers:
            by_sub[m["subtype"]] = by_sub.get(m["subtype"], 0) + 1
        summary[name] = {"markers": len(markers), "regions": len(regions), "by_subtype": by_sub}

    # Maps present in MAP_META but not in the parse get empty files so the
    # frontend never 404s.
    for name, meta in MAP_META.items():
        if name in parsed:
            continue
        if not (DATA_REPO / "markers" / f"{name}.json").exists():
            _write_json(DATA_REPO / "markers" / f"{name}.json", {"markers": []})
        if not (DATA_REPO / "regions" / f"{name}.json").exists():
            _write_json(DATA_REPO / "regions" / f"{name}.json", {"regions": []})
        for lng in LANGS:
            mp = DATA_REPO / "locales" / lng / "markers" / f"{name}.json"
            rp = DATA_REPO / "locales" / lng / "regions" / f"{name}.json"
            if not mp.exists():
                _write_json(mp, {})
            if not rp.exists():
                _write_json(rp, {})

    print("Emitted FRONTEND data to", DATA_REPO)
    for name, s in summary.items():
        print(f"  {name}: {s['markers']} markers {s['by_subtype']}, {s['regions']} regions")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--map", dest="map", default=None, help="emit a single map, e.g. World_L_A")
    args = ap.parse_args()
    emit(args.map)


if __name__ == "__main__":
    main()
