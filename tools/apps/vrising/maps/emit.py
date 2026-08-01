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

_HERE = Path(__file__).resolve().parent
_TYPES_YAML = _HERE.parent / "data_src" / "types.yaml"
# The only two states a shipped calibration may be in (see Task 8, Step 9).
_VALID_CALIBRATION = {"fitted", "by-eye"}


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

    # One marker per region, at the region's CenterPosWS. `region` points back at
    # the region polygon so the popup and the cursor readout can name it.
    counters: dict[str, int] = {}
    markers: list[dict] = []
    marker_labels: dict[str, str] = {}
    for e in parsed["entries"]:
        subtype = e["kind"]
        counters[subtype] = counters.get(subtype, 0) + 1
        a = e["accessId"]
        label = f"{'POI' if subtype == 'poi' else 'Territory'} {a[0]}-{a[1]}-{a[2]}"
        marker_labels[e["id"]] = label
        markers.append({
            "id": e["id"],
            "category": "regions",
            "subtype": subtype,
            "region": e["id"],
            # RAW WORLD coordinates — the engine projects these.
            "x": e["center"][0],
            "y": e["center"][1],
            "images": [],
            "contributors": [],
            "indexInSubtype": counters[subtype],
        })

    marker_payload = marker_payload or {
        "markers": [],
        "labels": {},
    }
    for marker in marker_payload["markers"]:
        marker_id = marker["id"]
        if marker_id in marker_labels:
            raise RuntimeError(f"marker id {marker_id} collides with a region marker")
        marker_labels[marker_id] = marker_payload["labels"][marker_id]["name"]
        markers.append(marker)

    region_labels = {r["id"]: r["name"] for r in regions}

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
                        "name": s["names"][lng],
                        "description": (s.get("descriptions") or {}).get(lng, ""),
                    }
                    for c in src["categories"] for s in c["subtypes"]
                },
            },
            # Access-id labels are identical in every locale on purpose: they are
            # ids, not names, and the game ships no names to translate.
            "markers": {MAP_ID: {}},
            "regions": {MAP_ID: {rid: {"name": label} for rid, label in region_labels.items()}},
        }
        for mid, label in marker_labels.items():
            source = marker_payload["labels"].get(mid, {"name": label})
            localized_names = source.get("localizedNames", {})
            locales[lng]["markers"][MAP_ID][mid] = {
                "name": localized_names.get(lng, source["name"]),
                **(
                    {"description": source["description"]}
                    if source.get("description")
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


def run_emit(parsed_dir: Path, data_out: Path) -> None:
    parsed_dir, data_out = Path(parsed_dir), Path(data_out)
    parsed = read_parsed(parsed_dir)
    regions_path = parsed_dir / "regions.json"
    if not regions_path.is_file():
        raise RuntimeError(
            f"{regions_path} is missing — run `python -m vrising.maps regions` first"
        )
    import json
    regions = json.loads(regions_path.read_text(encoding="utf-8"))["regions"]

    marker_payload = load_marker_payload(parsed_dir / "markers")
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

    for mid, lst in ds["markers"].items():
        print(f"emit: {mid} {len(lst)} markers, {len(ds['regions'][mid])} regions")
    print(f"emit: locales {', '.join(sorted(ds['locales']))} (calibration: {CALIBRATION_METHOD})")
