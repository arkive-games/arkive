from __future__ import annotations

import pytest

from vrising.maps.transform import (
    Orientation,
    make_inverse_transform,
    make_transform,
    translate_bounds_by_pixels,
)

BOUNDS = {"min": [-2850.0, -2297.5], "max": [190.0, 742.5]}
SIZE = 6080.0


def test_identity_orientation_maps_min_to_origin_and_max_to_the_far_corner():
    t = make_transform(BOUNDS, Orientation("X", False, False), SIZE, SIZE)
    assert t(-2850.0, -2297.5) == pytest.approx((0.0, 0.0))
    assert t(190.0, 742.5) == pytest.approx((6080.0, 6080.0))


def test_flip_y_mirrors_the_vertical_axis():
    t = make_transform(BOUNDS, Orientation("X", False, True), SIZE, SIZE)
    assert t(-2850.0, -2297.5) == pytest.approx((0.0, 6080.0))
    assert t(-2850.0, 742.5) == pytest.approx((0.0, 0.0))


def test_px_axis_y_swaps_which_world_axis_drives_pixel_x():
    t = make_transform(BOUNDS, Orientation("Y", False, False), SIZE, SIZE)
    # world y drives pixel x, world x drives pixel y
    assert t(-2850.0, 742.5) == pytest.approx((6080.0, 0.0))


def test_inverse_round_trips_every_orientation():
    for px_axis in ("X", "Y"):
        for flip_x in (False, True):
            for flip_y in (False, True):
                o = Orientation(px_axis, flip_x, flip_y)
                t = make_transform(BOUNDS, o, SIZE, SIZE)
                inv = make_inverse_transform(BOUNDS, o, SIZE, SIZE)
                for wx, wy in ((-2000.0, -1000.0), (0.0, 500.0), (-2850.0, -2297.5)):
                    px, py = t(wx, wy)
                    assert inv(px, py) == pytest.approx((wx, wy)), o


def test_translate_bounds_by_pixels_moves_content_the_requested_way():
    """Shifting bounds so the rendered content moves +dpx/+dpy on the canvas.

    This is the operation the offset search needs: it finds a pixel shift and
    must convert it back into a worldBounds change without hand-deriving signs
    per orientation.
    """
    o = Orientation("X", False, False)
    moved = translate_bounds_by_pixels(BOUNDS, o, SIZE, SIZE, 152.0, -76.0)
    t0 = make_transform(BOUNDS, o, SIZE, SIZE)
    t1 = make_transform(moved, o, SIZE, SIZE)
    p0 = t0(-2000.0, -1000.0)
    p1 = t1(-2000.0, -1000.0)
    assert (p1[0] - p0[0], p1[1] - p0[1]) == pytest.approx((152.0, -76.0))


def test_translate_bounds_by_pixels_is_correct_under_a_swapped_flipped_orientation():
    o = Orientation("Y", True, True)
    moved = translate_bounds_by_pixels(BOUNDS, o, SIZE, SIZE, -40.0, 25.0)
    t0 = make_transform(BOUNDS, o, SIZE, SIZE)
    t1 = make_transform(moved, o, SIZE, SIZE)
    p0 = t0(-1500.0, -800.0)
    p1 = t1(-1500.0, -800.0)
    assert (p1[0] - p0[0], p1[1] - p0[1]) == pytest.approx((-40.0, 25.0))
