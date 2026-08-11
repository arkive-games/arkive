"""Region silhouettes -> simplified polygon rings in map-pixel space.

The game ships no vertex data for regions: each of the 372 entries is a
rasterized filled silhouette with antialiased edges. So rings come from contour
tracing, then Douglas-Peucker simplification, then a two-step coordinate change
(mask raster -> world -> map pixels).

``RegionInstance.borders`` in ``@gamemap/data-contract`` is PIXEL space. Markers
are the other way round (raw world coordinates, projected by the engine) — that
asymmetry is the contract's, not this module's.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from ..common import round2, write_json
from .calibration import MAP_PX, MASK_ROWS_DOWN, ORIENTATION, WORLD_BOUNDS
from .extract import load_mask, read_parsed
from .transform import Orientation, make_transform

# Contour rings smaller than this are raster noise / antialiasing crumbs.
MIN_AREA_PX = 24
# Douglas-Peucker epsilon as a fraction of the ring's perimeter. 0.004 keeps
# coastline character while cutting a 2,000-point traced contour to a few dozen
# points — the frontend draws these as Leaflet polygons on every pan.
SIMPLIFY_EPS_FRACTION = 0.004
# Hard cap so one pathological silhouette cannot ship a 5,000-point polygon.
MAX_POINTS_PER_RING = 256


def ring_area(ring: list[list[float]]) -> float:
    """Absolute shoelace area of a closed ring."""
    s = 0.0
    for i in range(len(ring) - 1):
        s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return abs(s) / 2


def mask_to_rings(
    mask: np.ndarray,
    min_area_px: int = MIN_AREA_PX,
    eps_fraction: float = SIMPLIFY_EPS_FRACTION,
) -> list[list[list[float]]]:
    """Closed, simplified rings in MASK-RASTER coordinates, largest area first.

    Only outer contours are kept: a region with a hole is drawn as a filled
    outline anyway, and Leaflet polygon holes would need a ring-winding contract
    the data format does not define.
    """
    img = (mask.astype(np.uint8)) * 255
    contours, _ = cv2.findContours(img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    rings: list[list[list[float]]] = []
    for c in contours:
        if cv2.contourArea(c) < min_area_px:
            continue
        eps = eps_fraction * cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, eps, True)
        if len(approx) < 3:
            continue
        pts = [[float(p[0][0]), float(p[0][1])] for p in approx]
        if len(pts) > MAX_POINTS_PER_RING:
            step = len(pts) / MAX_POINTS_PER_RING
            pts = [pts[int(i * step)] for i in range(MAX_POINTS_PER_RING)]
        pts.append([pts[0][0], pts[0][1]])  # close the ring
        rings.append(pts)
    rings.sort(key=ring_area, reverse=True)
    return rings


def rings_to_pixels(
    rings: list[list[list[float]]],
    entry: dict,
    bounds: dict,
    o: Orientation,
    width: int,
    height: int,
    mask_rows_down: bool,
) -> list[list[list[float]]]:
    """Mask-raster rings -> map-pixel rings, via the entry's world AABB.

    Mask column -> world x across ``[min.x, max.x]``. Mask row -> world y, from
    ``max.y`` downward when ``mask_rows_down`` (image-style), from ``min.y``
    upward otherwise. The map transform then takes world to pixels.
    """
    mw, mh = entry["maskSize"]
    mnx, mny = entry["min"]
    mxx, mxy = entry["max"]
    span_x = mxx - mnx
    span_y = mxy - mny
    t = make_transform(bounds, o, width, height)
    out: list[list[list[float]]] = []
    for ring in rings:
        pixels: list[list[float]] = []
        for col, row in ring:
            wx = mnx + (col / mw) * span_x
            wy = (mxy - (row / mh) * span_y) if mask_rows_down else (mny + (row / mh) * span_y)
            px, py = t(wx, wy)
            pixels.append([round2(px), round2(py)])
        out.append(pixels)
    return out


def build_regions(raw: Path, parsed: dict) -> list[dict]:
    """One ``RegionInstance``-shaped dict per entry that traced to a ring."""
    raw = Path(raw)
    o = ORIENTATION
    regions: list[dict] = []
    empty: list[str] = []
    total_points = 0
    for e in parsed["entries"]:
        mask = load_mask(raw / e["mask"])
        rings = mask_to_rings(mask)
        if not rings:
            empty.append(e["id"])
            continue
        borders = rings_to_pixels(rings, e, WORLD_BOUNDS, o, MAP_PX, MAP_PX, MASK_ROWS_DOWN)
        total_points += sum(len(r) for r in borders)
        regions.append({
            "id": e["id"],
            # The map engine uses this field as a stable polygon key. Real region
            # names are not yet resolved, so keep the technical id and expose no
            # user-facing locale entry for it.
            "name": e["id"],
            "type": e["kind"],
            "borders": borders,
        })
    if empty:
        print(f"regions: WARNING {len(empty)} masks traced to nothing: {empty[:8]}")
    # Largest first so the frontend's smallest-containing-region lookup, which
    # sorts ascending, has a stable input.
    regions.sort(key=lambda r: sum(ring_area(ring) for ring in r["borders"]), reverse=True)
    print(f"regions: {len(regions)} polygons, {total_points} points "
          f"({total_points / max(1, len(regions)):.1f} per region)")
    return regions


def run_regions(raw: Path, parsed_dir: Path) -> None:
    parsed = read_parsed(parsed_dir)
    regions = build_regions(raw, parsed)
    write_json(Path(parsed_dir) / "regions.json", {"regions": regions})
    print(f"regions: wrote {Path(parsed_dir) / 'regions.json'}")
