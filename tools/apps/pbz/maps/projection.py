"""World -> map-UV projection, fitted to the game's own anchor table.

Phantom Blade Zero's area maps are hand-painted oblique landscapes, not
orthographic renders, so no single linear transform places a world point on
them: a global affine fit misses by up to half the map width. The game ships
the ground truth instead. ``Maps/GlobalMapAnchorData`` holds, per map, a dense
set of level-designer anchors pairing a world location with the UV it is drawn
at (7,500+ across 12 maps), and the map UI interpolates between them.

The interpolation here is a weighted local affine fit over the ``K`` nearest
anchors in 3D. Height has to take part: the paintings draw high ground further
up the picture, and including Z halves the error on the steep maps (measured by
holding out a tenth of the anchors: median 0.2-1.1% of the map width, p90 under
2.5%, against up to 12% for an XY-only fit).

A point whose nearest anchor is further than ``MAX_ANCHOR_DISTANCE`` lies
outside anything the designers mapped, so it is reported unplaced rather than
extrapolated onto the painting.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.spatial import cKDTree

K = 8
# World units (cm). Anchors are laid along every walkable path, roughly every
# 10-30 m; a point 150 m from all of them is in no mapped area.
MAX_ANCHOR_DISTANCE = 15000.0


@dataclass(frozen=True)
class Anchor:
    world: tuple[float, float, float]
    uv: tuple[float, float]
    layer: int


class AnchorProjection:
    """Projects world locations onto one map's UV space via its anchors."""

    def __init__(self, anchors: list[Anchor]):
        if len(anchors) < K:
            raise ValueError(f"need at least {K} anchors, got {len(anchors)}")
        self.world = np.array([a.world for a in anchors], dtype=float)
        self.uv = np.array([a.uv for a in anchors], dtype=float)
        self.tree = cKDTree(self.world)

    def nearest_distance(self, world: tuple[float, float, float]) -> float:
        return float(self.tree.query(world, k=1)[0])

    def project(self, world: tuple[float, float, float]) -> tuple[float, float] | None:
        """The UV ``world`` is drawn at, or ``None`` when no anchor is near it."""
        dist, idx = self.tree.query(world, k=K)
        if dist[0] > MAX_ANCHOR_DISTANCE:
            return None
        weights = 1.0 / (dist + 1.0)
        design = np.c_[self.world[idx], np.ones(K)] * weights[:, None]
        target = self.uv[idx] * weights[:, None]
        coef, *_ = np.linalg.lstsq(design, target, rcond=None)
        u, v = np.r_[world, 1.0] @ coef
        # A local fit over nearly collinear anchors can overshoot wildly; the
        # nearest anchor's UV is the honest fallback for such a point.
        if not np.isfinite(u) or np.hypot(u - self.uv[idx[0], 0], v - self.uv[idx[0], 1]) > 0.1:
            u, v = self.uv[idx[0]]
        return float(np.clip(u, 0.0, 1.0)), float(np.clip(v, 0.0, 1.0))


def anchors_from_asset(asset: list[dict]) -> dict[str, list[Anchor]]:
    """``{MapID: anchors}`` from the exported ``GlobalMapAnchorData`` package."""
    out: dict[str, list[Anchor]] = {}
    for entry in asset[0]["Properties"]["MapData"]:
        out[entry["Key"]] = [
            Anchor(
                world=(a["WorldLocation"]["X"], a["WorldLocation"]["Y"], a["WorldLocation"]["Z"]),
                uv=(a["MapUV"]["X"], a["MapUV"]["Y"]),
                layer=a["MapLayer"],
            )
            for a in entry["Value"]["AnchorData"]
        ]
    return out
