"""Reader for Ragnarok Online 3's ``RO3V`` container ("VFS").

The game ships its content as ~23k hash-named files under
``ro3_Data/StreamingAssets/VFS``, sharded into ``00/``..``ff/``. Most are not bare
Unity bundles: an ``RO3V`` container wraps one or more ordinary ``UnityFS`` bundles
behind a **trailing** index.

Layout (little-endian)::

    0x00  char[4]  "RO3V"
    0x04  uint32   version (observed 1)
    0x08  uint64   index_offset
    0x10  uint64   index_length      # index_offset + index_length == file size
    ...            sub-file payloads, the first starting at 0x18
    @index_offset
          uint32   count
          count *  { uint64 id; uint64 offset }
          uint64   back_pointer      # == index_offset

so ``index_length == 4 + count*16 + 8`` and sub-file *i* spans
``[offset_i, offset_{i+1})``, the last ending at the index.

What makes this reading certain rather than merely self-consistent: every embedded
bundle's own ``UnityFS`` size field equals the extent the index implies — checked
across the whole shipped tree, 187,734 sub-files, with no mismatches.

The same tree also holds ``HPY\\0`` files, which are *not* Unity bundles and must be
skipped rather than handed to a bundle reader. :func:`classify` separates the three
cases so callers never guess from the file name.

Extraction proper goes through ``unex`` (the Unity extractor, profile ``ro3``); this
module exists so the pipeline can enumerate, locate and slice containers without
shelling out — and so the format has a tested, readable definition on our side.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Literal

MAGIC = b"RO3V"
UNITYFS_MAGIC = b"UnityFS\0"
HPY_MAGIC = b"HPY\0"

HEADER = struct.Struct("<4sIQQ")
HEADER_LEN = HEADER.size  # 24
ENTRY_LEN = 16
INDEX_OVERHEAD = 4 + 8  # count + back-pointer

Kind = Literal["ro3v", "unityfs", "hpy", "other"]


class Ro3vError(ValueError):
    """A file claimed to be an RO3V container but its structure does not hold."""


@dataclass(frozen=True, slots=True)
class Slice:
    """One sub-file inside a container."""

    id: int
    offset: int
    length: int

    @property
    def id_hex(self) -> str:
        """The id as 16 hex digits, matching how bundles are named on disk."""
        return f"{self.id:016x}"


def classify(head: bytes) -> Kind:
    """Classify a file from its first bytes. Cheap enough to run over the whole tree."""
    if head.startswith(UNITYFS_MAGIC):
        return "unityfs"
    if head.startswith(MAGIC):
        return "ro3v"
    if head.startswith(HPY_MAGIC):
        return "hpy"
    return "other"


def classify_path(path: Path) -> Kind:
    with open(path, "rb") as fh:
        return classify(fh.read(HEADER_LEN))


def read_index(path: Path) -> list[Slice]:
    """Read a container's sub-file table.

    Raises :class:`Ro3vError` when the magic matches but the structure does not —
    a corrupt container is worth reporting, unlike a foreign file, which
    :func:`classify` filters out beforehand.
    """
    size = path.stat().st_size
    with open(path, "rb") as fh:
        raw = fh.read(HEADER_LEN)
        if len(raw) < HEADER_LEN:
            raise Ro3vError(f"{path.name}: only {len(raw)} bytes, shorter than the header")
        magic, _version, index_offset, index_length = HEADER.unpack(raw)
        if magic != MAGIC:
            raise Ro3vError(f"{path.name}: magic {magic!r} is not RO3V")
        if index_offset < HEADER_LEN or index_length < INDEX_OVERHEAD:
            raise Ro3vError(f"{path.name}: index [{index_offset}, +{index_length}) is out of range")
        if index_offset + index_length != size:
            raise Ro3vError(
                f"{path.name}: index [{index_offset}, +{index_length}) does not end at size {size}"
            )

        fh.seek(index_offset)
        index = fh.read(index_length)

    (count,) = struct.unpack_from("<I", index, 0)
    if 4 + count * ENTRY_LEN + 8 != index_length:
        raise Ro3vError(
            f"{path.name}: {count} entries need {4 + count * ENTRY_LEN + 8} index bytes, "
            f"have {index_length}"
        )
    (back,) = struct.unpack_from("<Q", index, index_length - 8)
    if back != index_offset:
        raise Ro3vError(f"{path.name}: back-pointer {back} != index offset {index_offset}")

    offsets = [
        struct.unpack_from("<QQ", index, 4 + i * ENTRY_LEN)[1] for i in range(count)
    ] + [index_offset]

    slices: list[Slice] = []
    for i in range(count):
        ident = struct.unpack_from("<Q", index, 4 + i * ENTRY_LEN)[0]
        start, end = offsets[i], offsets[i + 1]
        if start < HEADER_LEN or end > index_offset or end < start:
            raise Ro3vError(
                f"{path.name}: sub-file {i} spans [{start}, {end}), outside the payload region"
            )
        slices.append(Slice(ident, start, end - start))
    return slices


def read_slice(path: Path, sl: Slice) -> bytes:
    """The raw bytes of one sub-file."""
    with open(path, "rb") as fh:
        fh.seek(sl.offset)
        data = fh.read(sl.length)
    if len(data) != sl.length:
        raise Ro3vError(f"{path.name}: sub-file at {sl.offset} is truncated")
    return data


def iter_files(vfs_root: Path) -> Iterator[Path]:
    """Every file under the VFS root, in a stable order."""
    yield from sorted(p for p in vfs_root.rglob("*") if p.is_file())


def iter_bundles(vfs_root: Path) -> Iterator[tuple[Path, Slice | None]]:
    """Every readable Unity bundle under the VFS root.

    Yields ``(path, None)`` for a bare ``UnityFS`` file and ``(path, slice)`` for each
    ``UnityFS`` sub-file of a container. ``HPY`` and non-Unity payloads are skipped.
    """
    for path in iter_files(vfs_root):
        kind = classify_path(path)
        if kind == "unityfs":
            yield path, None
        elif kind == "ro3v":
            for sl in read_index(path):
                if sl.length < len(UNITYFS_MAGIC):
                    continue
                with open(path, "rb") as fh:
                    fh.seek(sl.offset)
                    if fh.read(len(UNITYFS_MAGIC)) == UNITYFS_MAGIC:
                        yield path, sl
