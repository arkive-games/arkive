"""Tests for the SerializedFile object-table index.

The fixture is a synthetic serialized file, so these run without the game. What they pin
down is the part that could quietly go wrong: reading a name that is not there. The index
must return ``None`` rather than a plausible-looking string whenever the layout assumption
fails, because a wrong name is worse than a missing one — it would send the export at the
wrong asset and look right doing it.
"""

from __future__ import annotations

import struct

import pytest

from ro3 import serialized


def build(objects: list[tuple[int, bytes]]) -> bytes:
    """A SerializedFile (version 22) holding ``(class_id, object_data)`` entries."""
    types = b""
    for class_id, _data in objects:
        types += struct.pack("<i", class_id)
        types += b"\x00"  # m_IsStrippedType
        types += struct.pack("<h", -1)  # m_ScriptTypeIndex
        if class_id == 114:
            types += b"\x00" * 16  # m_ScriptID
        types += b"\x00" * 16  # m_OldTypeHash
        types += struct.pack("<ii", 0, 0)  # no type-tree nodes, no string blob
        types += struct.pack("<i", 0)  # no dependencies

    head = (
        b"2022.3.62f3\x00"
        + struct.pack("<i", 19)  # platform
        + b"\x01"  # type tree enabled
        + struct.pack("<i", len(objects))
        + types
        + struct.pack("<i", len(objects))
    )

    # Each ObjectInfo is 4-byte aligned within the file, and the metadata starts at 48.
    payload = b""
    table = b""
    for i, (_class_id, data) in enumerate(objects):
        table += b"\x00" * (-(len(head) + len(table)) % 4)
        table += struct.pack("<qqii", 1000 + i, len(payload), len(data), i)
        payload += data

    metadata = head + table
    data_offset = 48 + len(metadata)
    header = struct.pack(">IIII", 0, 0, 22, 0)
    header += struct.pack(">QQQq", len(metadata), data_offset + len(payload), data_offset, 0)
    return header + metadata + payload


def named(name: str, before: bytes = b"") -> bytes:
    return before + struct.pack("<i", len(name)) + name.encode()


def test_reads_a_texture_name():
    blob = build([(28, named("territorywars_bg_cart01"))])
    entries = serialized.read_objects(blob)

    assert len(entries) == 1
    assert entries[0].class_id == 28
    assert entries[0].class_name == "Texture2D"
    assert entries[0].name == "territorywars_bg_cart01"
    assert entries[0].path_id == 1000


def test_reads_a_monobehaviour_name_past_its_fixed_prefix():
    """m_GameObject (12) + m_Enabled aligned (4) + m_Script (12) = 28 bytes before m_Name."""
    blob = build([(114, named("sc_izlu2dun_001_resources", before=b"\x00" * 28))])
    (entry,) = serialized.read_objects(blob)

    assert entry.class_name == "MonoBehaviour"
    assert entry.name == "sc_izlu2dun_001_resources"


def test_a_class_with_no_known_name_offset_is_unnamed():
    blob = build([(4, named("Transform"))])  # Transform is not in NAME_AT
    (entry,) = serialized.read_objects(blob)

    assert entry.class_name == "Transform"
    assert entry.name is None


def test_an_implausible_length_yields_no_name_rather_than_garbage():
    blob = build([(28, struct.pack("<i", 1 << 20) + b"whatever")])
    (entry,) = serialized.read_objects(blob)
    assert entry.name is None


def test_a_negative_length_yields_no_name():
    blob = build([(28, struct.pack("<i", -5) + b"whatever")])
    assert serialized.read_objects(blob)[0].name is None


def test_a_name_that_overruns_its_object_yields_no_name():
    """The declared length must fit inside the object's own byteSize, not just the file."""
    blob = build([(28, struct.pack("<i", 64) + b"short"), (28, named("neighbour"))])
    first, second = serialized.read_objects(blob)
    assert first.name is None
    assert second.name == "neighbour"


def test_a_non_printable_name_is_rejected():
    blob = build([(28, struct.pack("<i", 5) + b"ab\x01cd")])
    assert serialized.read_objects(blob)[0].name is None


def test_an_empty_name_reads_as_empty_not_as_missing():
    blob = build([(28, struct.pack("<i", 0))])
    assert serialized.read_objects(blob)[0].name == ""


def test_several_objects_keep_their_order_and_ids():
    blob = build([(28, named("first")), (49, named("second")), (21, named("third"))])
    entries = serialized.read_objects(blob)

    assert [e.name for e in entries] == ["first", "second", "third"]
    assert [e.path_id for e in entries] == [1000, 1001, 1002]
    assert [e.class_name for e in entries] == ["Texture2D", "TextAsset", "Material"]


def test_a_stripped_type_tree_is_refused():
    blob = bytearray(build([(28, named("x"))]))
    blob[48 + len(b"2022.3.62f3\x00") + 4] = 0  # typeTreeEnabled
    with pytest.raises(ValueError, match="type tree is stripped"):
        serialized.read_objects(bytes(blob))


def test_an_old_serialized_version_is_refused():
    blob = bytearray(build([(28, named("x"))]))
    struct.pack_into(">I", blob, 8, 17)
    with pytest.raises(ValueError, match="older than 22"):
        serialized.read_objects(bytes(blob))
