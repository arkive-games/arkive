from __future__ import annotations

import pytest

from vrising.markers.dots import DotsFormatError
from vrising.markers.extract import read_scene_guid, rotate_local_position, world_position


@pytest.mark.parametrize(
    ("rotation", "expected"),
    [
        (0, (10.0, 20.0)),
        (90, (20.0, 150.0)),
        (180, (150.0, 140.0)),
        (270, (140.0, 10.0)),
    ],
)
def test_terrain_rotation_is_around_the_tile_centre(rotation, expected):
    assert rotate_local_position(10.0, 20.0, rotation) == expected


def test_world_position_applies_rotation_then_the_chunk_offset():
    assert world_position((10.0, -5.0, 20.0), (10, 10), 90) == (
        -1580.0,
        -5.0,
        -1450.0,
    )


def test_unsupported_rotation_fails_instead_of_guessing():
    with pytest.raises(DotsFormatError, match="45"):
        rotate_local_position(1.0, 2.0, 45)


def test_scene_guid_is_read_from_the_entity_header(tmp_path):
    data = bytearray(0x64)
    data[0x54:0x64] = bytes.fromhex("10b82e36477dda499dc9756e735fcc24")
    path = tmp_path / "scene.entityheader"
    path.write_bytes(data)
    assert read_scene_guid(path) == "10b82e36477dda499dc9756e735fcc24"


def test_truncated_scene_header_fails_explicitly(tmp_path):
    path = tmp_path / "scene.entityheader"
    path.write_bytes(b"short")
    with pytest.raises(DotsFormatError, match="truncated"):
        read_scene_guid(path)
