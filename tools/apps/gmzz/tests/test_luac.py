"""The client dump reader, exercised against dumps built here.

Nothing in this file needs the game or a LuaJIT build: a client dump is
assembled byte by byte so the expected output is known exactly.
"""

from __future__ import annotations

import pytest

from gmzz.luac import (
    LUAJIT_MAGIC,
    OPCODE_MAP,
    XOR_KEY,
    LuacError,
    UnknownOpcode,
    decrypt,
)


def _uleb(value: int) -> bytes:
    out = bytearray()
    while True:
        byte = value & 0x7F
        value >>= 7
        out.append(byte | (0x80 if value else 0))
        if not value:
            return bytes(out)


def _proto_body(opcodes: list[int], trailer: bytes = b"") -> bytes:
    """A proto with no constants and no debug info, holding ``opcodes``."""
    head = bytes([0x02, 0x00, 0x03, 0x00])  # flags, numparams, framesize, numuv
    head += _uleb(0) + _uleb(0) + _uleb(len(opcodes)) + _uleb(0)  # kgc, kn, bc, dbg
    body = bytearray(head)
    for op in opcodes:
        body += bytes([op, 0x01, 0x02, 0x00])
    return bytes(body) + trailer


def _client_dump(bodies: list[bytes], chunkname: bytes = b"@Test.lua") -> bytes:
    out = bytearray(LUAJIT_MAGIC + b"\x82" + _uleb(0x08))
    out += _uleb(len(chunkname)) + chunkname
    for body in bodies:
        encrypted = bytes(b ^ XOR_KEY[i % len(XOR_KEY)] for i, b in enumerate(body))
        out += _uleb(len(body)) + encrypted
    return bytes(out + b"\x00")


def _protos_of(dump: bytes) -> list[bytes]:
    pos = 4
    while dump[pos] & 0x80:
        pos += 1
    pos += 1  # flags
    length = dump[pos]
    pos += 1 + length  # chunkname
    out = []
    while dump[pos] != 0:
        size = dump[pos]
        pos += 1
        out.append(dump[pos : pos + size])
        pos += size
    return out


def test_restores_the_stock_version_byte():
    dump = decrypt(_client_dump([_proto_body([53, 68])]))
    assert dump[:3] == LUAJIT_MAGIC
    assert dump[3] == 0x02, "stock LuaJIT refuses the client's 0x82"


def test_decrypts_the_body_and_remaps_opcodes():
    dump = decrypt(_client_dump([_proto_body([53, 70, 68])]))
    body = _protos_of(dump)[0]
    assert body[:4] == bytes([0x02, 0x00, 0x03, 0x00]), "prologue survives the XOR"
    bc = 4 + 4  # 4 header bytes + four single-byte ulebs (kgc, kn, bc, dbg)
    ops = [body[bc + i * 4] for i in range(3)]
    assert ops == [OPCODE_MAP[53], OPCODE_MAP[70], OPCODE_MAP[68]] == [53, 66, 76]


def test_keeps_constants_and_debug_bytes_untouched():
    # Only the instruction stream is rewritten; everything after it is payload.
    trailer = b"\xde\xad\xbe\xef" * 4
    dump = decrypt(_client_dump([_proto_body([53], trailer)]))
    assert _protos_of(dump)[0].endswith(trailer)


def test_handles_several_protos():
    dump = decrypt(_client_dump([_proto_body([53]), _proto_body([68])]))
    assert len(_protos_of(dump)) == 2


def test_rejects_an_unmapped_opcode():
    # Passing it through would let LuaJIT run whatever stock instruction shares
    # the number, which corrupts the table silently instead of failing.
    unmapped = next(op for op in range(256) if op not in OPCODE_MAP)
    with pytest.raises(UnknownOpcode) as excinfo:
        decrypt(_client_dump([_proto_body([unmapped])]), "Some/Table.luac")
    assert excinfo.value.opcodes == [unmapped]
    assert "Some/Table.luac" in str(excinfo.value)


def test_rejects_a_non_luajit_blob():
    with pytest.raises(LuacError):
        decrypt(b"not a dump at all")


def test_key_is_the_recovered_forty_eight_byte_ascii_key():
    # Guards the constant itself: a silent edit here would decode to plausible
    # garbage rather than an obvious failure.
    assert len(XOR_KEY) == 48
    assert XOR_KEY.startswith(b"c7") and XOR_KEY.endswith(b"gmzz")
