"""Read the client's obfuscated LuaJIT data tables.

Every game table lives under ``C7/Content/ScriptOPCode/Data/Excel`` as a LuaJIT
2.1 bytecode dump with two layers of obfuscation on top:

1. The dump *container* is standard except that the version byte is ``0x82``
   instead of ``0x02``. Header, chunk name and the per-proto uleb128 length
   prefixes are all plaintext — only each proto **body** is encrypted, with a
   repeating 48-byte XOR key that restarts at offset 0 of every body.
2. The opcode byte of every instruction is remapped. That is what the
   ``ScriptOPCode`` directory name means: it is the opcode-shuffled build of
   the client's ``Script`` tree.

Undoing both yields a dump that stock LuaJIT loads, which matters more than it
sounds: a table constructor whose values are not compile-time constants leaves
``nil`` placeholders in the template table and fills them in from bytecode, so
reading the constants alone loses every localized field. We therefore *execute*
the recovered chunk (see :mod:`gmzz.tables`) rather than decompiling it.

Both layers were recovered by analysis, not from the client binary; see
``docs/`` for the derivation. Neither is a DRM measure — the payload is already
decrypted by the AES key the pak loader uses.
"""

from __future__ import annotations

from pathlib import Path

#: Repeating XOR key applied to each proto body. Recovered by index-of-coincidence
#: over the table corpus (every repeat distance is a multiple of 48), then per-column
#: distribution correlation, then brute-forcing the one remaining byte against a proto
#: parser — the correct key consumes each body with exactly zero bytes left over.
#: It is plain ASCII and bookends the project name with the launcher name.
XOR_KEY = b"c7fjs-432890fadnsyu9reqwj;lerwqio;jf;ldsanmdgmzz"

#: Client opcode -> stock LuaJIT 2.1 opcode, for the instructions the data tables
#: use. Derived by aligning the client's instruction stream against equivalent
#: source compiled by a stock LuaJIT. Note that several map to their own value —
#: "opcode unchanged" is emphatically not evidence that a decode is correct.
OPCODE_MAP = {
    25: 18,  # MOV
    46: 39,  # KSTR
    48: 41,  # KSHORT
    49: 42,  # KNUM
    52: 52,  # TNEW
    53: 53,  # TDUP
    54: 54,  # GGET
    57: 57,  # TGETS
    60: 60,  # TSETV
    61: 61,  # TSETS
    62: 62,  # TSETB
    63: 63,  # TSETM
    68: 76,  # RET1
    70: 66,  # CALL
}

LUAJIT_MAGIC = b"\x1bLJ"
_BCDUMP_F_STRIP = 0x02


class LuacError(RuntimeError):
    """A dump that does not match the expected client format."""


class UnknownOpcode(LuacError):
    """An instruction outside :data:`OPCODE_MAP`.

    Raised rather than passed through: a stray opcode byte would be executed by
    LuaJIT as whatever stock instruction happens to share its number, which
    fails silently and corrupts the extracted table.
    """

    def __init__(self, path: Path | str, opcodes: set[int]) -> None:
        self.opcodes = sorted(opcodes)
        super().__init__(f"{path}: unmapped opcodes {self.opcodes}")


def _read_uleb128(buf: bytes, pos: int) -> tuple[int, int]:
    value = shift = 0
    while True:
        byte = buf[pos]
        pos += 1
        value |= (byte & 0x7F) << shift
        shift += 7
        if not byte & 0x80:
            return value, pos


def _write_uleb128(value: int) -> bytes:
    out = bytearray()
    while True:
        byte = value & 0x7F
        value >>= 7
        out.append(byte | (0x80 if value else 0))
        if not value:
            return bytes(out)


def _bytecode_offset(body: bytes, stripped: bool) -> tuple[int, int]:
    """``(offset, instruction_count)`` of a proto body's bytecode block.

    Only the fixed-size prologue is parsed. The constant and debug sections sit
    after the instructions and need no interpretation to rewrite opcodes.

    ``stripped`` must match the dump's ``BCDUMP_F_STRIP`` flag: LuaJIT's
    ``bcwrite`` emits the debug-section size only for an unstripped dump, so
    reading it unconditionally would land ``pos`` inside the instruction stream
    and corrupt operand bytes.
    """
    pos = 4  # flags, numparams, framesize, numuv
    _sizekgc, pos = _read_uleb128(body, pos)
    _sizekn, pos = _read_uleb128(body, pos)
    sizebc, pos = _read_uleb128(body, pos)
    if not stripped:
        sizedbg, pos = _read_uleb128(body, pos)
        if sizedbg:
            _firstline, pos = _read_uleb128(body, pos)
            _numline, pos = _read_uleb128(body, pos)
    return pos, sizebc


def decrypt(data: bytes, path: Path | str = "<bytes>") -> bytes:
    """Turn one obfuscated client dump into a dump stock LuaJIT can load.

    Proto lengths are unchanged by both transforms, so the container is rebuilt
    verbatim apart from the version byte.
    """
    if data[:3] != LUAJIT_MAGIC:
        raise LuacError(f"{path}: not a LuaJIT dump (magic {data[:3]!r})")
    pos = 4
    flags, pos = _read_uleb128(data, pos)
    out = bytearray(LUAJIT_MAGIC + b"\x02" + _write_uleb128(flags))
    if not flags & _BCDUMP_F_STRIP:
        length, pos = _read_uleb128(data, pos)
        out += _write_uleb128(length) + data[pos : pos + length]
        pos += length

    unknown: set[int] = set()
    while pos < len(data) and data[pos] != 0:
        size, pos = _read_uleb128(data, pos)
        body = bytearray(
            b ^ XOR_KEY[i % len(XOR_KEY)] for i, b in enumerate(data[pos : pos + size])
        )
        pos += size
        start, count = _bytecode_offset(body, bool(flags & _BCDUMP_F_STRIP))
        for i in range(count):
            at = start + i * 4
            stock = OPCODE_MAP.get(body[at])
            if stock is None:
                unknown.add(body[at])
            else:
                body[at] = stock
        out += _write_uleb128(size) + bytes(body)
    out += b"\x00"

    if unknown:
        raise UnknownOpcode(path, unknown)
    return bytes(out)


def decrypt_file(path: Path) -> bytes:
    """:func:`decrypt` for a path, with the path in any error raised."""
    return decrypt(Path(path).read_bytes(), path)
