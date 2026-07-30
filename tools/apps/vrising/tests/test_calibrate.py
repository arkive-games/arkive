from __future__ import annotations

import numpy as np
import pytest

from vrising.maps.calibrate import (
    best_candidate,
    composite_coverage,
    find_shift,
    iou,
    land_mask_from_flood,
)
from vrising.maps.transform import Orientation


def _boxes():
    """Three region entries in world units, 0.5 units per mask pixel."""
    return [
        {"id": "a", "min": [10.0, 10.0], "max": [30.0, 20.0], "maskSize": [40, 20]},
        {"id": "b", "min": [40.0, 30.0], "max": [70.0, 50.0], "maskSize": [60, 40]},
        {"id": "c", "min": [15.0, 55.0], "max": [25.0, 75.0], "maskSize": [20, 40]},
    ]


def _masks(boxes):
    """Fully-filled silhouettes, one per entry."""
    return {b["id"]: np.ones((b["maskSize"][1], b["maskSize"][0]), dtype=bool) for b in boxes}


def _asymmetric_masks(boxes):
    """Silhouettes with no mirror symmetry on either axis.

    A fully-filled rectangle is invariant under a row-order flip, so it cannot
    discriminate ``maskRowsDown`` at all — the candidate table then ties at the
    top and the margin is legitimately 0. Any real silhouette is asymmetric, so
    the discrimination test uses a shape that is too.
    """
    masks = {}
    for b in boxes:
        w, h = b["maskSize"]
        m = np.zeros((h, w), dtype=bool)
        m[: int(h * 0.6), :] = True          # top-heavy: row order observable
        m[:, : int(w * 0.3)] = False         # left-clipped: column order observable
        masks[b["id"]] = m
    return masks


def test_iou_is_one_for_identical_masks():
    m = np.zeros((8, 8), dtype=bool)
    m[2:6, 2:6] = True
    assert iou(m, m) == pytest.approx(1.0)


def test_iou_is_zero_for_disjoint_masks():
    a = np.zeros((8, 8), dtype=bool)
    b = np.zeros((8, 8), dtype=bool)
    a[0:2, 0:2] = True
    b[6:8, 6:8] = True
    assert iou(a, b) == 0.0


def test_composite_coverage_paints_every_box():
    boxes = _boxes()
    bounds = {"min": [0.0, 0.0], "max": [100.0, 100.0]}
    cov = composite_coverage(boxes, _masks(boxes), bounds, Orientation("X", False, False),
                             100, 100, mask_rows_down=True)
    assert cov.shape == (100, 100)
    # 20x10 + 30x20 + 10x20 world units at 1 px per unit here.
    assert cov.sum() == pytest.approx(200 + 600 + 200, rel=0.05)


def test_find_shift_recovers_a_known_translation():
    boxes = _boxes()
    masks = _masks(boxes)
    o = Orientation("X", False, False)
    bounds = {"min": [0.0, 0.0], "max": [100.0, 100.0]}
    truth = composite_coverage(boxes, masks, bounds, o, 100, 100, mask_rows_down=True)
    # Shift the "land" by (+12, -7) px and check the search finds it back.
    land = np.zeros_like(truth)
    land[0:93, 12:100] = truth[7:100, 0:88]
    dpx, dpy, score = find_shift(truth, land)
    assert (dpx, dpy) == (12, -7)
    assert score > 0


def test_best_candidate_picks_the_right_orientation_and_reports_a_margin():
    boxes = _boxes()
    masks = _asymmetric_masks(boxes)
    o = Orientation("Y", False, True)
    seed = {"min": [0.0, 0.0], "max": [100.0, 100.0]}
    land = composite_coverage(boxes, masks, seed, o, 100, 100, mask_rows_down=True)
    result = best_candidate(boxes, masks, land, seed, 100, 100)
    assert result["orientation"] == o
    assert result["iou"] > 0.95
    assert result["margin"] > 0.0
    assert result["shift"] == (0, 0)


def test_land_mask_from_ink_keeps_the_dense_blob_and_drops_thin_border_art():
    """The primary land mask: dense ink is land, thin line art is decoration.

    The fixture mimics the map image — a bright parchment field, a dark densely
    inked landmass, and a one-pixel dark frame plus a thin diagonal flourish that
    a plain brightness threshold would happily include.
    """
    from vrising.maps.calibrate import land_mask_from_ink

    img = np.full((120, 120, 3), 200, dtype=np.uint8)   # parchment, high V
    img[30:90, 30:90] = 40                              # densely inked landmass
    img[0, :] = img[-1, :] = img[:, 0] = img[:, -1] = 30  # thin frame
    for i in range(120):                                # thin diagonal flourish
        img[i, min(119, i)] = 30
    land, fraction = land_mask_from_ink(img, density_size=9, density_thresh=0.5)
    assert land[60, 60]
    assert not land[5, 5]
    assert not land[0, 60]
    assert fraction == pytest.approx((60 * 60) / (120 * 120), abs=0.05)


def test_land_mask_from_flood_clears_an_edge_connected_border():
    img = np.zeros((10, 10, 3), dtype=np.uint8)   # black frame colour
    img[2:8, 2:8] = (200, 180, 140)               # parchment interior
    land, fraction = land_mask_from_flood(img, tol=30)
    assert land[5, 5]
    assert not land[0, 0]
    assert fraction == pytest.approx(36 / 100)
