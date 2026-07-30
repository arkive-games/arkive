"""World<->pixel coordinate transform for the Vardoran map.

Same shape as palworld's (``tools/apps/palworld/maps/transform.py``) and as the
frontend's ``worldToPixel`` in ``packages/map-engine/src/coords.ts``: a pure
linear map from a world AABB onto the full pixel grid, with an axis choice and
two flips. That is exactly what ``@gamemap/data-contract``'s ``MapOrientation``
can carry — no rotation, no shear. Keep the three implementations in agreement:
the pipeline emits the bounds, the contract transports them, the engine replays
the transform on every marker.

Coordinates here are positional ``(x, y)`` floats rather than palworld's
``{"X": …, "Y": …}`` dicts because V Rising's source values are ``float2``.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

Bounds = dict  # {"min": [x, y], "max": [x, y]}


@dataclass(frozen=True)
class Orientation:
    px_axis: str  # "X" or "Y": which world coordinate drives pixel-x
    flip_x: bool
    flip_y: bool

    def as_json(self) -> dict:
        return {"pxAxis": self.px_axis, "flipX": self.flip_x, "flipY": self.flip_y}


ALL_ORIENTATIONS: list[Orientation] = [
    Orientation(px_axis, flip_x, flip_y)
    for px_axis in ("X", "Y")
    for flip_x in (False, True)
    for flip_y in (False, True)
]


def _axes(o: Orientation) -> tuple[int, int]:
    """Indices into ``[x, y]`` for (the axis driving pixel-x, the one driving pixel-y)."""
    return (0, 1) if o.px_axis == "X" else (1, 0)


def make_transform(
    bounds: Bounds, o: Orientation, pixel_w: float, pixel_h: float
) -> Callable[[float, float], tuple[float, float]]:
    """World ``(x, y)`` -> pixel ``(px, py)``, pixel row 0 at the top."""
    mn, mx = bounds["min"], bounds["max"]
    ix, iy = _axes(o)

    def to_pixel(wx: float, wy: float) -> tuple[float, float]:
        world = (wx, wy)
        px = (world[ix] - mn[ix]) / (mx[ix] - mn[ix]) * pixel_w
        py = (world[iy] - mn[iy]) / (mx[iy] - mn[iy]) * pixel_h
        if o.flip_x:
            px = pixel_w - px
        if o.flip_y:
            py = pixel_h - py
        return px, py

    return to_pixel


def make_inverse_transform(
    bounds: Bounds, o: Orientation, pixel_w: float, pixel_h: float
) -> Callable[[float, float], tuple[float, float]]:
    """Pixel ``(px, py)`` -> world ``(x, y)``. Exact inverse of :func:`make_transform`."""
    mn, mx = bounds["min"], bounds["max"]
    ix, iy = _axes(o)

    def to_world(px: float, py: float) -> tuple[float, float]:
        fx, fy = px, py
        if o.flip_x:
            fx = pixel_w - fx
        if o.flip_y:
            fy = pixel_h - fy
        world = [0.0, 0.0]
        world[ix] = fx / pixel_w * (mx[ix] - mn[ix]) + mn[ix]
        world[iy] = fy / pixel_h * (mx[iy] - mn[iy]) + mn[iy]
        return world[0], world[1]

    return to_world


def translate_bounds_by_pixels(
    bounds: Bounds, o: Orientation, pixel_w: float, pixel_h: float, dpx: float, dpy: float
) -> Bounds:
    """Bounds whose rendered content sits ``(dpx, dpy)`` px further along.

    The offset search finds a shift in PIXELS and has to express it as a change
    to ``worldBounds``. Deriving the signs by hand per orientation is exactly the
    kind of thing that produces a mirrored map, so instead measure the world
    displacement of that pixel delta with the inverse transform and subtract it:
    moving the window back moves the content forward.
    """
    inv = make_inverse_transform(bounds, o, pixel_w, pixel_h)
    w0 = inv(0.0, 0.0)
    w1 = inv(dpx, dpy)
    dwx, dwy = w1[0] - w0[0], w1[1] - w0[1]
    mn, mx = bounds["min"], bounds["max"]
    return {
        "min": [mn[0] - dwx, mn[1] - dwy],
        "max": [mx[0] - dwx, mx[1] - dwy],
    }
