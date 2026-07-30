"""Extract stage: unex export -> ``parsed/parsed.json``.

Reads the two georeferenced region collections and the world map's pixel size,
and resolves each entry's ``MainTex`` PPtr to an exported mask PNG through
``guid-index.json``. Nothing here needs DOTS parsing.

Verified facts this stage relies on (see the plan's "Critical context"):
  * ``MinUV``/``MaxUV`` are WORLD-space AABBs despite the name — ``CenterPosWS``
    is their midpoint (372/372) and ``AspectRatio`` is their span (372/372).
  * Masks are rasterized filled silhouettes with antialiased edges. There is no
    vertex data and there are no names.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from ..common import read_json, write_json

Image.MAX_IMAGE_PIXELS = None  # the world map is 6080x6080

WORLD_MAP = "Texture2D/ZoneMap_Wilderness_VRisingWorld.png"
COLLECTIONS = {
    "poi": "MonoBehaviour/ZoneMap_VRisingWorld_POIPolygonTextureCollection.json",
    "territory": "MonoBehaviour/ZoneMap_VRisingWorld_TerritoryTextureCollection.json",
}
# Entry counts measured on the shipped game. A drift here means the game changed
# its region set (or the export is partial) — worth a loud warning, not a crash.
EXPECTED_COUNTS = {"poi": 226, "territory": 146}
# Alpha at/above this counts as "inside the silhouette". The rasters are
# antialiased, so a mid-level threshold keeps the edge stable without eating
# thin features.
ALPHA_THRESHOLD = 128
# Mask raster scale, verified during the survey.
UNITS_PER_PIXEL = 0.5


def _f2(v) -> list[float]:
    """A serialized Unity ``float2``/``Vector2`` as ``[x, y]``."""
    return [float(v["x"]), float(v["y"])]


def _entries_of(doc) -> list[dict]:
    """The entry array of a collection MonoBehaviour.

    unex serializes MonoBehaviour fields under their real names (bundles carry
    embedded TypeTrees), but the array's field name is not guaranteed, so accept
    the first list-of-dicts field that carries ``MainTex``. Both shipped
    collections happen to name it ``TerritoryTextures`` (yes, including the POI
    one — they share a script), which is why that name is tried explicitly.
    """
    for key in ("TerritoryTextures", "Entries", "entries", "Textures", "textures", "Items", "items"):
        val = doc.get(key)
        if isinstance(val, list) and (not val or isinstance(val[0], dict)):
            return val
    for val in doc.values():
        if isinstance(val, list) and val and isinstance(val[0], dict) and "MainTex" in val[0]:
            return val
    raise RuntimeError(
        "no entry array found in the collection MonoBehaviour; inspect it with "
        "`unex preview --profile vrising <vfs-path>` and add its field name to _entries_of"
    )


def resolve_mask_paths(raw: Path) -> dict[int, str]:
    """``PathID -> export-relative PNG path`` for every exported Texture2D.

    unex's ``guid-index.json`` is the bridge from a PPtr to a file on disk: the
    export tree is type-first and name-based, so a PPtr cannot be turned into a
    path any other way.
    """
    index = read_json(Path(raw) / "guid-index.json")
    rows = index.get("objects") if isinstance(index, dict) else index
    if not isinstance(rows, list):
        raise RuntimeError("guid-index.json has no `objects` array")
    out: dict[int, str] = {}
    for row in rows:
        path = row.get("outputPath")
        pid = row.get("pathId")
        if path and pid is not None and str(path).lower().endswith(".png"):
            out[int(pid)] = str(path).replace("\\", "/")
    return out


def load_mask(path: Path) -> np.ndarray:
    """A mask PNG as a boolean silhouette (True = inside), row 0 = top."""
    with Image.open(path) as im:
        alpha = np.array(im.convert("RGBA"))[:, :, 3]
    return alpha >= ALPHA_THRESHOLD


def union_bounds(entries: list[dict]) -> dict[str, list[float]]:
    """AABB covering every entry's world box."""
    xs_min = min(e["min"][0] for e in entries)
    ys_min = min(e["min"][1] for e in entries)
    xs_max = max(e["max"][0] for e in entries)
    ys_max = max(e["max"][1] for e in entries)
    return {"min": [xs_min, ys_min], "max": [xs_max, ys_max]}


def scale_check(entries: list[dict], tol_px: float = 2.0) -> dict:
    """Which axis order the mask rasters use, and at what world-units-per-pixel.

    For each entry the world span (``max - min``) and the mask raster size are
    both known, so the scale is over-determined 372 times. ``direct`` counts
    entries where span-x matches raster width; ``swapped`` counts entries where
    span-x matches raster height instead. One of the two should win outright —
    that resolves the mask's own axis order before any image search runs.
    """
    direct = swapped = 0
    ratios: list[float] = []
    for e in entries:
        span_x = e["max"][0] - e["min"][0]
        span_y = e["max"][1] - e["min"][1]
        mw, mh = e["maskSize"]
        if mw and abs(span_x / UNITS_PER_PIXEL - mw) <= tol_px and mh and abs(span_y / UNITS_PER_PIXEL - mh) <= tol_px:
            direct += 1
            ratios.append(span_x / mw)
        elif mh and abs(span_x / UNITS_PER_PIXEL - mh) <= tol_px and mw and abs(span_y / UNITS_PER_PIXEL - mw) <= tol_px:
            swapped += 1
            ratios.append(span_x / mh)
    return {
        "direct": direct,
        "swapped": swapped,
        "total": len(entries),
        "unitsPerPixel": (sum(ratios) / len(ratios)) if ratios else None,
    }


def build_parsed(raw: Path) -> dict:
    """The parsed payload: world-map size, region entries, union bounds, checks."""
    raw = Path(raw)
    masks = resolve_mask_paths(raw)

    entries: list[dict] = []
    for kind, rel in COLLECTIONS.items():
        doc = read_json(raw / rel)
        raw_entries = _entries_of(doc)
        if len(raw_entries) != EXPECTED_COUNTS[kind]:
            print(
                f"extract: WARNING {kind} has {len(raw_entries)} entries, "
                f"expected {EXPECTED_COUNTS[kind]} — the game's region set changed"
            )
        for i, e in enumerate(raw_entries):
            path_id = int(e["MainTex"]["m_PathID"])
            rel_mask = masks.get(path_id)
            if not rel_mask:
                raise RuntimeError(
                    f"{kind} entry {i}: MainTex PathID {path_id} is not in guid-index.json. "
                    "Re-run `unex export --profile vrising` so the mask textures are exported."
                )
            with Image.open(raw / rel_mask) as im:
                mask_size = [im.width, im.height]
            access = e["AccessID"]
            entries.append({
                "id": f"{'poi' if kind == 'poi' else 'terr'}_{i:03d}",
                "kind": kind,
                "index": i,
                "accessId": [int(access["x"]), int(access["y"]), int(access["z"])],
                "center": _f2(e["CenterPosWS"]),
                "min": _f2(e["MinUV"]),
                "max": _f2(e["MaxUV"]),
                "aspect": _f2(e["AspectRatio"]),
                "mask": rel_mask,
                "maskSize": mask_size,
            })

    with Image.open(raw / WORLD_MAP) as im:
        map_size = [im.width, im.height]

    # Skip a kind with no entries: union_bounds has nothing to reduce over, and a
    # partial export (or a synthetic fixture) legitimately has one empty side.
    per_kind = {
        k: union_bounds(of_kind)
        for k in COLLECTIONS
        if (of_kind := [e for e in entries if e["kind"] == k])
    }
    return {
        "mapImage": WORLD_MAP,
        "mapSize": map_size,
        "entries": entries,
        "unionBounds": union_bounds(entries),
        "unionBoundsByKind": per_kind,
        "scaleCheck": scale_check(entries),
    }


def write_parsed(raw: Path, parsed_dir: Path) -> None:
    parsed = build_parsed(raw)
    write_json(Path(parsed_dir) / "parsed.json", parsed)
    sc = parsed["scaleCheck"]
    ub = parsed["unionBounds"]
    print(f"extract: {len(parsed['entries'])} regions, map {parsed['mapSize'][0]}x{parsed['mapSize'][1]}")
    print(f"extract: union world bounds x[{ub['min'][0]:.0f}..{ub['max'][0]:.0f}] y[{ub['min'][1]:.0f}..{ub['max'][1]:.0f}]")
    print(f"extract: mask axis order direct={sc['direct']} swapped={sc['swapped']} of {sc['total']}, "
          f"units/px={sc['unitsPerPixel']}")


def read_parsed(parsed_dir: Path) -> dict:
    return read_json(Path(parsed_dir) / "parsed.json")
