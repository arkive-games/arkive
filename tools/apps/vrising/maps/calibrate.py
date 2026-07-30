"""Calibrate stage: derive AND verify the world->pixel transform.

The problem: the map image is 6080x6080 and the 372 region AABBs are in world
units, but nothing in the game files (as far as anyone has found) states how the
two relate. aion2 reads an explicit ``WorldBoundBox``; V Rising has no
equivalent identified.

The leverage: the mask rasters are 0.5 world units per pixel (verified 372/372 in
the extract stage). If the map image shares that scale, its world span is exactly
6080 * 0.5 = 3040 units on each axis, so the SCALE IS NOT FREE. That leaves the
offset (2 continuous unknowns), the orientation (8 discrete candidates) and the
mask raster's row order (2 more).

The method: composite all 372 silhouettes into a synthetic coverage image per
candidate, extract the map's own land mask from the image, and cross-correlate.
Because candidates differ by pure TRANSLATION, coverage area and land area are
both constant, so IoU = I / (A + B - I) is strictly monotonic in the intersection
I — maximising correlation therefore maximises IoU exactly, and one FFT yields
every offset at once.

Output: a printed candidate table plus overlay renders for human review. The
accepted result is copied by hand into ``calibration.py``; this module never
writes it, so a rerun can never silently move every marker on the map.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.signal import fftconvolve

from ..common import write_json
from .extract import load_mask, read_parsed
from .transform import (
    ALL_ORIENTATIONS,
    Orientation,
    make_transform,
    translate_bounds_by_pixels,
)

Image.MAX_IMAGE_PIXELS = None

# Verified mask scale; fixes the map's world span at MAP_PX * UNITS_PER_PIXEL.
UNITS_PER_PIXEL = 0.5
# The search runs at 1/8 scale (6080 -> 760): plenty for a coastline-sized
# signal, and it keeps each FFT well under a second.
SEARCH_DIV = 8
# The winning candidate is then refined at 1/2 scale (6080 -> 3040), where one
# pixel is one world unit, so the offset lands within a couple of full-res px.
REFINE_DIV = 2
# Colour distance (Manhattan, 0..765) from the corner pixel below which a pixel
# counts as "frame/void" for the edge-connected flood fill.
FLOOD_TOL = 60
# A land fraction outside this range means a land-mask method did not find the
# coastline; the next method in the chain is tried (see run_calibrate).
LAND_FRACTION_RANGE = (0.20, 0.80)
# Ink mask (the primary method for this map, see land_mask_from_ink). The map is
# an opaque parchment sheet: no alpha, no flat void colour, so "land" has to be
# read off the drawn ink instead of a background fill.
INK_VALUE_THRESHOLD = 120   # HSV V below this counts as ink/terrain, not parchment
INK_DENSITY_SIZE = 15       # box-filter window, in search-scale px
INK_DENSITY_THRESHOLD = 0.40  # fraction of ink inside the window to count as land
# Acceptance thresholds (see the plan's acceptance criterion).
MIN_IOU = 0.75
MIN_MARGIN = 0.10
# Scale sweep used only when no candidate clears MIN_IOU at 0.5 u/px.
SCALE_SWEEP = [round(0.40 + 0.005 * i, 3) for i in range(41)]


def iou(a: np.ndarray, b: np.ndarray) -> float:
    inter = int(np.count_nonzero(a & b))
    union = int(np.count_nonzero(a | b))
    return inter / union if union else 0.0


def containment(coverage: np.ndarray, land: np.ndarray) -> float:
    """Fraction of the composited coverage that lands on drawn terrain (I / A).

    IoU turned out to be the wrong absolute statistic for this map. The 372
    silhouettes are individual sub-areas, not a tiling of the landmass: measured
    against the ink land mask they cover only 40.9% of it, so
    ``IoU <= min(A,B)/max(A,B) = 0.409`` no matter how perfect the alignment. The
    plan's 0.75 threshold was therefore unattainable by construction.

    Containment is well posed for the same search: ``A`` is translation-invariant
    just like ``B``, so argmax correlation is still argmax containment, and the
    absolute number means something a reader can judge — "93.7% of every region
    silhouette sits on terrain the map actually draws".
    """
    a = int(np.count_nonzero(coverage))
    return int(np.count_nonzero(coverage & land)) / a if a else 0.0


def land_mask_from_flood(rgb: np.ndarray, tol: int = FLOOD_TOL) -> tuple[np.ndarray, float]:
    """The map's landmass, by clearing the edge-connected frame/void.

    Same idea as palworld's ``_clear_void``: take the corner colour, find every
    pixel within ``tol`` of it, keep the connected components that touch an image
    edge, and call the complement land. Returns ``(land, land_fraction)``.
    """
    border = rgb[0, 0, :3].astype(np.int16)
    dist = np.abs(rgb[:, :, :3].astype(np.int16) - border).sum(axis=2)
    close = dist <= tol
    labels, _ = ndimage.label(close)
    edge = np.unique(
        np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]])
    )
    edge = edge[edge != 0]
    void = np.isin(labels, edge)
    land = ~void
    return land, float(np.count_nonzero(land)) / land.size


def land_mask_from_ink(
    rgb: np.ndarray,
    value_thresh: int = INK_VALUE_THRESHOLD,
    density_size: int = INK_DENSITY_SIZE,
    density_thresh: float = INK_DENSITY_THRESHOLD,
) -> tuple[np.ndarray, float]:
    """The map's landmass, by INK DENSITY. Primary method for the Vardoran map.

    Vardoran's map image is a fully opaque parchment sheet: alpha is 255
    everywhere and there is no flat void colour, so both the flood fill and the
    Sobel mask degenerate to "the whole canvas" (measured 0.99 for each). What
    does separate land from parchment is brightness — the drawn landmass is dark
    terrain plus dense ink outlines (HSV V roughly 68-122) while the parchment
    sits at V 144-157.

    Thresholding V alone also catches the decorative frame, the compass rose and
    the castle vignette, and morphological closing bridges those to the landmass.
    So instead of closing, the ink is box-filtered into a local DENSITY and
    thresholded: the landmass is densely inked, the border art is thin lines. The
    largest connected component of the dense area, hole-filled, is the landmass.
    """
    hsv = np.array(Image.fromarray(rgb[:, :, :3].astype(np.uint8), "RGB").convert("HSV"))
    ink = (hsv[:, :, 2] < value_thresh).astype(np.float32)
    dense = ndimage.uniform_filter(ink, size=density_size) > density_thresh
    labels, n = ndimage.label(dense)
    if n:
        sizes = ndimage.sum(dense, labels, range(1, n + 1))
        dense = labels == (int(np.argmax(sizes)) + 1)
    land = ndimage.binary_fill_holes(dense)
    return land, float(np.count_nonzero(land)) / land.size


def land_mask_from_gradient(rgb: np.ndarray, thresh: int = 18) -> tuple[np.ndarray, float]:
    """Fallback land mask: where the map has drawn detail.

    Used when the flood fill's land fraction is implausible (a decorative border
    whose colour is close to the interior parchment defeats the flood). Sobel
    magnitude -> threshold -> close -> fill -> largest component.
    """
    grey = rgb[:, :, :3].mean(axis=2)
    gx = ndimage.sobel(grey, axis=1)
    gy = ndimage.sobel(grey, axis=0)
    edges = np.hypot(gx, gy) > thresh
    closed = ndimage.binary_closing(edges, structure=np.ones((9, 9)))
    filled = ndimage.binary_fill_holes(closed)
    labels, n = ndimage.label(filled)
    if n:
        sizes = ndimage.sum(filled, labels, range(1, n + 1))
        filled = labels == (int(np.argmax(sizes)) + 1)
    return filled, float(np.count_nonzero(filled)) / filled.size


def composite_coverage(
    entries: list[dict],
    masks: dict[str, np.ndarray],
    bounds: dict,
    o: Orientation,
    width: int,
    height: int,
    mask_rows_down: bool,
) -> np.ndarray:
    """Union of every region silhouette, painted at ``width`` x ``height``.

    Each mask is placed by transforming its world AABB corners through ``o``,
    then resampling the silhouette into the resulting pixel rectangle.
    ``mask_rows_down`` selects the mask raster's own row order: True means mask
    row 0 corresponds to the box's MAX world-y edge (image-style, y down).
    """
    canvas = np.zeros((height, width), dtype=bool)
    t = make_transform(bounds, o, width, height)
    for e in entries:
        mask = masks.get(e["id"])
        if mask is None:
            continue
        if not mask_rows_down:
            mask = mask[::-1, :]
        (x0, y0) = t(e["min"][0], e["min"][1])
        (x1, y1) = t(e["max"][0], e["max"][1])
        left, right = sorted((x0, x1))
        top, bottom = sorted((y0, y1))
        w = int(round(right - left))
        h = int(round(bottom - top))
        if w < 1 or h < 1:
            continue
        # A swapped pxAxis means the mask's own axes swap with it.
        src = mask.T if o.px_axis == "Y" else mask
        small = np.array(
            Image.fromarray(src.astype(np.uint8) * 255).resize((w, h), Image.NEAREST)
        ) >= 128
        li, ti = int(round(left)), int(round(top))
        # Clip to the canvas (a candidate offset can push a box off the edge).
        sl = max(0, -li)
        st = max(0, -ti)
        el = min(w, width - li)
        et = min(h, height - ti)
        if el <= sl or et <= st:
            continue
        canvas[ti + st: ti + et, li + sl: li + el] |= small[st:et, sl:el]
    return canvas


def find_shift(coverage: np.ndarray, land: np.ndarray) -> tuple[int, int, float]:
    """Pixel shift ``(dpx, dpy)`` maximising the overlap of coverage with land.

    Cross-correlation via FFT: every candidate offset is evaluated at once.
    Because the two areas are translation-invariant, argmax of the correlation is
    argmax of IoU (union = A + B - I).
    """
    a = coverage.astype(np.float32)
    b = land.astype(np.float32)
    corr = fftconvolve(b, a[::-1, ::-1], mode="same")
    idx = int(np.argmax(corr))
    cy, cx = np.unravel_index(idx, corr.shape)
    dpy = int(cy) - corr.shape[0] // 2
    dpx = int(cx) - corr.shape[1] // 2
    return dpx, dpy, float(corr[cy, cx])


def best_candidate(
    entries: list[dict],
    masks: dict[str, np.ndarray],
    land: np.ndarray,
    seed_bounds: dict,
    width: int,
    height: int,
) -> dict:
    """Evaluate all 16 candidates (8 orientations x 2 mask row orders).

    Returns the winner plus the IoU margin over the runner-up — the margin is
    half the acceptance criterion, because a transform that is only marginally
    better than its own mirror image has not actually been determined.
    """
    rows: list[dict] = []
    for o in ALL_ORIENTATIONS:
        for rows_down in (True, False):
            cov = composite_coverage(entries, masks, seed_bounds, o, width, height, rows_down)
            dpx, dpy, _ = find_shift(cov, land)
            shifted = translate_bounds_by_pixels(seed_bounds, o, width, height, dpx, dpy)
            cov2 = composite_coverage(entries, masks, shifted, o, width, height, rows_down)
            rows.append({
                "orientation": o,
                "maskRowsDown": rows_down,
                "shift": (dpx, dpy),
                "bounds": shifted,
                "iou": iou(cov2, land),
                "containment": containment(cov2, land),
            })
    # Ranked on containment, not IoU: see :func:`containment` for why IoU cannot
    # discriminate here. The two agree on the ordering whenever coverage areas
    # match, and containment additionally separates candidates whose coverage
    # partly falls off the landmass.
    rows.sort(key=lambda r: r["containment"], reverse=True)
    winner = dict(rows[0])
    winner["margin"] = rows[0]["containment"] - (rows[1]["containment"] if len(rows) > 1 else 0.0)
    winner["iouMargin"] = rows[0]["iou"] - (rows[1]["iou"] if len(rows) > 1 else 0.0)
    winner["table"] = rows
    return winner


def ink_mask(img: Image.Image, value_thresh: int = INK_VALUE_THRESHOLD) -> np.ndarray:
    """Raw dark-ink mask (not the filled land blob): where the map drew a line."""
    return np.array(img.convert("HSV"))[:, :, 2] < value_thresh


def _outline(mask: np.ndarray) -> np.ndarray:
    """One-pixel boundary ring of a filled silhouette."""
    return mask & ~ndimage.binary_erosion(mask, structure=np.ones((3, 3)))


def _place(mask: np.ndarray, entry: dict, t, o: Orientation, rows_down: bool):
    """A silhouette resampled into its world AABB's pixel rectangle.

    Returns ``(placed, left, top)`` or ``None`` when the rectangle is degenerate.
    """
    if not rows_down:
        mask = mask[::-1, :]
    src = mask.T if o.px_axis == "Y" else mask
    x0, y0 = t(entry["min"][0], entry["min"][1])
    x1, y1 = t(entry["max"][0], entry["max"][1])
    left, right = sorted((x0, x1))
    top, bottom = sorted((y0, y1))
    w, h = int(round(right - left)), int(round(bottom - top))
    if w < 3 or h < 3:
        return None
    placed = np.array(
        Image.fromarray(src.astype(np.uint8) * 255).resize((w, h), Image.NEAREST)
    ) >= 128
    return placed, int(round(left)), int(round(top))


def composite_outlines(
    entries: list[dict],
    masks: dict[str, np.ndarray],
    bounds: dict,
    o: Orientation,
    size: int,
    rows_down: bool,
) -> np.ndarray:
    """Every region's BOUNDARY painted onto one canvas.

    The second, independent registration target. Blob overlap (``composite_coverage``
    vs the land mask) fixes where the landmass is; outline overlap fixes where the
    game drew each sub-area's edge. Two objectives agreeing is much stronger
    evidence than either alone.
    """
    canvas = np.zeros((size, size), dtype=bool)
    t = make_transform(bounds, o, size, size)
    for e in entries:
        mask = masks.get(e["id"])
        if mask is None:
            continue
        placed = _place(mask, e, t, o, rows_down)
        if placed is None:
            continue
        ring, li, ti = placed[0], placed[1], placed[2]
        ring = _outline(ring)
        h, w = ring.shape
        sl, st = max(0, -li), max(0, -ti)
        el, et = min(w, size - li), min(h, size - ti)
        if el <= sl or et <= st:
            continue
        canvas[ti + st: ti + et, li + sl: li + el] |= ring[st:et, sl:el]
    return canvas


def outline_hit_rate(outlines: np.ndarray, ink: np.ndarray) -> float:
    """Fraction of region-boundary pixels that fall on ink the map actually drew."""
    n = int(np.count_nonzero(outlines))
    return int(np.count_nonzero(outlines & ink)) / n if n else 0.0


def refine_offset(
    entries: list[dict],
    masks: dict[str, np.ndarray],
    bounds: dict,
    o: Orientation,
    ink: np.ndarray,
    size: int,
    rows_down: bool,
    window: int = 30,
) -> tuple[dict, float]:
    """Re-fit the offset against the OUTLINE objective, within +/- ``window`` px.

    Returns ``(bounds, outline hit rate)``. The window is deliberately small: this
    is a refinement of an already-converged blob fit, not a second global search,
    so it cannot wander off to a spurious peak.
    """
    outlines = composite_outlines(entries, masks, bounds, o, size, rows_down)
    corr = fftconvolve(ink.astype(np.float32), outlines[::-1, ::-1].astype(np.float32), mode="same")
    c = size // 2
    patch = corr[c - window: c + window + 1, c - window: c + window + 1]
    iy, ix = np.unravel_index(int(np.argmax(patch)), patch.shape)
    dpx, dpy = int(ix) - window, int(iy) - window
    refined = translate_bounds_by_pixels(bounds, o, size, size, dpx, dpy)
    return refined, outline_hit_rate(
        composite_outlines(entries, masks, refined, o, size, rows_down), ink
    )


def pick_spot_check_regions(entries: list[dict]) -> list[tuple[str, dict]]:
    """The three regions the plan mandates checking, chosen mechanically.

    Largest world area, most eccentric (longest:shortest span), and the one whose
    centre is nearest a corner of the world box. Corner and eccentric regions are
    included on purpose: a wrong flip or a swapped axis is nearly invisible near
    the centre and glaring at the edges.
    """
    poi = [e for e in entries if e["kind"] == "poi"] or entries

    def area(e):
        return (e["max"][0] - e["min"][0]) * (e["max"][1] - e["min"][1])

    def eccentricity(e):
        sx = e["max"][0] - e["min"][0]
        sy = e["max"][1] - e["min"][1]
        return max(sx, sy) / max(1e-6, min(sx, sy))

    xs = [e["center"][0] for e in entries]
    ys = [e["center"][1] for e in entries]
    corners = [(min(xs), min(ys)), (min(xs), max(ys)), (max(xs), min(ys)), (max(xs), max(ys))]

    def corner_distance(e):
        cx, cy = e["center"]
        return min((cx - qx) ** 2 + (cy - qy) ** 2 for qx, qy in corners)

    return [
        ("largest", max(poi, key=area)),
        ("eccentric", max(poi, key=eccentricity)),
        ("corner", min(entries, key=corner_distance)),
    ]


def region_local_offset(
    mask: np.ndarray,
    entry: dict,
    ink: np.ndarray,
    bounds: dict,
    o: Orientation,
    size: int,
    rows_down: bool,
    search_px: int = 8,
) -> tuple[int, int, float] | None:
    """Local ``(dpx, dpy)`` that best aligns one region's OUTLINE with the map ink.

    The filled land mask cannot localize a single region — a small blob inside a
    big filled blob correlates equally everywhere. What does localize is the
    region's boundary: the map draws every sub-area with a dark outline, so the
    silhouette's morphological gradient should sit on top of drawn ink. Brute
    force over +/- ``search_px`` (the window is tiny) and return the peak, so the
    reported number is "how far this region is from its drawn feature", in
    search-scale pixels.

    The template is ZERO-MEANED before correlating. With a raw 0/1 template the
    score is just "how much ink is under the outline", which rewards drifting
    toward any ink-dense neighbourhood — measured on the eccentric spot-check
    region that produced a spurious 69 px offset where the true one is 17 px.
    Subtracting the mean makes ink *outside* the ring count against a candidate,
    which is what "the ring sits on the drawn edge" actually means.
    """
    t = make_transform(bounds, o, size, size)
    if not rows_down:
        mask = mask[::-1, :]
    src = mask.T if o.px_axis == "Y" else mask
    x0, y0 = t(entry["min"][0], entry["min"][1])
    x1, y1 = t(entry["max"][0], entry["max"][1])
    left, right = sorted((x0, x1))
    top, bottom = sorted((y0, y1))
    w, h = int(round(right - left)), int(round(bottom - top))
    if w < 4 or h < 4:
        return None
    placed = np.array(
        Image.fromarray(src.astype(np.uint8) * 255).resize((w, h), Image.NEAREST)
    ) >= 128
    outline = placed & ~ndimage.binary_erosion(placed, structure=np.ones((3, 3)))
    if not outline.any():
        return None
    template = outline.astype(np.float32)
    template -= template.mean()
    inkf = ink.astype(np.float32)
    li, ti = int(round(left)), int(round(top))
    best = None
    for dy in range(-search_px, search_px + 1):
        for dx in range(-search_px, search_px + 1):
            y, x = ti + dy, li + dx
            if y < 0 or x < 0 or y + h > size or x + w > size:
                continue
            score = float((template * inkf[y: y + h, x: x + w]).sum())
            if best is None or score > best[2]:
                best = (dx, dy, score)
    return best


def _overlay(base: Image.Image, coverage: np.ndarray, entries, bounds, o, size, rows_down) -> Image.Image:
    """The base map with the composited silhouettes in translucent red and every
    AABB outlined — the render a human actually judges."""
    img = base.convert("RGB").copy()
    tint = np.array(img, dtype=np.float32)
    tint[coverage] = tint[coverage] * 0.55 + np.array([214.0, 64.0, 74.0]) * 0.45
    img = Image.fromarray(tint.astype(np.uint8), "RGB")
    draw = ImageDraw.Draw(img)
    t = make_transform(bounds, o, size, size)
    for e in entries:
        x0, y0 = t(e["min"][0], e["min"][1])
        x1, y1 = t(e["max"][0], e["max"][1])
        draw.rectangle(
            [min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)],
            outline=(216, 180, 94),
        )
    return img


def run_calibrate(raw: Path, parsed_dir: Path) -> None:
    """Search, report and render. Writes NOTHING that the pipeline consumes —
    the accepted numbers are copied into ``calibration.py`` by a human."""
    raw, parsed_dir = Path(raw), Path(parsed_dir)
    parsed = read_parsed(parsed_dir)
    entries = parsed["entries"]
    map_px = int(parsed["mapSize"][0])
    size = map_px // SEARCH_DIV

    with Image.open(raw / parsed["mapImage"]) as im:
        base = im.convert("RGB").resize((size, size), Image.LANCZOS)
    rgb = np.array(base)

    # Method chain, most reliable for this map first. Each result is checked
    # against LAND_FRACTION_RANGE; a degenerate mask (nearly all or nearly none
    # of the canvas) carries no registration signal, so move on rather than
    # correlate against noise.
    lo, hi = LAND_FRACTION_RANGE
    land = fraction = None
    method = "none"
    for name, fn in (
        ("ink", land_mask_from_ink),
        ("flood", land_mask_from_flood),
        ("gradient", land_mask_from_gradient),
    ):
        candidate, candidate_fraction = fn(rgb)
        if lo <= candidate_fraction <= hi:
            land, fraction, method = candidate, candidate_fraction, name
            break
        print(f"calibrate: {name} land fraction {candidate_fraction:.3f} implausible - trying the next method")
    if land is None:
        raise RuntimeError(
            "no land-mask method produced a plausible fraction; inspect the map image "
            f"(expected a land fraction in {LAND_FRACTION_RANGE})"
        )
    print(f"calibrate: land mask via {method}, fraction {fraction:.3f}")

    masks: dict[str, np.ndarray] = {}
    for e in entries:
        masks[e["id"]] = load_mask(raw / e["mask"])

    span = map_px * UNITS_PER_PIXEL
    union = parsed["unionBounds"]
    mid_x = (union["min"][0] + union["max"][0]) / 2
    mid_y = (union["min"][1] + union["max"][1]) / 2
    seed = {
        "min": [mid_x - span / 2, mid_y - span / 2],
        "max": [mid_x + span / 2, mid_y + span / 2],
    }
    print(f"calibrate: seed bounds min={seed['min']} max={seed['max']} (span {span:.0f} world units)")

    result = best_candidate(entries, masks, land, seed, size, size)

    print("calibrate: candidates (best first)")
    for r in result["table"][:6]:
        o = r["orientation"]
        print(
            f"  contain {r['containment']:.4f}  IoU {r['iou']:.4f}  pxAxis={o.px_axis} "
            f"flipX={int(o.flip_x)} flipY={int(o.flip_y)} "
            f"maskRowsDown={int(r['maskRowsDown'])} shift={r['shift']}"
        )
    o = result["orientation"]
    cov_best = composite_coverage(
        entries, masks, result["bounds"], o, size, size, result["maskRowsDown"]
    )
    area_cov = int(np.count_nonzero(cov_best))
    area_land = int(np.count_nonzero(land))
    iou_ceiling = min(area_cov, area_land) / max(area_cov, area_land)
    print(f"calibrate: BEST containment {result['containment']:.4f}, margin {result['margin']:.4f}")
    print(f"calibrate: BEST IoU {result['iou']:.4f} (margin {result['iouMargin']:.4f}), "
          f"IoU ceiling {iou_ceiling:.4f} = min(A,B)/max(A,B) with A={area_cov} B={area_land}")
    print(f"calibrate: bounds min={[round(v, 2) for v in result['bounds']['min']]} "
          f"max={[round(v, 2) for v in result['bounds']['max']]}")
    accepted = result["iou"] >= MIN_IOU and result["iouMargin"] >= MIN_MARGIN
    print(f"calibrate: ACCEPTED={accepted} (need IoU>={MIN_IOU}, margin>={MIN_MARGIN})")
    if not accepted and iou_ceiling < MIN_IOU:
        print(f"calibrate: NOTE the IoU gate is unreachable here - the 372 silhouettes cover only "
              f"{area_cov / area_land:.1%} of the landmass, so IoU can never exceed {iou_ceiling:.4f}. "
              f"Judge containment and the region offsets below instead.")

    # ---- refinement pass at 1/2 scale -------------------------------------
    # The coarse search quantises the offset to SEARCH_DIV full-res px and, at
    # 1/8 scale, a small region's within-box row flip is nearly invisible, so
    # maskRowsDown comes out a near-tie. Both are settled here at 1/2 scale
    # (1 px = 1 world unit) against the outline objective, which is far more
    # sensitive to a vertical flip than blob overlap is.
    rsize = map_px // REFINE_DIV
    with Image.open(raw / parsed["mapImage"]) as im:
        rbase = im.convert("RGB").resize((rsize, rsize), Image.LANCZOS)
    rland, rfraction = land_mask_from_ink(
        np.array(rbase), density_size=INK_DENSITY_SIZE * SEARCH_DIV // REFINE_DIV
    )
    rink = ink_mask(rbase)
    print(f"calibrate: refining at 1/{REFINE_DIV} ({rsize}px), land fraction {rfraction:.3f}, "
          f"ink fraction {float(rink.mean()):.3f}")

    refined_rows: list[dict] = []
    for rows_down in (True, False):
        cov = composite_coverage(entries, masks, result["bounds"], o, rsize, rsize, rows_down)
        dpx, dpy, _ = find_shift(cov, rland)
        blob_bounds = translate_bounds_by_pixels(result["bounds"], o, rsize, rsize, dpx, dpy)
        final_bounds, hit = refine_offset(
            entries, masks, blob_bounds, o, rink, rsize, rows_down
        )
        cov2 = composite_coverage(entries, masks, final_bounds, o, rsize, rsize, rows_down)
        refined_rows.append({
            "maskRowsDown": rows_down,
            "bounds": final_bounds,
            "containment": containment(cov2, rland),
            "iou": iou(cov2, rland),
            "outlineHitRate": hit,
        })
        print(f"  maskRowsDown={int(rows_down)}  outline hit {hit:.4f}  "
              f"contain {refined_rows[-1]['containment']:.4f}  "
              f"bounds min={[round(v, 2) for v in final_bounds['min']]} "
              f"max={[round(v, 2) for v in final_bounds['max']]}")
    refined_rows.sort(key=lambda r: r["outlineHitRate"], reverse=True)
    final = refined_rows[0]
    row_margin = final["outlineHitRate"] - refined_rows[1]["outlineHitRate"]
    print(f"calibrate: ROW ORDER maskRowsDown={int(final['maskRowsDown'])} "
          f"wins on outline hit rate by {row_margin:.4f}")
    print(f"calibrate: FINAL bounds min={[round(v, 2) for v in final['bounds']['min']]} "
          f"max={[round(v, 2) for v in final['bounds']['max']]}")
    print(f"calibrate: FINAL containment {final['containment']:.4f}, "
          f"outline hit rate {final['outlineHitRate']:.4f}, IoU {final['iou']:.4f}")

    # Mandated three-region check, mechanically chosen and mechanically measured:
    # each region's outline is correlated against the map's raw ink locally, and
    # the resulting offset is what "within 30 px at full resolution" means.
    limit_px = 30
    print(f"calibrate: region offset check at 1/{REFINE_DIV} (limit {limit_px} px full-res "
          f"= {limit_px // REFINE_DIV} px at this scale)")
    spot_rows: list[dict] = []
    for label, entry in pick_spot_check_regions(entries):
        found = region_local_offset(
            masks[entry["id"]], entry, rink, final["bounds"], o, rsize,
            final["maskRowsDown"], search_px=limit_px,
        )
        if found is None:
            print(f"  {label:10s} {entry['id']}: too small to measure")
            continue
        dx, dy, _ = found
        full = (dx ** 2 + dy ** 2) ** 0.5 * REFINE_DIV
        ok = full <= limit_px
        print(f"  {label:10s} {entry['id']} offset=({dx}, {dy}) px at 1/{REFINE_DIV} "
              f"= {full:.0f} px full-res  within {limit_px}px: {ok}")
        spot_rows.append({"kind": label, "id": entry["id"], "offsetPx": [dx, dy],
                          "offsetFullResPx": round(full, 1), "withinLimit": ok})
    spot_ok = bool(spot_rows) and all(r["withinLimit"] for r in spot_rows)
    print(f"calibrate: region offsets all within {limit_px} px: {spot_ok}")

    out_dir = parsed_dir.parent / "calibration"
    out_dir.mkdir(parents=True, exist_ok=True)
    # Full-detail review render of the accepted result: the coarse 760px overlays
    # below are too small to judge a 30px offset on.
    review_size = rsize // 2
    review_base = rbase.resize((review_size, review_size), Image.LANCZOS)
    review_cov = composite_coverage(
        entries, masks, final["bounds"], o, review_size, review_size, final["maskRowsDown"]
    )
    _overlay(review_base, review_cov, entries, final["bounds"], o, review_size,
             final["maskRowsDown"]).save(out_dir / "accepted_overlay.png")
    # rank0 = the winner; rank1 = the best candidate with a DIFFERENT ORIENTATION.
    # The literal runner-up only differs in mask row order, which looks identical
    # at 760 px, so it cannot answer "is the runner-up visibly wrong?".
    rival = next(
        (r for r in result["table"] if r["orientation"] != o),
        result["table"][1] if len(result["table"]) > 1 else result["table"][0],
    )
    for rank, r in enumerate([result["table"][0], rival]):
        cov = composite_coverage(
            entries, masks, r["bounds"], r["orientation"], size, size, r["maskRowsDown"]
        )
        img = _overlay(base, cov, entries, r["bounds"], r["orientation"], size, r["maskRowsDown"])
        o2 = r["orientation"]
        name = (f"rank{rank}_contain{r['containment']:.3f}_px{o2.px_axis}"
                f"_fx{int(o2.flip_x)}_fy{int(o2.flip_y)}_rd{int(r['maskRowsDown'])}.png")
        img.save(out_dir / name)
    write_json(out_dir / "result.json", {
        "accepted": accepted,
        "coarseContainment": result["containment"],
        "coarseContainmentMargin": result["margin"],
        "iou": final["iou"],
        "iouMargin": result["iouMargin"],
        "iouCeiling": iou_ceiling,
        "containment": final["containment"],
        "outlineHitRate": final["outlineHitRate"],
        "rowOrderMargin": row_margin,
        "regionOffsets": spot_rows,
        "regionOffsetsWithinLimit": spot_ok,
        "landMaskMethod": method,
        "landFraction": fraction,
        "unitsPerPixel": UNITS_PER_PIXEL,
        "mapSize": parsed["mapSize"],
        "orientation": o.as_json(),
        "maskRowsDown": final["maskRowsDown"],
        "worldBounds": final["bounds"],
        "candidates": [
            {"containment": r["containment"], "iou": r["iou"],
             "orientation": r["orientation"].as_json(),
             "maskRowsDown": r["maskRowsDown"], "shift": list(r["shift"])}
            for r in result["table"]
        ],
    })
    print(f"calibrate: wrote {out_dir}")


def run_scale_sweep(raw: Path, parsed_dir: Path, search_div: int = SEARCH_DIV * 2) -> None:
    """Fallback 1 (plan Task 8 Step 9.1): re-run the search over ``SCALE_SWEEP``.

    The 0.5 world-units-per-pixel figure is verified for the MASK rasters, not
    proven for the MAP image, so this sweeps the map's assumed scale and reports
    the best candidate at each. Runs at half the normal resolution because it is
    41x the work; the scale it reports is a diagnostic, never written anywhere.
    """
    raw, parsed_dir = Path(raw), Path(parsed_dir)
    parsed = read_parsed(parsed_dir)
    entries = parsed["entries"]
    map_px = int(parsed["mapSize"][0])
    size = map_px // search_div

    with Image.open(raw / parsed["mapImage"]) as im:
        base = im.convert("RGB").resize((size, size), Image.LANCZOS)
    land, fraction = land_mask_from_ink(
        np.array(base), density_size=max(3, round(INK_DENSITY_SIZE * search_div / SEARCH_DIV / 2))
    )
    print(f"calibrate: sweep land mask via ink at 1/{search_div}, fraction {fraction:.3f}")
    masks = {e["id"]: load_mask(raw / e["mask"]) for e in entries}

    union = parsed["unionBounds"]
    mid_x = (union["min"][0] + union["max"][0]) / 2
    mid_y = (union["min"][1] + union["max"][1]) / 2

    rows: list[dict] = []
    for scale in SCALE_SWEEP:
        span = map_px * scale
        seed = {
            "min": [mid_x - span / 2, mid_y - span / 2],
            "max": [mid_x + span / 2, mid_y + span / 2],
        }
        result = best_candidate(entries, masks, land, seed, size, size)
        rows.append({"scale": scale, "containment": result["containment"], "iou": result["iou"],
                     "orientation": result["orientation"], "shift": result["shift"]})
        print(f"  scale {scale:.3f} u/px  contain {result['containment']:.4f}  IoU {result['iou']:.4f}  "
              f"pxAxis={result['orientation'].px_axis} "
              f"flipX={int(result['orientation'].flip_x)} flipY={int(result['orientation'].flip_y)}")
    best_iou = max(rows, key=lambda r: r["iou"])
    best_contain = max(rows, key=lambda r: r["containment"])
    print(f"calibrate: sweep best IoU {best_iou['iou']:.4f} at scale {best_iou['scale']}")
    print(f"calibrate: sweep best containment {best_contain['containment']:.4f} "
          f"at scale {best_contain['scale']}")
    print(f"calibrate: sweep gate (IoU>={MIN_IOU}) cleared: {best_iou['iou'] >= MIN_IOU}")
