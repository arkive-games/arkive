from __future__ import annotations

import struct

from vrising.markers.bosses import _patrol_nodes_at


def _version_4_guid(seed: int) -> bytes:
    value = bytearray([seed] * 16)
    value[6] = 0x40 | (seed & 0x0F)
    value[8] = 0x80 | (seed & 0x3F)
    return bytes(value)


def test_inline_patrol_nodes_keep_order_and_use_chunk_centres():
    data = bytearray(256)
    struct.pack_into("<Qii", data, 64, 0, 2, 6)
    struct.pack_into("<bbH", data, 80, 5, 18, 0)
    data[84:100] = _version_4_guid(1)
    struct.pack_into("<bbH", data, 100, 6, 19, 0)
    data[104:120] = _version_4_guid(2)

    parsed = _patrol_nodes_at(bytes(data), 64, 1, {})

    assert parsed is not None
    assert [(node.chunk_x, node.chunk_y) for node in parsed[0]] == [(5, 18), (6, 19)]
    assert parsed[0][0].world_position == (-2320.0, 0.0, -240.0)
    assert parsed[0][1].world_position == (-2160.0, 0.0, -80.0)


def test_non_guid_buffer_is_not_mistaken_for_a_patrol_route():
    data = bytearray(256)
    struct.pack_into("<Qii", data, 64, 0, 1, 6)
    struct.pack_into("<bbH", data, 80, 5, 18, 0)
    data[84:100] = bytes.fromhex("00000000640000000000000001000000")

    assert _patrol_nodes_at(bytes(data), 64, 1, {}) is None
