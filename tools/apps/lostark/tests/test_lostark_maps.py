"""Contract tests for zone map extraction.

Built on synthetic ``.loa`` bytes rather than the client files, so they run on a
machine with no extraction and pin the byte layout explicitly.
"""

import struct

import pytest

from lostark.loa import Bounds, finite, strings
from lostark.maps import (
    Actor,
    MinimapVolume,
    Tile,
    map_meta,
    markers,
    read_actors,
    read_minimap,
    types,
    world_to_pixel,
)

TILE_WORLD = 5120.0


def _string(text: str) -> bytes:
    raw = text.encode("ascii") + b"\x00"
    return struct.pack("<i", len(raw)) + raw


def _tile_record(name: str, box: tuple[float, ...], col: int, row: int) -> bytes:
    return _string(name) + struct.pack("<6f", *box) + struct.pack("<2i", col + 1, row)


def _minimap_bytes(stem: str, cols: int, rows: int) -> bytes:
    """A volume whose world X DECREASES as the name's first index increases.

    That inversion is the whole point: it is what makes the ``<a>x<b>`` suffix
    unusable as a pixel grid position.
    """
    out = _string("CEFMinimapVolume") + _string(stem) + _string(f"{stem}_Full")
    out += struct.pack("<i", cols * rows) + b"\x00" * 16
    for a in range(cols):
        for b in range(rows):
            min_x = -TILE_WORLD * (a + 1)
            min_y = TILE_WORLD * b
            out += _tile_record(
                f"{stem}_{a}x{b}",
                (min_x, min_y, -100.0, min_x + TILE_WORLD, min_y + TILE_WORLD, 100.0),
                a,
                b,
            )
    return out


def _deploy_bytes(entries: list[tuple[str, float, float]]) -> bytes:
    out = b""
    for cls, x, y in entries:
        out += b"CEFDeployActor_" + cls.encode("ascii") + b"\x00"
        out += struct.pack("<ff", x, y) + b"\x00" * 16
    return out


@pytest.fixture
def volume(tmp_path):
    path = tmp_path / "MinimapData.loa"
    path.write_bytes(_minimap_bytes("LV_TEST_PS_0", cols=3, rows=2))
    got = read_minimap(path, "999")
    assert got is not None
    return got


def test_reads_every_tile_with_its_world_box(volume):
    assert len(volume.tiles) == 6
    assert volume.texture_stem == "LV_TEST_PS_0"
    assert volume.cols == 3
    assert volume.rows == 2


def test_grid_slots_come_from_bounds_not_the_name(volume):
    """Tile ``0x0`` holds the highest X, so it belongs at the RIGHT edge.

    Placing it at column 0 because its name starts with 0 mirrors the art across
    tile boundaries - the defect that shipped a scrambled map until the layout
    was derived from each tile's AABB instead.
    """
    slots = volume.placements()
    assert set(slots) == {(c, r) for c in range(3) for r in range(2)}
    assert slots[(2, 1)].name == "LV_TEST_PS_0_0x0"
    assert slots[(0, 1)].name == "LV_TEST_PS_0_2x0"


def test_row_zero_is_the_highest_world_y(volume):
    """Image rows run downward while world Y runs up, hence flipY."""
    slots = volume.placements()
    assert slots[(0, 0)].bounds.min_y > slots[(0, 1)].bounds.min_y


def test_map_meta_declares_the_verified_orientation(volume):
    meta = map_meta(volume, 256, "Test Zone")
    assert meta["tilesCountX"] == 3
    assert meta["tilesCountY"] == 2
    assert meta["orientation"] == {"pxAxis": "X", "flipX": False, "flipY": True}
    assert meta["worldBounds"]["min"]["x"] == -TILE_WORLD * 3


def test_world_to_pixel_matches_the_declared_grid(volume):
    """Corners must land on the grid's corners, with Y flipped."""
    box = volume.bounds
    width, height = 3 * 256, 2 * 256
    top_left = world_to_pixel(volume, 256, box.min_x, box.max_y)
    bottom_right = world_to_pixel(volume, 256, box.max_x, box.min_y)
    assert top_left == pytest.approx((0.0, 0.0))
    assert bottom_right == pytest.approx((width, height))


def test_reads_actor_positions_and_maps_classes(tmp_path, volume):
    path = tmp_path / "DeployData.loa"
    path.write_bytes(
        _deploy_bytes(
            [
                ("NPC", -1000.0, 1000.0),
                ("Prop", -2000.0, 2000.0),
                ("PathNode", -3000.0, 3000.0),  # deliberately not mapped
            ]
        )
    )
    got = read_actors(path, volume.bounds)
    assert [a.subtype for a in got] == ["npc", "prop"]
    assert got[0].x == pytest.approx(-1000.0)


def test_drops_actors_outside_the_volume(tmp_path, volume):
    """Dropped rather than clamped: a clamped point is a silent lie on the map."""
    path = tmp_path / "DeployData.loa"
    path.write_bytes(_deploy_bytes([("NPC", -999_000.0, 0.0), ("NPC", -1000.0, 1000.0)]))
    assert len(read_actors(path, volume.bounds)) == 1


def test_markers_carry_the_shared_contract_fields():
    rows = markers([Actor("npc", 1.0, 2.0), Actor("npc", 3.0, 4.0)])
    assert rows[0]["subtype"] == "npc"
    assert [r["indexInSubtype"] for r in rows] == [0, 1]
    assert rows[0]["images"] == [] and rows[0]["contributors"] == []


def test_types_only_lists_subtypes_present():
    taxonomy = types([Actor("npc", 0.0, 0.0), Actor("portal", 0.0, 0.0)])
    ids = [s["id"] for s in taxonomy["categories"][0]["subtypes"]]
    assert ids == ["npc", "portal"]


def test_finite_rejects_garbage_read_at_a_wrong_offset():
    assert finite(1.0, -2.5)
    assert not finite(float("nan"))
    assert not finite(1e12)


def test_strings_survey_finds_the_names():
    found = [text for _, text in strings(_string("CEFMinimapVolume") + _string("LV_A_0x0"))]
    assert found == ["CEFMinimapVolume", "LV_A_0x0"]


def test_bounds_union_and_containment():
    a = Bounds(0, 0, 0, 10, 10, 1)
    b = Bounds(-5, -5, 0, 5, 5, 1)
    assert a.union(b) == Bounds(-5, -5, 0, 10, 10, 1)
    assert a.contains(5, 5) and not a.contains(-1, 5)


def test_rejects_a_ragged_tile_size_instead_of_trusting_the_first(tmp_path):
    """One odd-sized tile would otherwise set the lattice for the whole map."""
    body = _string("CEFMinimapVolume") + _string("LV_R_PS_0") + _string("LV_R_PS_0_Full")
    body += _tile_record("LV_R_PS_0_0x0", (0, 0, 0, 5120, 5120, 1), 0, 0)
    body += _tile_record("LV_R_PS_0_1x0", (5120, 0, 0, 7680, 5120, 1), 1, 0)
    path = tmp_path / "MinimapData.loa"
    path.write_bytes(body)
    volume = read_minimap(path, "1")
    with pytest.raises(ValueError, match="not the volume"):
        volume.placements()


def test_rejects_two_tiles_claiming_one_slot(tmp_path):
    body = _string("CEFMinimapVolume") + _string("LV_D_PS_0") + _string("LV_D_PS_0_Full")
    body += _tile_record("LV_D_PS_0_0x0", (0, 0, 0, 5120, 5120, 1), 0, 0)
    body += _tile_record("LV_D_PS_0_1x0", (0, 0, 0, 5120, 5120, 1), 1, 0)
    path = tmp_path / "MinimapData.loa"
    path.write_bytes(body)
    volume = read_minimap(path, "1")
    with pytest.raises(ValueError, match="both claim slot"):
        volume.placements()


def test_rejects_a_tile_off_the_lattice(tmp_path):
    """Half a slot off would round into a neighbour, file order deciding which."""
    body = _string("CEFMinimapVolume") + _string("LV_O_PS_0") + _string("LV_O_PS_0_Full")
    body += _tile_record("LV_O_PS_0_0x0", (0, 0, 0, 5120, 5120, 1), 0, 0)
    body += _tile_record("LV_O_PS_0_1x0", (7680, 0, 0, 12800, 5120, 1), 1, 0)
    path = tmp_path / "MinimapData.loa"
    path.write_bytes(body)
    volume = read_minimap(path, "1")
    with pytest.raises(ValueError, match="lattice|outside the declared"):
        volume.placements()


def test_ignores_strings_that_merely_end_in_digits_x_digits(tmp_path):
    """Only the stem the `_Full` record declares counts as a tile."""
    body = _string("CEFMinimapVolume") + _string("LV_G_PS_0") + _string("LV_G_PS_0_Full")
    body += _tile_record("LV_G_PS_0_0x0", (0, 0, 0, 5120, 5120, 1), 0, 0)
    body += _tile_record("Noise_3x4", (0, 0, 0, 0, 0, 0), 3, 4)
    path = tmp_path / "MinimapData.loa"
    path.write_bytes(body)
    volume = read_minimap(path, "1")
    assert [t.name for t in volume.tiles] == ["LV_G_PS_0_0x0"]


def test_uniform_tile_span_is_read_from_a_tile():
    volume = MinimapVolume(
        map_id="1",
        texture_stem="S",
        tiles=[Tile("S_0x0", Bounds(0, 0, 0, 128, 64, 1))],
    )
    assert volume.tile_span == (128.0, 64.0)
