"""Just enough ``UnityFS`` parsing to locate block 0 on disk.

:mod:`.unpack` needs one thing from a bundle image: the byte range the first data block
occupies, because that is the only range Ragnarok Online 3 obfuscates. Reading the header
and the block-info table gets there; the blocks themselves are never decompressed here.

Numbers in a UnityFS header are **big-endian**, unlike the RO3V container around it.
Layout::

    cstr    signature       "UnityFS"
    u32     version         (7 in RO3)
    cstr    unityVersion    "5.x.x"
    cstr    unityRevision   "2022.3.62f3"
    i64     size            total bundle size, == the RO3V sub-file extent
    u32     compressedBlocksInfoSize
    u32     uncompressedBlocksInfoSize
    u32     flags
    [align 16 when version >= 7]
    blocksInfo (compressed per flags & 0x3f)
    [align 16 when flags & 0x200]
    block 0, block 1, ...

and the block-info blob is::

    byte[16] hash
    u32      blockCount
    blockCount * { u32 uncompressedSize; u32 compressedSize; u16 flags }
    u32      nodeCount
    nodeCount * { i64 offset; i64 size; u32 flags; cstr path }
"""

from __future__ import annotations

import struct
from dataclasses import dataclass

MAGIC = b"UnityFS\0"

COMPRESSION_MASK = 0x3F
BLOCKS_INFO_AT_END = 0x80
BLOCK_ALIGNMENT = 0x200


class BundleError(ValueError):
    """The bytes are not a UnityFS image we can read."""


class _Reader:
    """Big-endian cursor over a bytes-like."""

    __slots__ = ("data", "pos")

    def __init__(self, data: bytes, pos: int = 0):
        self.data = data
        self.pos = pos

    def u16(self) -> int:
        v = struct.unpack_from(">H", self.data, self.pos)[0]
        self.pos += 2
        return v

    def u32(self) -> int:
        v = struct.unpack_from(">I", self.data, self.pos)[0]
        self.pos += 4
        return v

    def i64(self) -> int:
        v = struct.unpack_from(">q", self.data, self.pos)[0]
        self.pos += 8
        return v

    def cstr(self) -> str:
        end = self.data.index(b"\0", self.pos)
        v = self.data[self.pos:end].decode("utf-8", "replace")
        self.pos = end + 1
        return v

    def align(self, n: int) -> None:
        self.pos = (self.pos + n - 1) // n * n


@dataclass(frozen=True, slots=True)
class Block:
    uncompressed_size: int
    compressed_size: int
    flags: int

    @property
    def compression(self) -> int:
        """0 = stored, 1 = LZMA, 2/3 = LZ4."""
        return self.flags & COMPRESSION_MASK


@dataclass(frozen=True, slots=True)
class Node:
    offset: int
    size: int
    flags: int
    path: str


@dataclass(frozen=True, slots=True)
class Bundle:
    """A parsed UnityFS header, with the on-disk extent of the data blocks."""

    version: int
    unity_version: str
    unity_revision: str
    size: int
    flags: int
    blocks: tuple[Block, ...]
    nodes: tuple[Node, ...]
    data_offset: int
    """Where block 0 starts, relative to the start of the image."""

    @property
    def block0_span(self) -> tuple[int, int]:
        """``(start, end)`` of block 0 within the image."""
        return self.data_offset, self.data_offset + self.blocks[0].compressed_size


def lz4_block_decompress(src: bytes, out_size: int) -> bytes:
    """Minimal LZ4 block decoder (no frame header), the format Unity stores blocks in.

    Used as an *oracle*: a wrong keystream practically never decompresses to exactly the
    declared size, so this is how a decryption is checked without knowing the plaintext.
    """
    out = bytearray()
    i = 0
    n = len(src)
    try:
        while i < n:
            token = src[i]
            i += 1
            lit_len = token >> 4
            if lit_len == 15:
                while True:
                    b = src[i]
                    i += 1
                    lit_len += b
                    if b != 255:
                        break
            out += src[i:i + lit_len]
            i += lit_len
            if i >= n:
                break
            offset = src[i] | (src[i + 1] << 8)
            i += 2
            match_len = (token & 0x0F) + 4
            if (token & 0x0F) == 15:
                while True:
                    b = src[i]
                    i += 1
                    match_len += b
                    if b != 255:
                        break
            start = len(out) - offset
            if start < 0:
                raise ValueError("lz4: match offset points before the output")
            for k in range(match_len):
                out.append(out[start + k])
    except IndexError as exc:
        # Garbage in is the normal case here - this decoder is the oracle that decides
        # whether a decryption worked - so it must fail as a value error, not a bug.
        raise ValueError(f"lz4: input is truncated or malformed at byte {i}") from exc
    if len(out) != out_size:
        raise ValueError(f"lz4: produced {len(out)} bytes, expected {out_size}")
    return bytes(out)


def parse(image: bytes) -> Bundle:
    """Parse a UnityFS header. Raises :class:`BundleError` when it does not hold.

    The block-info table is *not* obfuscated in RO3, so this works on the raw file.
    """
    if not image.startswith(MAGIC):
        raise BundleError(f"not a UnityFS image: starts {image[:8]!r}")
    try:
        r = _Reader(image)
        r.cstr()
        version = r.u32()
        unity_version = r.cstr()
        unity_revision = r.cstr()
        size = r.i64()
        compressed_info = r.u32()
        uncompressed_info = r.u32()
        flags = r.u32()
        if version >= 7:
            r.align(16)
        if flags & BLOCKS_INFO_AT_END:
            raise BundleError("blocks-info-at-end bundles are not handled")
        info_start = r.pos
        raw_info = image[info_start:info_start + compressed_info]
        if len(raw_info) != compressed_info:
            raise BundleError("truncated before the block-info table")
        mode = flags & COMPRESSION_MASK
        if mode in (2, 3):
            info = lz4_block_decompress(raw_info, uncompressed_info)
        elif mode == 0:
            info = raw_info
        else:
            raise BundleError(f"block-info compression mode {mode} is not handled")
        r.pos = info_start + compressed_info
        if flags & BLOCK_ALIGNMENT:
            r.align(16)
        data_offset = r.pos

        b = _Reader(info, 16)  # skip the 16-byte hash
        blocks = tuple(Block(b.u32(), b.u32(), b.u16()) for _ in range(b.u32()))
        nodes = tuple(
            Node(b.i64(), b.i64(), b.u32(), b.cstr()) for _ in range(b.u32())
        )
    except BundleError:
        raise
    except (IndexError, struct.error, ValueError) as exc:
        raise BundleError(f"malformed UnityFS header: {exc}") from exc

    if not blocks:
        raise BundleError("bundle declares no blocks")
    return Bundle(version, unity_version, unity_revision, size, flags, blocks, nodes,
                  data_offset)
