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
  - monolithMaterial  <- Fragments (god-fragment locations)
  - village           <- Subzones with IconType == EIconType::Village
  - battlefield       <- Subzones with IconType == EIconType::Battlefield
  - teleport          <- WorldMarkers (EnvObj Usage TeleportArtifact spawns)
  - seal              <- WorldMarkers (EnterDungeon EnvObj for Seal dungeons)
  - hiddenCubeLight   <- WorldMarkers (EnvObj Category HiddenCubeLight spawns)
  - hiddenCubeDark    <- WorldMarkers (EnvObj Category HiddenCubeDark spawns)

Categories NOT derivable from the current parse (omitted, see report):
  occupation — GarrisonTerritory subzones exist but the legacy curated names
  (Maktashan Outpost, Sehna Outpost, ...) do not join cleanly to the raw
  Subzone DisplayName keys, and those subzones already partly surface as
  village/battlefield; a definitive occupation-objective table is still needed.

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

# Subtype display names that the curated types locale does not yet carry
# (e.g. the split hiddenCube). {subtype: {en, zhCN}}; zh-TW derived via OpenCC.
EXTRA_SUBTYPE_NAMES = {
    "hiddenCubeLight": {"en": "Hidden Cube (Elyos)", "zhCN": "隐藏背包（天族）"},
    "hiddenCubeDark": {"en": "Hidden Cube (Asmodian)", "zhCN": "隐藏背包（魔族）"},
}

# Visible-map ordering / type, keyed by parsed map Name. Maps not present in
# the parse are still listed (isVisible may stay true) but will have empty
# marker/region files.
MAP_META = {
    "World_L_A": {"type": "light", "order": 0, "isVisible": True},
    "World_D_A": {"type": "dark", "order": 1, "isVisible": True},
    "World_L_B": {"type": "light", "order": 2, "isVisible": False},
    "World_D_B": {"type": "dark", "order": 3, "isVisible": False},
    "World_L_Starter": {"type": "light", "order": 4, "isVisible": True},
    "World_D_Starter": {"type": "dark", "order": 5, "isVisible": True},
    "Abyss_Reshanta_A": {"type": "abyss", "order": 6, "isVisible": True},
    "Abyss_Reshanta_B": {"type": "abyss", "order": 7, "isVisible": True},
    "Abyss_Reshanta_C": {"type": "abyss", "order": 8, "isVisible": True},
}

ICON_TYPE_TO_SUBTYPE = {
    "EIconType::Village": ("location", "village"),
    "EIconType::Battlefield": ("location", "battlefield"),
}

# WorldMarkers.kind -> types.yaml category for the subtype of the same name.
WORLD_MARKER_CATEGORY = {
    "teleport": "location",
    "seal": "location",
    "hiddenCubeLight": "collection",
    "hiddenCubeDark": "collection",
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

    # --- monolithMaterial from Fragments -----------------------------------
    groups = {g["GroupName"]: g for g in map_data.get("MonolithGroups", [])}
    for f in map_data.get("Fragments", []):
        px = f.get("px")
        if not px:
            continue
        subtype = "monolithMaterial"
        idx = next_index(subtype)
        # NOTE: Fragment EnvObjId is NOT unique in the export (often repeated),
        # so we key by subtype + running index, which is unique by construction.
        mid = f"{name}-monolithMaterial-{idx}"
        grp = groups.get(f.get("GroupName"), {})
        region_key = _slug(grp.get("SubzoneName", ""))
        markers.append({
            "id": mid,
            "category": "collection",
            "subtype": subtype,
            "region": region_key,
            "x": _round2(px[0]),
            "y": _round2(px[1]),
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
        markers.append({
            "id": mid,
            "category": category,
            "subtype": subtype,
            "region": _slug(s.get("Name", "")),
            "x": _round2(px[0]),
            "y": _round2(px[1]),
            "images": [],
            "contributors": [],
            "indexInSubtype": idx,
        })
        locale[mid] = {
            "name_en": s.get("name_en", "") or s.get("Name", ""),
            "name_zhCN": s.get("name_zhCN", "") or s.get("Name", ""),
        }

    # --- world markers: teleport / seal / hiddenCube (from SpawnInfoList /
    #     instance gates), transformed with the SAME px convention -----------
    for w in map_data.get("WorldMarkers", []):
        px = w.get("px")
        if not px:
            continue
        subtype = w.get("kind")
        category = WORLD_MARKER_CATEGORY.get(subtype)
        if not category:
            continue
        idx = next_index(subtype)
        mid = f"{name}-{subtype}-{idx}"
        markers.append({
            "id": mid,
            "category": category,
            "subtype": subtype,
            "x": _round2(px[0]),
            "y": _round2(px[1]),
            "images": [],
            "contributors": [],
            "indexInSubtype": idx,
        })
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

    Carries the curated ``public/locales/<lang>/types.yaml`` and adjusts it for
    the hiddenCube split: removes the old ``hiddenCube`` subtype and injects
    ``hiddenCubeLight`` / ``hiddenCubeDark`` from ``EXTRA_SUBTYPE_NAMES``.
    """
    src = CURATED_LOCALES / lang / "types.yaml"
    data = yaml.safe_load(src.read_text(encoding="utf-8")) if src.exists() else {}
    data = data or {}
    subtypes = dict(data.get("subtypes", {}))
    subtypes.pop("hiddenCube", None)
    for sub, names in EXTRA_SUBTYPE_NAMES.items():
        if lang == "en":
            name = names["en"]
        elif lang == "zh-CN":
            name = names["zhCN"]
        else:  # zh-TW
            name = _to_tw(names["zhCN"])
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

    # 4. maps locales — built from parsed names (fallback to map name).
    maps_locale_entries = {}
    for name in MAP_META:
        md = parsed.get(name)
        if md and md.get("Subzones"):
            # map display name: prefer first subzone-group/region name? use Name.
            pass
        maps_locale_entries[name] = {
            "name_en": _map_display_en(name),
            "name_zhCN": _map_display_zh(name, parsed),
        }
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


# --- map display names (curated-aligned) ----------------------------------
_MAP_DISPLAY_EN = {
    "World_L_A": "Verteron (Elyos)",
    "World_D_A": "Altgard (Asmodian)",
    "World_L_B": "World L B",
    "World_D_B": "World D B",
    "World_L_Starter": "Starter (Elyos)",
    "World_D_Starter": "Starter (Asmodian)",
    "Abyss_Reshanta_A": "Reshanta A",
    "Abyss_Reshanta_B": "Reshanta B",
    "Abyss_Reshanta_C": "Reshanta C",
}


def _map_display_en(name: str) -> str:
    return _MAP_DISPLAY_EN.get(name, name.replace("_", " "))


def _map_display_zh(name: str, parsed: dict) -> str:
    # No reliable per-map zh title in the parse; carry the curated CN if any,
    # else romanized name. Frontend falls back gracefully.
    return _MAP_DISPLAY_EN.get(name, name.replace("_", " "))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--map", dest="map", default=None, help="emit a single map, e.g. World_L_A")
    args = ap.parse_args()
    emit(args.map)


if __name__ == "__main__":
    main()
