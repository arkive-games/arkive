"""Extract Ragnarok Online 3's **unencrypted** data containers.

RO3 obfuscates its Unity bundles (see the notes in :mod:`.vfs`), but the game's actual data
does not live there. The 38 ``*.bytes`` files under ``StreamingAssets/VFS`` are RO3V
containers like the bundles, yet carry no obfuscation at all, and they hold:

* ``MG_Define.proto`` -- the full protobuf schema, including 83 ``Asset_*`` config-table
  types (``Asset_SkillGrowth``, ``Asset_MultiDungeon``, ``Asset_GrowthClass``, ...)
* JSON client settings, scene placement and scene export manifests
* the class/job name table
* Lua: one container holds 13,515 compiled chunks, another is plain Lua source

So this module is the way into the game's data while the bundle cipher is unsolved. It
classifies each sub-file by content and writes it out under a readable name.

Lua note: the bytecode is stock **Lua 5.4** with a single byte changed -- the signature is
``\\x1eLua`` where Lua writes ``\\x1bLua``. Everything after it (version 0x54, LUAC_DATA,
4/8/8 sizes, LUAC_INT 0x5678, LUAC_NUM 370.5) is unmodified, so restoring byte 0 produces a
chunk a stock 5.4 loader accepts. :func:`normalise_lua` does that.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

from .vfs import Slice, classify_path, read_index, read_slice

LUA_SIG_GAME = b"\x1eLua"
LUA_SIG_REAL = b"\x1bLua"


@dataclass(frozen=True, slots=True)
class Payload:
    """One sub-file of a data container, with a guess at what it is."""

    container: str
    index: int
    slice: Slice
    kind: str
    data: bytes

    @property
    def suffix(self) -> str:
        return {
            "protobuf-schema": ".proto.bin",
            "protobuf": ".pb",
            "json": ".json",
            "lua-bytecode": ".luac",
            "lua-source": ".lua",
            "zip": ".zip",
            "xml": ".xml",
            "text": ".txt",
        }.get(self.kind, ".bin")

    @property
    def name(self) -> str:
        return f"{self.container}_{self.index:05d}_{self.slice.id_hex}{self.suffix}"


def _looks_utf8_text(data: bytes) -> bool:
    sample = data[:4096]
    if b"\x00" in sample:
        return False
    try:
        sample.decode("utf-8")
    except UnicodeDecodeError:
        return False
    printable = sum(1 for b in sample if b in (9, 10, 13) or 32 <= b < 127 or b >= 128)
    return printable / max(1, len(sample)) > 0.95


def classify_payload(data: bytes) -> str:
    """Best-effort content type for one sub-file.

    Order matters: protobuf's field-1 tag is 0x0a, which is also '\\n', so a payload starting
    with it must not be whitespace-stripped and mistaken for the JSON that legitimately
    starts with a newline. Text-shaped payloads are settled first, and a bare 0x0a is only
    read as protobuf once the bytes have failed to look like text.
    """
    if data.startswith(LUA_SIG_GAME) or data.startswith(LUA_SIG_REAL):
        return "lua-bytecode"
    if data.startswith(b"PK\x03\x04"):
        return "zip"
    # A FileDescriptorProto starts with field 1 (the file name) and names the .proto.
    if data[:1] == b"\x0a" and b".proto" in data[:256]:
        return "protobuf-schema"
    if data.lstrip()[:5] == b"<?xml":
        return "xml"
    if _looks_utf8_text(data):
        head = data.lstrip(b"\xef\xbb\xbf \t\r\n")[:1]
        if head in (b"{", b"["):
            try:
                json.loads(data.decode("utf-8-sig"))
                return "json"
            except (UnicodeDecodeError, ValueError):
                return "text"
        return "lua-source" if b"local " in data[:4096] else "text"
    if data[:1] == b"\x0a":
        return "protobuf"
    return "binary"


def normalise_lua(data: bytes) -> bytes:
    """Restore the stock Lua 5.4 signature so a normal loader accepts the chunk."""
    if data.startswith(LUA_SIG_GAME):
        return LUA_SIG_REAL + data[len(LUA_SIG_GAME):]
    return data


def iter_payloads(path: Path) -> Iterator[Payload]:
    """Every sub-file of one ``.bytes`` container, classified."""
    container = path.stem
    for i, sl in enumerate(read_index(path)):
        data = read_slice(path, sl)
        kind = classify_payload(data)
        if kind == "lua-bytecode":
            data = normalise_lua(data)
        yield Payload(container, i, sl, kind, data)


def data_containers(vfs_root: Path) -> list[Path]:
    """The ``.bytes`` containers, which are the unobfuscated ones."""
    return sorted(p for p in vfs_root.rglob("*.bytes") if classify_path(p) == "ro3v")


def extract(vfs_root: Path, out_dir: Path, *, skip_binary: bool = False) -> dict[str, int]:
    """Write every data-container sub-file into ``out_dir``. Returns a kind histogram."""
    out_dir.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    for container in data_containers(vfs_root):
        for payload in iter_payloads(container):
            counts[payload.kind] = counts.get(payload.kind, 0) + 1
            if skip_binary and payload.kind == "binary":
                continue
            target = out_dir / payload.kind / payload.name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(payload.data)
    return counts
