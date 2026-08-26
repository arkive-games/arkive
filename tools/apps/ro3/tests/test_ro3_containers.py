"""Tests for the data-container extractor.

Fixtures are synthetic RO3V containers, so these run without the game installed.
"""

from __future__ import annotations

import json
import struct

from ro3.containers import (
    LUA_SIG_GAME,
    LUA_SIG_REAL,
    classify_payload,
    extract,
    iter_payloads,
    normalise_lua,
)
from ro3.vfs import HEADER_LEN


def build(*payloads: bytes) -> bytes:
    offsets, cursor = [], HEADER_LEN
    for p in payloads:
        offsets.append(cursor)
        cursor += len(p)
    index_offset = cursor
    index = struct.pack("<I", len(payloads))
    for i, off in enumerate(offsets):
        index += struct.pack("<QQ", 0xB000_0000_0000_0000 | i, off)
    index += struct.pack("<Q", index_offset)
    return struct.pack("<4sIQQ", b"RO3V", 1, index_offset, len(index)) + b"".join(payloads) + index


LUA_HEADER = LUA_SIG_GAME + bytes.fromhex("540019930d0a1a0a040808") + struct.pack("<q", 0x5678)


def test_classify_covers_the_shipped_payload_kinds():
    assert classify_payload(LUA_HEADER) == "lua-bytecode"
    assert classify_payload(b'{"m_kFightSettingTable": 1}') == "json"
    assert classify_payload(b"PK\x03\x04rest") == "zip"
    assert classify_payload(b"\x0a\x0fMG_Define.proto\x12\x05romsg") == "protobuf-schema"
    assert classify_payload(b"\x0a\x5b\x0a\x20" + b"\x01" * 40) == "protobuf"
    assert classify_payload(b"-- generated\nlocal AK = {}\nreturn AK\n") == "lua-source"
    assert classify_payload(b"\x00\x01\x02\x03" * 40) == "binary"


def test_json_that_does_not_parse_is_not_called_json():
    assert classify_payload(b"{ this is not json ") == "text"


def test_normalise_lua_restores_the_stock_signature():
    assert normalise_lua(LUA_HEADER).startswith(LUA_SIG_REAL)
    # everything after byte 0 is untouched
    assert normalise_lua(LUA_HEADER)[4:] == LUA_HEADER[4:]
    # already-stock chunks pass through
    stock = LUA_SIG_REAL + b"rest"
    assert normalise_lua(stock) == stock


def test_iter_payloads_reads_each_sub_file(tmp_path):
    body = json.dumps({"a": 1}).encode()
    path = tmp_path / "abc.bytes"
    path.write_bytes(build(body, LUA_HEADER))

    got = list(iter_payloads(path))
    assert [p.kind for p in got] == ["json", "lua-bytecode"]
    assert got[0].data == body
    assert got[1].data.startswith(LUA_SIG_REAL)
    assert got[0].name.endswith(".json")
    assert got[1].name.endswith(".luac")


def test_extract_writes_by_kind_and_counts(tmp_path):
    vfs = tmp_path / "VFS"
    vfs.mkdir()
    (vfs / "one.bytes").write_bytes(build(b'{"x":1}', LUA_HEADER))
    # a .bundle must be ignored even though it is the same container format
    (vfs / "two.bundle").write_bytes(build(b'{"y":2}'))

    counts = extract(vfs, tmp_path / "out")

    assert counts == {"json": 1, "lua-bytecode": 1}
    assert (tmp_path / "out" / "json").is_dir()
    assert (tmp_path / "out" / "lua-bytecode").is_dir()
    assert not (tmp_path / "out" / "binary").exists()
