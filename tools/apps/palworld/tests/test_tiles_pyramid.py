"""Pyramid slicing: every level's file set and pixel size, on a tiny synthetic map."""
from pathlib import Path

from PIL import Image
import pytest

from palworld.maps import tiles


def test_slice_tiles_emits_all_pyramid_levels(tmp_path, monkeypatch):
    # Shrink the world: 8x8 grid of 32px tiles = 256px source, 3 halving levels.
    monkeypatch.setattr(tiles, "TILE", 32)
    monkeypatch.setattr(tiles, "MAP_IMAGES", {"Mini": "mini.png"})
    monkeypatch.setattr(tiles, "VOID_PARAMS", {"Mini": {"tol": 140, "inset": 0}})
    raw = tmp_path / "raw"
    raw.mkdir()
    Image.new("RGBA", (256, 256), (200, 60, 60, 255)).save(raw / "mini.png")
    res = tmp_path / "res"

    tiles.slice_tiles(raw, res)

    base = res / "tiles" / "Mini"
    assert len(list(base.glob("Mini_*.webp"))) == 64
    assert len(list((base / "z-1").glob("Mini_*.webp"))) == 16
    assert len(list((base / "z-2").glob("Mini_*.webp"))) == 4
    assert len(list((base / "z-3").glob("Mini_*.webp"))) == 1
    with Image.open(base / "z-3" / "Mini_00_00.webp") as im:
        assert im.size == (32, 32)  # whole map in one tile-sized image
    with Image.open(base / "z-1" / "Mini_03_03.webp") as im:
        assert im.size == (32, 32)


def test_grid_divides_cleanly_for_all_levels():
    # COUNT must halve LEVELS times without remainder (8 -> 4 -> 2 -> 1).
    assert tiles.COUNT % (1 << tiles.LEVELS) == 0


def test_run_tiles_fails_when_a_referenced_source_is_missing(tmp_path, monkeypatch):
    raw = tmp_path / "raw"
    data = tmp_path / "data"
    resource = tmp_path / "resource"
    raw.mkdir()
    data.mkdir()
    monkeypatch.setattr(tiles, "slice_tiles", lambda *_args: None)
    monkeypatch.setattr(tiles, "_collect_icon_names", lambda _data: {"missing_icon"})
    monkeypatch.setattr(tiles, "_collect_note_images", lambda _data: set())

    with pytest.raises(RuntimeError, match="icons: missing_icon"):
        tiles.run_tiles(raw, data, resource)
