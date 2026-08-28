"""Ragnarok Online 3's Lua 5.4 obfuscation, and how to undo it.

The client ships 14,479 compiled chunks inside the ``.bytes`` data containers (see
:mod:`.containers`). They are stock Lua 5.4 dumps put through four transforms, none of
which changes a chunk's length -- so every layer can be undone in place and the result
handed to a real ``load(chunk, name, "b")``.

**Layer 1 -- the signature byte.** The dump starts ``\\x1eLua`` where Lua writes
``\\x1bLua``. Nothing else in the header moves: version ``0x54``, ``LUAC_DATA``, the 4/8/8
sizes, ``LUAC_INT`` ``0x5678`` and ``LUAC_NUM`` 370.5 are all unmodified.

**Layer 2 -- the string constants.** Every dumped string (chunk source name, string
constants, local-variable names, upvalue names) is a CBC-style XOR chain whose IV is the
string's own length::

    C[0] = P[0] ^ (len & 0xff)
    C[i] = P[i] ^ C[i-1]

The length is what made this visible: the per-file delta between two ciphertexts of the
same plaintext is a constant equal to ``len_a ^ len_b``, and ``C[0] ^ len`` recovers the
leading ``@`` that every Lua chunk name carries.

**Layer 3 -- the instruction stream.** Each proto's 32-bit instructions are XORed with a
key derived from the proto's *own* instruction count::

    key = sizecode ^ (sizecode << 16)

For ``sizecode > 0xffff`` the two halves overlap and that closed form stops reproducing the
real key. Only the main proto of the largest chunks gets there, and a main proto always
begins with ``VARARGPREP 0`` (opcode ``0x51``), so it is keyed off that known plaintext
instead. No *nested* proto in the corpus exceeds 2,029 instructions, so the closed form is
exact for all of them.

**Layer 4 -- the OpCode enum.** The build rotates the opcode numbering: ``OP_MOVE`` (0) and
everything from ``OP_CLOSE`` (54) up keep their stock number, while the 53 opcodes in
``[1..53]`` are rotated by +20, ``encoded = ((stock + 19) % 53) + 1``. The rotation is a
permutation of that range, so :data:`OP_DEC` inverts it exactly.

Measured on build 0.0.1.14: **14,479/14,479 chunks** round-trip through :func:`full` with
zero structural defects (every jump in range, every constant index in bounds, every proto
ending in a return, every string valid UTF-8) and are accepted by a stock Lua 5.4 loader.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass

SIG_GAME = b"\x1eLua"
SIG_REAL = b"\x1bLua"

#: The main proto's first instruction is always ``VARARGPREP 0``.
VARARGPREP = 0x51

#: Stock Lua 5.4 has 83 opcodes (``OP_MOVE`` .. ``OP_EXTRAARG``).
NUM_OPCODES = 83

#: Opcodes outside ``[ROTATE_LO, ROTATE_HI]`` are not renumbered.
ROTATE_LO = 1
ROTATE_HI = 53
ROTATE_BY = 20


def _rotation_tables() -> tuple[list[int], list[int]]:
    span = ROTATE_HI - ROTATE_LO + 1
    enc = list(range(NUM_OPCODES))
    dec = list(range(NUM_OPCODES))
    for stock in range(ROTATE_LO, ROTATE_HI + 1):
        encoded = (stock - ROTATE_LO + ROTATE_BY) % span + ROTATE_LO
        enc[stock] = encoded
        dec[encoded] = stock
    return enc, dec


#: ``OP_ENC[stock]`` is the number RO3 writes; ``OP_DEC[encoded]`` is the stock number.
OP_ENC, OP_DEC = _rotation_tables()


def decrypt_string(cipher: bytes) -> bytes:
    """Undo layer 2 for one dumped string."""
    if not cipher:
        return cipher
    out = bytearray(len(cipher))
    prev = len(cipher) & 0xFF
    for i, b in enumerate(cipher):
        out[i] = b ^ prev
        prev = b
    return bytes(out)


def encrypt_string(plain: bytes) -> bytes:
    """Apply layer 2 to one string. Only tests need this; it proves the chain inverts."""
    if not plain:
        return plain
    out = bytearray(len(plain))
    prev = len(plain) & 0xFF
    for i, b in enumerate(plain):
        prev = out[i] = b ^ prev
    return bytes(out)


def code_key(sizecode: int) -> int:
    """The layer-3 key for a proto of ``sizecode`` instructions (closed form)."""
    return (sizecode ^ (sizecode << 16)) & 0xFFFFFFFF


@dataclass(slots=True)
class Layout:
    """Byte offsets of the parts of a dump that the obfuscation touches.

    ``strings`` are ``(offset, length)`` of each dumped string's bytes, ``codes`` are
    ``(offset, instruction_count)`` of each proto's instruction buffer, in dump order --
    so ``codes[0]`` is always the main proto.
    """

    strings: list[tuple[int, int]]
    codes: list[tuple[int, int]]


class _Scanner:
    """Walks a Lua 5.4 dump for structure only, without decoding anything.

    Layers 2 and 3 both need to know *where* things are before they can be undone, and the
    dump format is self-describing enough to find that out while the payload is still
    obfuscated: sizes, counts and tags are all plain.
    """

    def __init__(self, data: bytes) -> None:
        self.data = data
        self.pos = 0
        self.strings: list[tuple[int, int]] = []
        self.codes: list[tuple[int, int]] = []

    def byte(self) -> int:
        value = self.data[self.pos]
        self.pos += 1
        return value

    def take(self, n: int) -> bytes:
        chunk = self.data[self.pos : self.pos + n]
        if len(chunk) != n:
            raise ValueError("truncated chunk")
        self.pos += n
        return chunk

    def size(self) -> int:
        """Lua 5.4 ``loadSize``: big-endian 7-bit groups, high bit set on the LAST byte."""
        value = 0
        while True:
            b = self.byte()
            value = (value << 7) | (b & 0x7F)
            if b & 0x80:
                return value
            if value > (1 << 40):
                raise ValueError("size out of range")

    def string(self) -> None:
        n = self.size()
        if n == 0:
            return
        start = self.pos
        self.take(n - 1)
        if n - 1:
            self.strings.append((start, n - 1))

    def header(self) -> None:
        sig = self.take(4)
        if sig not in (SIG_GAME, SIG_REAL):
            raise ValueError(f"bad Lua signature {sig!r}")
        self.byte()  # LUAC_VERSION
        self.byte()  # LUAC_FORMAT
        if self.take(6) != b"\x19\x93\r\n\x1a\n":
            raise ValueError("bad LUAC_DATA")
        self.byte()  # sizeof(Instruction)
        self.byte()  # sizeof(lua_Integer)
        self.byte()  # sizeof(lua_Number)
        self.take(8)  # LUAC_INT
        self.take(8)  # LUAC_NUM
        self.byte()  # nupvalues of the main closure

    def proto(self) -> None:
        self.string()  # source
        self.size()  # linedefined
        self.size()  # lastlinedefined
        self.byte()  # numparams
        self.byte()  # is_vararg
        self.byte()  # maxstacksize
        n = self.size()
        self.codes.append((self.pos, n))
        self.take(4 * n)
        for _ in range(self.size()):  # constants
            tag = self.byte()
            if tag in (0, 1, 0x11):  # nil, false, true
                continue
            if tag in (3, 0x13):  # integer, float
                self.take(8)
            elif tag in (4, 0x14):  # short string, long string
                self.string()
            else:
                raise ValueError(f"bad constant tag {tag}")
        self.take(3 * self.size())  # upvalues
        for _ in range(self.size()):  # nested protos
            self.proto()
        self.take(self.size())  # lineinfo
        for _ in range(self.size()):  # abslineinfo
            self.size()
            self.size()
        for _ in range(self.size()):  # locvars
            self.string()
            self.size()
            self.size()
        for _ in range(self.size()):  # upvalue names
            self.string()


def layout(data: bytes) -> Layout:
    """Locate every obfuscated span in a dump. Raises when the chunk is not a Lua 5.4 dump."""
    scanner = _Scanner(data)
    scanner.header()
    scanner.proto()
    if scanner.pos != len(data):
        raise ValueError(f"{len(data) - scanner.pos} trailing bytes after the main proto")
    return Layout(scanner.strings, scanner.codes)


def deobfuscate(data: bytes) -> bytes:
    """Undo layers 1-3. The opcodes are still RO3-numbered; see :func:`unmap_opcodes`."""
    if data.startswith(SIG_GAME):
        data = SIG_REAL + data[len(SIG_GAME) :]
    parts = layout(data)
    out = bytearray(data)
    for offset, length in parts.strings:
        out[offset : offset + length] = decrypt_string(data[offset : offset + length])
    for i, (offset, count) in enumerate(parts.codes):
        if not count:
            continue
        if i == 0:
            # Main proto: recover the key from its known first instruction rather than
            # from the count, which overflows the closed form on the largest chunks.
            key = struct.unpack_from("<I", data, offset)[0] ^ VARARGPREP
        else:
            key = code_key(count)
        words = struct.unpack_from(f"<{count}I", data, offset)
        struct.pack_into(f"<{count}I", out, offset, *[w ^ key for w in words])
    return bytes(out)


def unmap_opcodes(data: bytes) -> bytes:
    """Undo layer 4: renumber every opcode back to the stock Lua 5.4 enum."""
    parts = layout(data)
    out = bytearray(data)
    for offset, count in parts.codes:
        for i in range(count):
            at = offset + 4 * i
            # An instruction's opcode is its low 7 bits.
            out[at] = (out[at] & 0x80) | OP_DEC[out[at] & 0x7F]
    return bytes(out)


def full(data: bytes) -> bytes:
    """All four layers: an obfuscated chunk in, a stock Lua 5.4 chunk out."""
    return unmap_opcodes(deobfuscate(data))


def chunk_source(data: bytes) -> str | None:
    """The ``@``-prefixed source path a *deobfuscated* chunk records for itself.

    The build paths are absolute on the build machine
    (``@E:/workspaces/.../Assets/Script/LuaMultiverse/M102/Config/DataConfig/SkillConfig.lua``);
    :func:`script_path` trims one to the part that identifies the file.
    """
    return _source_at(data, decrypted=True)


def peek_source(data: bytes) -> str | None:
    """The source path of a chunk that is still obfuscated.

    The main proto's source name is the first string in the dump, and layer 2 keys each
    string only off its own length -- so this one string can be read without touching the
    rest. Selecting which of 14,479 chunks to decode is worth that shortcut.
    """
    return _source_at(data, decrypted=False)


def _source_at(data: bytes, *, decrypted: bool) -> str | None:
    parts = layout(data)
    if not parts.strings:
        return None
    offset, length = parts.strings[0]
    raw = data[offset : offset + length]
    if not decrypted:
        raw = decrypt_string(raw)
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return None


SCRIPT_ROOTS = ("Assets/Script/", "Assets/Editor/")


def script_path(source: str | None) -> str | None:
    """A chunk's path relative to the build's script root, or ``None`` when unrecognised.

    ``Assets/Script/`` covers the game scripts; the localization tables live under
    ``Assets/Editor/Language/Resources/<Language>/Script/LuaScript/`` instead, so both
    roots are trimmed.
    """
    if not source:
        return None
    text = source.lstrip("@").replace("\\", "/")
    for root in SCRIPT_ROOTS:
        at = text.find(root)
        if at >= 0:
            return text[at + len(root) :]
    return None
