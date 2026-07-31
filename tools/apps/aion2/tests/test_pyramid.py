"""Tile-pyramid generation for the aion2 world maps.

The load-bearing property here is that the slicer's tile counts match what the
engines ask for. Both engines locate a level-L tile with
``ceil(count / 2**L)`` (GameMapTiles.resolveTileCoords, tileLayer.update), so a
slicer that truncates -- which is what palworld's ``COUNT >> lvl`` does, and it
is correct there only because 8 is a power of two -- would leave aion2's 5x5
map short a row and a column, and every request for them would 404.
"""

from __future__ import annotations

import math

import pytest
from PIL import Image

from aion2.tools.assets import pyramid
from aion2.tools.assets.pyramid import TILE, build_map_pyramid, pyramid_levels, stitch


def _make_map(dir_, name, tiles_x, tiles_y, tile=TILE):
    dir_.mkdir(parents=True, exist_ok=True)
    for x in range(tiles_x):
        for y in range(tiles_y):
            # A per-tile colour so stitch order is verifiable.
            Image.new("RGBA", (tile, tile), (x * 10 % 256, y * 10 % 256, 128, 255)).save(
                dir_ / f"{name}_{x:02d}_{y:02d}.png"
            )


@pytest.fixture(autouse=True)
def _small_tiles(monkeypatch):
    """Shrink TILE so the fixtures are fast; the maths is size-independent."""
    monkeypatch.setattr(pyramid, "TILE", 16)
    return 16


class TestPyramidLevels:
    @pytest.mark.parametrize(
        "grid,expected",
        [
            ((8, 8), 3),  # the big world maps: 8 -> 4 -> 2 -> 1
            ((5, 5), 3),  # ceil(log2(5)) == 3: 5 -> 3 -> 2 -> 1
            ((4, 4), 2),  # 4 -> 2 -> 1
            ((2, 2), 1),  # 2 -> 1
            ((1, 1), 0),  # nothing to downscale
        ],
    )
    def test_depth_stops_at_a_single_tile(self, grid, expected):
        assert pyramid_levels(*grid) == expected

    def test_clamped_to_the_engine_zoom_floor(self):
        """The engines clamp at map zoom -3, so deeper levels are never asked for."""
        assert pyramid_levels(64, 64) == 3

    def test_non_square_uses_the_longer_edge(self):
        assert pyramid_levels(8, 2) == 3


class TestStitch:
    def test_composes_the_grid(self, tmp_path, _small_tiles):
        _make_map(tmp_path, "M", 3, 2, tile=_small_tiles)
        img, tx, ty = stitch(tmp_path, "M")
        assert (tx, ty) == (3, 2)
        assert img.size == (3 * _small_tiles, 2 * _small_tiles)

    def test_returns_none_without_tiles(self, tmp_path):
        tmp_path.mkdir(parents=True, exist_ok=True)
        assert stitch(tmp_path, "M") is None

    def test_ignores_another_maps_tiles_in_the_same_dir(self, tmp_path, _small_tiles):
        _make_map(tmp_path, "M", 2, 2, tile=_small_tiles)
        _make_map(tmp_path, "M_Design", 4, 4, tile=_small_tiles)
        _, tx, ty = stitch(tmp_path, "M")
        assert (tx, ty) == (2, 2)


class TestBuildMapPyramid:
    def _counts(self, dest, level):
        return len(list((dest / f"z-{level}").glob("*.webp")))

    def test_power_of_two_grid(self, tmp_path, _small_tiles):
        src, dest = tmp_path / "src", tmp_path / "dest"
        _make_map(src, "M", 8, 8, tile=_small_tiles)
        levels, written = build_map_pyramid(src, dest, "M")
        assert levels == 3
        assert (self._counts(dest, 1), self._counts(dest, 2), self._counts(dest, 3)) == (16, 4, 1)
        assert written == 21

    def test_odd_grid_uses_ceiling_not_truncation(self, tmp_path, _small_tiles):
        """The 5x5 map. Truncation would write 2x2 at z-1; the engine asks 3x3."""
        src, dest = tmp_path / "src", tmp_path / "dest"
        _make_map(src, "M", 5, 5, tile=_small_tiles)
        build_map_pyramid(src, dest, "M")
        for level in (1, 2, 3):
            expected = math.ceil(5 / 2**level) ** 2
            assert self._counts(dest, level) == expected, f"z-{level}"
        # Explicitly: the tile truncation would have skipped must exist.
        assert (dest / "z-1" / "M_02_02.webp").exists()

    def test_edge_tiles_are_padded_to_a_full_tile(self, tmp_path, _small_tiles):
        """A partial edge tile still has to be TILE-sized or the engine's quad
        geometry, which assumes a uniform tile, would sample past the image."""
        src, dest = tmp_path / "src", tmp_path / "dest"
        _make_map(src, "M", 5, 5, tile=_small_tiles)
        build_map_pyramid(src, dest, "M")
        with Image.open(dest / "z-1" / "M_02_02.webp") as edge:
            assert edge.size == (_small_tiles, _small_tiles)

    def test_level_zero_is_never_touched(self, tmp_path, _small_tiles):
        """Level 0 stays where it is so no existing tile URL changes."""
        src, dest = tmp_path / "src", tmp_path / "dest"
        _make_map(src, "M", 4, 4, tile=_small_tiles)
        build_map_pyramid(src, dest, "M")
        assert not (dest / "M_00_00.webp").exists()
        assert sorted(p.name for p in dest.iterdir()) == ["z-1", "z-2"]

    def test_single_tile_map_gets_no_pyramid(self, tmp_path, _small_tiles):
        src, dest = tmp_path / "src", tmp_path / "dest"
        _make_map(src, "M", 1, 1, tile=_small_tiles)
        levels, written = build_map_pyramid(src, dest, "M")
        assert (levels, written) == (0, 0)

    def test_no_tiles_is_a_no_op(self, tmp_path):
        src, dest = tmp_path / "src", tmp_path / "dest"
        src.mkdir(parents=True)
        assert build_map_pyramid(src, dest, "M") == (0, 0)
        assert not dest.exists()

    def test_rerun_is_idempotent(self, tmp_path, _small_tiles):
        src, dest = tmp_path / "src", tmp_path / "dest"
        _make_map(src, "M", 4, 4, tile=_small_tiles)
        build_map_pyramid(src, dest, "M")
        _, written = build_map_pyramid(src, dest, "M")
        assert written == 0

    def test_force_rewrites(self, tmp_path, _small_tiles):
        src, dest = tmp_path / "src", tmp_path / "dest"
        _make_map(src, "M", 4, 4, tile=_small_tiles)
        build_map_pyramid(src, dest, "M")
        _, written = build_map_pyramid(src, dest, "M", force=True)
        assert written == 5  # 4 at z-1 + 1 at z-2

    def test_an_incomplete_level_is_rebuilt(self, tmp_path, _small_tiles):
        """A half-written level must not be mistaken for a finished one."""
        src, dest = tmp_path / "src", tmp_path / "dest"
        _make_map(src, "M", 4, 4, tile=_small_tiles)
        build_map_pyramid(src, dest, "M")
        (dest / "z-1" / "M_00_00.webp").unlink()
        _, written = build_map_pyramid(src, dest, "M")
        assert written == 4

    def test_oversized_square_tiles_are_normalised(self, tmp_path, _small_tiles):
        """World_L_A: 2048px raw art against a declared tileWidth of 1024.

        The conversion caps those at TILE, so the pyramid must too -- otherwise
        level 1 would be built from a map twice the size of the level 0 it sits
        above, and every pyramid tile would be offset.
        """
        src, dest = tmp_path / "src", tmp_path / "dest"
        _make_map(src, "M", 2, 2, tile=_small_tiles * 2)
        img, tx, ty = stitch(src, "M")
        assert (tx, ty) == (2, 2)
        assert img.size == (2 * _small_tiles, 2 * _small_tiles)

    def test_rejects_tiles_smaller_than_the_tile_size(self, tmp_path, _small_tiles):
        """Upscaling would invent detail; skip the map instead."""
        src, dest = tmp_path / "src", tmp_path / "dest"
        _make_map(src, "M", 2, 2, tile=_small_tiles // 2)
        with pytest.raises(pyramid.UnexpectedTileSize, match="square"):
            build_map_pyramid(src, dest, "M")

    def test_rejects_non_square_tiles(self, tmp_path, _small_tiles):
        src, dest = tmp_path / "src", tmp_path / "dest"
        src.mkdir(parents=True, exist_ok=True)
        Image.new("RGBA", (_small_tiles * 2, _small_tiles), (1, 2, 3, 255)).save(
            src / "M_00_00.png"
        )
        with pytest.raises(pyramid.UnexpectedTileSize, match="square"):
            build_map_pyramid(src, dest, "M")

    def test_an_unexpected_size_is_raised_not_fatal(self, tmp_path, _small_tiles):
        """The walker skips such a map and keeps going.

        The export carries far more maps than the site ships and some use other
        tile sizes, so aborting on the first one would silently leave every
        later map without a pyramid.
        """
        assert issubclass(pyramid.UnexpectedTileSize, ValueError)
        assert not issubclass(pyramid.UnexpectedTileSize, SystemExit)
