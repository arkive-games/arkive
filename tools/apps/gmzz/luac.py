"""Read the client's obfuscated LuaJIT data tables.

Every game table lives under ``C7/Content/ScriptOPCode/Data/Excel`` as a LuaJIT
2.1 bytecode dump. In the base install each carries two layers of obfuscation;
the tables the client hot-patches in (see :mod:`gmzz.kscache`) are stock dumps
with neither, told apart by the version byte, and pass through untouched. The
obfuscated form:

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

Both layers were first recovered here by analysis of the shipped tables. CUE4Parse
has since been confirmed to carry the same key — its ``LoMLua.cs`` cites an address
in the client binary — and the same opcode permutation, which the table below now
follows in full. Neither layer is a DRM measure: the payload is already decrypted
by the AES key the pak loader uses.
"""

from __future__ import annotations

from pathlib import Path

#: Repeating XOR key applied to each proto body. Recovered by index-of-coincidence
#: over the table corpus (every repeat distance is a multiple of 48), then per-column
#: distribution correlation, then brute-forcing the one remaining byte against a proto
#: parser — the correct key consumes each body with exactly zero bytes left over.
#: It is plain ASCII and bookends the project name with the launcher name.
XOR_KEY = b"c7fjs-432890fadnsyu9reqwj;lerwqio;jf;ldsanmdgmzz"


def _build_opcode_map() -> dict[int, int]:
    """Client opcode -> stock LuaJIT 2.1 opcode, for the whole instruction set.

    The client's build shuffles the opcode table in contiguous runs. This is the
    same permutation CUE4Parse applies in ``LoMLua.RemapOpcode``, which was taken
    from the client binary; it agrees with the fourteen opcodes the data tables
    use, which were recovered here independently by aligning the client's
    instruction stream against stock-compiled equivalents.

    Covering the whole set rather than only those fourteen is what lets the
    gameplay scripts decode too, not just ``Data/Excel``.

    Note how many entries map to their own value (``0x34..0x40``, ``0x59..0x60``):
    "the opcode is unchanged" is emphatically not evidence that a decode is right.
    """
    out: dict[int, int] = {}
    for op in range(0x00, 0x61):
        if op <= 0x11:
            stock = op
        elif 0x12 <= op <= 0x18:  # UGET..FNEW
            stock = op + 0x1B
        elif 0x19 <= op <= 0x1F:  # MOV..MULVN
            stock = op - 0x07
        elif op == 0x20:  # MODVN
            stock = 0x1A
        elif op == 0x21:  # DIVVN
            stock = 0x19
        elif 0x22 <= op <= 0x24:  # ADDNV..MULNV
            stock = op - 0x07
        elif op == 0x25:  # MODNV
            stock = 0x1F
        elif op == 0x26:  # DIVNV
            stock = 0x1E
        elif 0x27 <= op <= 0x29:  # ADDVV..MULVV
            stock = op - 0x07
        elif op == 0x2A:  # MODVV
            stock = 0x24
        elif op == 0x2B:  # DIVVV
            stock = 0x23
        elif 0x2C <= op <= 0x33:  # POW..KNIL
            stock = op - 0x07
        elif 0x34 <= op <= 0x40:  # TNEW..TSETR
            stock = op
        elif 0x41 <= op <= 0x44:  # RETM..RET1
            stock = op + 0x08
        elif 0x45 <= op <= 0x4C:  # CALLM..ISNEXT
            stock = op - 0x04
        elif op == 0x4D:  # FORL
            stock = 0x4F
        elif op == 0x4E:  # IFORL
            stock = 0x50
        elif op == 0x4F:  # JFORL
            stock = 0x51
        elif op == 0x50:  # FORI
            stock = 0x4D
        elif op == 0x51:  # JFORI
            stock = 0x4E
        elif 0x52 <= op <= 0x54:  # ITERL, IITERL, JITERL
            stock = op
        elif op == 0x55:  # JMP
            stock = 0x58
        elif op == 0x56:  # LOOP
            stock = 0x55
        elif op == 0x57:  # ILOOP
            stock = 0x56
        elif op == 0x58:  # JLOOP
            stock = 0x57
        else:  # 0x59..0x60 — FUNCF..FUNCCW
            stock = op
        out[op] = stock
    return out


OPCODE_MAP = _build_opcode_map()

LUAJIT_MAGIC = b"\x1bLJ"
#: The dump version byte: stock LuaJIT 2.1 writes 2; the client's obfuscated dumps carry 0x82.
STOCK_VERSION = 0x02
CLIENT_VERSION = 0x82
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
    """A dump stock LuaJIT can load, from either form the client ships.

    A stock dump (version byte 0x02 — every hot-patched table) is returned as
    is. The base install's obfuscated form (0x82) has both layers undone; proto
    lengths are unchanged by both transforms, so the container is rebuilt
    verbatim apart from the version byte. Anything else is refused.
    """
    if data[:3] != LUAJIT_MAGIC:
        raise LuacError(f"{path}: not a LuaJIT dump (magic {data[:3]!r})")
    if data[3] == STOCK_VERSION:
        # Patched tables come down plain: the obfuscated form is the base
        # install's, and what the client hot-patches in is a stock dump.
        return data
    if data[3] != CLIENT_VERSION:
        raise LuacError(f"{path}: LuaJIT dump version {data[3]:#x} is neither stock nor the client's")
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
