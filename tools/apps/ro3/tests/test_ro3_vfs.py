"""Tests for the RO3V container reader.

The fixtures are synthetic: they encode the layout claimed in :mod:`ro3.vfs` so a
regression shows up as a failing test rather than as silently empty extraction. The
layout itself was validated separately against the shipped tree (4,852 containers,
187,734 embedded bundles, no mismatches).
"""

from __future__ import annotations

import struct

import pytest

from ro3.vfs import HEADER_LEN, Ro3vError, classify, classify_path, iter_bundles, read_index, read_slice


def build(*payloads: bytes) -> bytes:
    """Assemble a container exactly as the game ships them."""
    body = b"".join(payloads)
    offsets = []
    cursor = HEADER_LEN
    for payload in payloads:
        offsets.append(cursor)
        cursor += len(payload)
    index_offset = cursor

    index = struct.pack("<I", len(payloads))
    for i, offset in enumerate(offsets):
        index += struct.pack("<QQ", 0xA000_0000_0000_0000 | i, offset)
    index += struct.pack("<Q", index_offset)

    header = struct.pack("<4sIQQ", b"RO3V", 1, index_offset, len(index))
    return header + body + index


def unityfs(size: int, filler: bytes = b"\0") -> bytes:
    magic = b"UnityFS\0"
    return magic + (filler * (size - len(magic)))


def test_index_recovers_every_sub_file_extent():
    data = build(unityfs(3175), unityfs(2104))
    slices = read_index_bytes(data)

    assert [(s.offset, s.length) for s in slices] == [(24, 3175), (24 + 3175, 2104)]


def read_index_bytes(data: bytes, tmp_path=None):
    """read_index takes a path, so round-trip through a temp file."""
    import tempfile
    from pathlib import Path

    with tempfile.NamedTemporaryFile(suffix=".bundle", delete=False) as fh:
        fh.write(data)
        path = Path(fh.name)
    try:
        return read_index(path)
    finally:
        path.unlink()


def test_index_length_matches_the_shipped_formula():
    data = build(unityfs(16))
    _magic, _version, index_offset, index_length = struct.unpack("<4sIQQ", data[:HEADER_LEN])

    assert index_length == 4 + 1 * 16 + 8
    assert index_offset + index_length == len(data)


def test_classify_separates_the_three_payloads():
    assert classify(build(unityfs(16))) == "ro3v"
    assert classify(unityfs(64)) == "unityfs"
    # HPY is the other format in the VFS and is not a Unity bundle.
    assert classify(b"HPY\0" + b"\0" * 20) == "hpy"
    assert classify(b"RIFF" + b"\0" * 20) == "other"


def test_corrupt_back_pointer_is_rejected():
    data = bytearray(build(unityfs(32)))
    index_offset = struct.unpack_from("<Q", data, 8)[0]
    struct.pack_into("<Q", data, len(data) - 8, index_offset + 1)

    with pytest.raises(Ro3vError, match="back-pointer"):
        read_index_bytes(bytes(data))


def test_truncated_container_is_rejected():
    data = build(unityfs(64))
    with pytest.raises(Ro3vError):
        read_index_bytes(data[:-4])


def test_read_slice_returns_only_that_sub_file(tmp_path):
    first = unityfs(64, b"\x11")
    second = unityfs(48, b"\x22")
    path = tmp_path / "abc.bundle"
    path.write_bytes(build(first, second))

    slices = read_index(path)
    assert read_slice(path, slices[0]) == first
    assert read_slice(path, slices[1]) == second


def test_iter_bundles_skips_hpy_and_expands_containers(tmp_path):
    (tmp_path / "00").mkdir()
    (tmp_path / "00" / "a.bundle").write_bytes(build(unityfs(32), unityfs(48)))
    (tmp_path / "00" / "b.bundle").write_bytes(b"HPY\0" + b"\0" * 60)
    (tmp_path / "c.bundle").write_bytes(unityfs(80))

    found = list(iter_bundles(tmp_path))
    names = sorted((p.name, s.length if s else None) for p, s in found)

    assert names == [("a.bundle", 32), ("a.bundle", 48), ("c.bundle", None)]


def test_classify_path_reads_from_disk(tmp_path):
    path = tmp_path / "x.bundle"
    path.write_bytes(build(unityfs(32)))
    assert classify_path(path) == "ro3v"
