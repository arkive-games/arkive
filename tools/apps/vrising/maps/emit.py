"""Emit stage: the contract-v1 dataset for ``data-vrising``.

Layout validated by ``pnpm validate-data``:
    maps.json, types.json, markers/<Map>.json, regions/<Map>.json,
    locales/<lng>/{maps.json, types.json, markers/<Map>.json, regions/<Map>.json}

Two conventions inherited from the contract, both deliberate:
  * MARKERS carry RAW WORLD coordinates. ``maps.json`` supplies
    ``worldBounds`` + ``orientation``, and the engine derives pixels with
    ``worldToPixel``. Do not pre-project markers.
  * REGIONS carry PIXEL polygons (Task 9 already applied the transform).
"""

from __future__ import annotations

from pathlib import Path

import yaml

from ..common import write_json
from .calibration import (
    CALIBRATION_METHOD,
    MAP_ID,
    MAP_PX,
    ORIENTATION,
    world_bounds_json,
)
from .extract import read_parsed
from .tiles import COUNT, TILE
from ..markers.emit import load_marker_payload
from ..knowledge.rewards import load_vblood_reward_payload

_HERE = Path(__file__).resolve().parent
_TYPES_YAML = _HERE.parent / "data_src" / "types.yaml"
# The only two states a shipped calibration may be in (see Task 8, Step 9).
_VALID_CALIBRATION = {"fitted", "by-eye"}


def _stamp_lod_tiers(markers: list[dict], src: dict) -> None:
    """Give every marker an LOD ``tier``, in place.

    The frontend can cull markers by zoom, but both engines treat a marker with no
    ``tier`` as hidden while culling is on, and only tier 1 is drawn at the opening
    zoom. Emitting no tiers therefore meant the phone map drew nothing at all once
    the frontend enabled culling.

    Two rules, matching Palworld so the platform behaves the same way everywhere:
    a subtype the taxonomy flags ``defaultActive`` is always tier 1 -- it was
    curated to be visible in the overview, and density is the wrong signal for it
    -- and everything else steps back by how crowded it is.
    """
    default_active = {
        s["id"]
        for c in src["categories"]
        for s in c["subtypes"]
        if s.get("defaultActive")
    }
    counts: dict[str, int] = {}
    for marker in markers:
        counts[marker["subtype"]] = counts.get(marker["subtype"], 0) + 1

    for marker in markers:
        subtype = marker["subtype"]
        if subtype in default_active:
            marker["tier"] = 1
        elif counts[subtype] <= 50:
            marker["tier"] = 1
        elif counts[subtype] <= 250:
            marker["tier"] = 2
        else:
            marker["tier"] = 3


def build_dataset(
    parsed: dict, regions: list[dict], marker_payload: dict | None = None
) -> dict:
    if CALIBRATION_METHOD not in _VALID_CALIBRATION:
        raise RuntimeError(
            f"CALIBRATION_METHOD is {CALIBRATION_METHOD!r}; it must be one of "
            f"{sorted(_VALID_CALIBRATION)}. Run `python -m vrising.maps calibrate` and "
            "record an accepted (or explicitly by-eye) result in calibration.py."
        )

    src = yaml.safe_load(_TYPES_YAML.read_text(encoding="utf-8"))
    languages: list[str] = src["languages"]
    map_src = src["map"]

    if parsed["mapSize"] != [MAP_PX, MAP_PX]:
        raise RuntimeError(
            f"map image is {parsed['mapSize']} but calibration.py pins MAP_PX={MAP_PX}; "
            "re-run calibrate against the current image"
        )

    maps = [{
        "id": MAP_ID,
        "name": MAP_ID,
        "type": map_src["type"],
        "tileWidth": TILE,
        "tileHeight": TILE,
        "tilesCountX": COUNT,
        "tilesCountY": COUNT,
        "isVisible": True,
        "worldBounds": world_bounds_json(),
        "orientation": ORIENTATION.as_json(),
    }]

    # `name` is REQUIRED by the contract on both categories and subtypes even
    # though the displayed text comes from locales/<lng>/types.json. palworld and
    # sts2 both satisfy it by echoing the id, so do the same rather than
    # duplicating English into the language-neutral file.
    category_fields = ("pinVariant", "icon", "color")
    subtype_fields = (
        "icon",
        "iconScale",
        "pinVariant",
        "color",
        "defaultActive",
        "canComplete",
    )
    types = {
        "categories": [{
            "id": c["id"],
            "name": c["id"],
            **{field: c[field] for field in category_fields if field in c},
            "subtypes": [{
                "id": s["id"],
                "name": s["id"],
                **{field: s[field] for field in subtype_fields if field in s},
            } for s in c["subtypes"]],
        } for c in src["categories"]],
    }

    marker_payload = marker_payload or {
        "markers": [],
        "labels": {},
        "officialTexts": {},
    }
    markers = list(marker_payload["markers"])
    marker_labels = marker_payload["labels"]
    official_texts = marker_payload.get("officialTexts", {})

    _stamp_lod_tiers(markers, src)

    locales: dict[str, dict] = {}
    for lng in languages:
        locales[lng] = {
            "maps": {MAP_ID: {
                "name": map_src["names"][lng],
                "description": "",
                "shortName": map_src["names"][lng],
            }},
            "types": {
                "categories": {c["id"]: {"name": c["names"][lng]} for c in src["categories"]},
                "subtypes": {
                    s["id"]: {
                        "name": (
                            official_texts[s["localizationGuid"]][lng]
                            if "localizationGuid" in s
                            else s["names"][lng]
                        ),
                    }
                    for c in src["categories"] for s in c["subtypes"]
                },
            },
            "markers": {MAP_ID: {}},
            "regions": {MAP_ID: {}},
        }
        for mid, source in marker_labels.items():
            localized_names = source["localizedNames"]
            localized_descriptions = source.get("localizedDescriptions", {})
            locales[lng]["markers"][MAP_ID][mid] = {
                "name": localized_names[lng],
                **(
                    {"description": localized_descriptions[lng]}
                    if localized_descriptions.get(lng)
                    else {}
                ),
            }

    return {
        "maps": maps,
        "types": types,
        "markers": {MAP_ID: markers},
        "regions": {MAP_ID: regions},
        "locales": locales,
    }


def run_emit(parsed_dir: Path, data_out: Path, localization_dir: Path) -> None:
    parsed_dir, data_out = Path(parsed_dir), Path(data_out)
    parsed = read_parsed(parsed_dir)
    regions_path = parsed_dir / "regions.json"
    if not regions_path.is_file():
        raise RuntimeError(
            f"{regions_path} is missing — run `python -m vrising.maps regions` first"
        )
    import json
    regions = json.loads(regions_path.read_text(encoding="utf-8"))["regions"]

    marker_payload = load_marker_payload(parsed_dir / "markers", localization_dir)
    reward_payload = load_vblood_reward_payload(
        parsed_dir / "knowledge" / "vblood-rewards.json"
    )
    ds = build_dataset(parsed, regions, marker_payload)

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
    w("knowledge/vblood-rewards.json", reward_payload)

    for mid, lst in ds["markers"].items():
        print(f"emit: {mid} {len(lst)} markers, {len(ds['regions'][mid])} regions")
    print(f"emit: locales {', '.join(sorted(ds['locales']))} (calibration: {CALIBRATION_METHOD})")
