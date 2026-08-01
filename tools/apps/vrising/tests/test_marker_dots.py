from __future__ import annotations

import struct

from vrising.markers.dots import Archetype, DotsFile, DotsNode


def test_sparse_server_chunk_prefers_the_fully_validated_64k_layout():
    data = bytearray(65_536)
    struct.pack_into("<i", data, 0, 0)
    struct.pack_into("<i", data, 16, 3)

    scene = object.__new__(DotsFile)
    scene.path = "synthetic.entities"
    scene.data = bytes(data)
    scene.archetypes = (Archetype(entity_count=3, type_hashes=()),)
    node = DotsNode(
        node_id="chunks",
        data_offset=0,
        data_size=len(data),
        revision=None,
        children_count=0,
    )

    chunk_size, chunks = scene._parse_chunks(node)
    assert chunk_size == 65_536
    assert len(chunks) == 1
    assert chunks[0].entity_count == 3
