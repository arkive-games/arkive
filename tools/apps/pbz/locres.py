"""Reader for Unreal ``.locres`` localization tables (versions 1-3).

Older ``uex export`` builds copied them raw; since uex 2682a36 the export
writes the decoded table as ``Game.json`` instead. ``read_culture`` takes
whichever of the two a raw root holds.
Layout: a 16-byte magic, a version byte, the offset of a deduplicated string
table, then namespaces -> keys -> string-table index. Versions 2+ carry a
key hash and a string refcount, which are skipped; version 0 (no magic) is
not handled because nothing this game ships uses it.
"""

from __future__ import annotations

import json
import struct
from pathlib import Path

MAGIC = bytes.fromhex("0E147475674A03FC4A15909DC3377F1B")


class _Reader:
    def __init__(self, data: bytes):
        self.data, self.pos = data, 0

    def unpack(self, fmt: str):
        value = struct.unpack_from(fmt, self.data, self.pos)[0]
        self.pos += struct.calcsize(fmt)
        return value

    def fstring(self) -> str:
        n = self.unpack("<i")
        if n == 0:
            return ""
        if n < 0:  # UTF-16, length in code units including the terminator
            raw, self.pos = self.data[self.pos:self.pos - 2 * n], self.pos - 2 * n
            text = raw.decode("utf-16-le")
        else:
            raw, self.pos = self.data[self.pos:self.pos + n], self.pos + n
            text = raw.decode("utf-8")
        return text[:-1] if text.endswith("\0") else text


def read_locres(path: Path) -> dict[str, dict[str, str]]:
    """``{namespace: {key: text}}`` for one culture's ``.locres``."""
    r = _Reader(Path(path).read_bytes())
    if r.data[:16] != MAGIC:
        raise ValueError(f"{path}: not a versioned locres file")
    r.pos = 16
    version = r.unpack("<B")
    if version > 3:
        raise ValueError(f"{path}: locres version {version} is newer than this reader")
    table_offset = r.unpack("<q")
    if version >= 2:
        r.unpack("<I")  # entry count
    body = r.pos
    r.pos = table_offset
    strings = []
    for _ in range(r.unpack("<i")):
        strings.append(r.fstring())
        if version >= 2:
            r.unpack("<i")  # refcount
    r.pos = body
    out: dict[str, dict[str, str]] = {}
    for _ in range(r.unpack("<I")):
        if version >= 2:
            r.unpack("<I")  # namespace hash
        table = out.setdefault(r.fstring(), {})
        for _ in range(r.unpack("<I")):
            if version >= 2:
                r.unpack("<I")  # key hash
            key = r.fstring()
            r.unpack("<I")  # source string hash
            table[key] = strings[r.unpack("<i")]
    return out


def read_culture(culture_dir: Path, table: str = "Game") -> dict[str, dict[str, str]]:
    """``{namespace: {key: text}}`` for one culture directory: uex's decoded
    ``<table>.json`` when present, else the raw ``<table>.locres``."""
    decoded = Path(culture_dir) / f"{table}.json"
    if decoded.is_file():
        return json.loads(decoded.read_text(encoding="utf-8"))
    return read_locres(Path(culture_dir) / f"{table}.locres")
