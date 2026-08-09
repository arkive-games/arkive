from __future__ import annotations

import struct

from vrising.knowledge.rewards import _buffer_rows_at, _component_sequences
from vrising.markers.dots import BufferPatch, Chunk


class SceneStub:
    def __init__(self, data: bytes):
        self.data = data
        self.path = "synthetic.entities"


def test_component_sequence_deduplicates_same_validated_value_array():
    data = bytearray(256)
    values = (11, 22, 33)
    struct.pack_into("<3i", data, 64, *values)
    struct.pack_into("<3i", data, 96, *values)
    scene = SceneStub(bytes(data))
    chunk = Chunk(0, 0, len(data), 0, len(values))

    assert _component_sequences(scene, chunk, {11, 22, 33}.__contains__) == values


def test_external_only_guid_buffer_requires_serialized_patches():
    data = bytearray(256)
    struct.pack_into("<Qii", data, 64, 0, 2, 8)
    struct.pack_into("<Qii", data, 80, 0, 1, 8)
    first = BufferPatch(0, 0, 32, 2, 8, memoryview(struct.pack("<2i", 101, 102)))
    second = BufferPatch(0, 16, 32, 1, 8, memoryview(struct.pack("<i", 201)))
    scene = SceneStub(bytes(data))
    chunk = Chunk(0, 0, len(data), 0, 2)

    assert _buffer_rows_at(scene, chunk, 64, 0, {0: first, 16: second}) == (
        (101, 102),
        (201,),
    )


def test_internal_capacity_buffer_reads_inline_and_overflow_values():
    data = bytearray(512)
    struct.pack_into("<Qii", data, 64, 0, 2, 32)
    struct.pack_into("<2i", data, 80, 301, 302)
    second_header = 64 + 144
    struct.pack_into("<Qii", data, second_header, 0, 33, 64)
    overflow_values = tuple(range(400, 433))
    overflow = BufferPatch(
        0,
        second_header - 64,
        256,
        33,
        64,
        memoryview(struct.pack("<33i", *overflow_values)),
    )
    scene = SceneStub(bytes(data))
    chunk = Chunk(0, 0, len(data), 0, 2)

    assert _buffer_rows_at(
        scene,
        chunk,
        64,
        32,
        {second_header - 64: overflow},
    ) == ((301, 302), overflow_values)

