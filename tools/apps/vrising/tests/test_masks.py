from __future__ import annotations

import numpy as np
import pytest

from vrising.maps.masks import mask_to_rings, ring_area, rings_to_pixels
from vrising.maps.transform import Orientation


def _square_mask(n=40, pad=8):
    m = np.zeros((n, n), dtype=bool)
    m[pad:n - pad, pad:n - pad] = True
    return m


def test_a_filled_square_becomes_one_four_point_ring():
    rings = mask_to_rings(_square_mask())
    assert len(rings) == 1
    # Closed ring: first point repeated at the end.
    assert rings[0][0] == rings[0][-1]
    assert len(rings[0]) == 5


def test_two_blobs_become_two_rings_largest_first():
    m = np.zeros((60, 60), dtype=bool)
    m[5:15, 5:15] = True     # 100 px
    m[30:55, 30:55] = True   # 625 px
    rings = mask_to_rings(m)
    assert len(rings) == 2
    assert ring_area(rings[0]) > ring_area(rings[1])


def test_specks_below_the_area_floor_are_dropped():
    m = np.zeros((60, 60), dtype=bool)
    m[30:55, 30:55] = True
    m[1, 1] = True           # 1 px speck
    rings = mask_to_rings(m, min_area_px=16)
    assert len(rings) == 1


def test_an_empty_mask_yields_no_rings():
    assert mask_to_rings(np.zeros((20, 20), dtype=bool)) == []


def test_simplification_reduces_a_circle_but_keeps_it_convex_and_closed():
    yy, xx = np.mgrid[0:120, 0:120]
    circle = ((yy - 60) ** 2 + (xx - 60) ** 2) < 50 ** 2
    rings = mask_to_rings(circle)
    assert len(rings) == 1
    ring = rings[0]
    assert 8 <= len(ring) <= 64          # far fewer points than the raw contour
    assert ring[0] == ring[-1]
    assert ring_area(ring) == pytest.approx(np.pi * 50 ** 2, rel=0.1)


def test_rings_to_pixels_places_a_mask_inside_its_world_box():
    """A ring in mask-raster coords maps into map-pixel coords via the entry's
    world AABB and the map transform."""
    entry = {"min": [0.0, 0.0], "max": [100.0, 100.0], "maskSize": [50, 50]}
    bounds = {"min": [0.0, 0.0], "max": [200.0, 200.0]}
    o = Orientation("X", False, False)
    # Mask ring covering the whole raster -> the box's full extent in world
    # units (0..100), which on a 200-unit map at 400 px is pixels 0..200.
    ring = [[0.0, 0.0], [50.0, 0.0], [50.0, 50.0], [0.0, 50.0], [0.0, 0.0]]
    out = rings_to_pixels([ring], entry, bounds, o, 400, 400, mask_rows_down=True)
    xs = [p[0] for p in out[0]]
    ys = [p[1] for p in out[0]]
    assert min(xs) == pytest.approx(0.0, abs=0.01)
    assert max(xs) == pytest.approx(200.0, abs=0.01)
    # The box sits at world y 0..100 of a 0..200 map, and this orientation has
    # flipY=False, so pixel y runs 0..200 (not 200..400 — that would need flipY).
    assert min(ys) == pytest.approx(0.0, abs=0.01)
    assert max(ys) == pytest.approx(200.0, abs=0.01)


def test_rings_to_pixels_honours_the_mask_row_order():
    entry = {"min": [0.0, 0.0], "max": [100.0, 100.0], "maskSize": [50, 50]}
    bounds = {"min": [0.0, 0.0], "max": [100.0, 100.0]}
    o = Orientation("X", False, False)
    ring = [[0.0, 0.0], [50.0, 0.0], [50.0, 10.0], [0.0, 10.0], [0.0, 0.0]]
    down = rings_to_pixels([ring], entry, bounds, o, 100, 100, mask_rows_down=True)
    up = rings_to_pixels([ring], entry, bounds, o, 100, 100, mask_rows_down=False)
    # The same mask rows land on opposite halves of the box. mask_rows_down=True
    # means row 0 is the box's MAX world y, so under flipY=False these top rows
    # land at HIGH pixel y; mask_rows_down=False puts them at low pixel y.
    assert min(p[1] for p in down[0]) > 50.0
    assert max(p[1] for p in up[0]) < 50.0
