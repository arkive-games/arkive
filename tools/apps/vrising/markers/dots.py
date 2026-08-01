"""Strict reader for the Unity DOTS entity files shipped by V Rising.

The game currently writes Unity Entities file format 77. V Rising increases
the normal Unity chunk size to 32 KiB in client scenes and 64 KiB in bundled
dedicated-server scenes. The size is validated against both the archetype
entity totals and every serialized chunk header. Unsupported format changes
fail loudly instead of silently moving marker data.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import struct


DOTS_MAGIC = b"DOTSBIN!"
SUPPORTED_FILE_VERSION = 77
FILE_HEADER_SIZE = 152
CHUNK_BUFFER_OFFSET = 64
TYPE_INDEX_MASK = 0x00FF_FFFF

ARCHETYPES_NODE_ID = "f5364e1ccb62466a9883f6f9554d4f0c"
CHUNKS_NODE_ID = "2ea7ce3325f04d7a84ceab46790c628a"
BUFFER_DATA_NODE_ID = "e33124bfac2649d792de36e4611ddd70"
BLOB_ASSETS_NODE_ID = "9a26954ff1ed4cc5a64e8aad4f64773a"


class DotsFormatError(RuntimeError):
    """The input is not the exact DOTS layout the extractor understands."""


@dataclass(frozen=True)
class DotsNode:
    node_id: str
    data_offset: int
    data_size: int
    revision: int | None
    children_count: int


@dataclass(frozen=True)
class Archetype:
    entity_count: int
    type_hashes: tuple[int, ...]

    @property
    def signature(self) -> frozenset[int]:
        return frozenset(self.type_hashes)


@dataclass(frozen=True)
class Chunk:
    index: int
    file_offset: int
    size: int
    archetype_index: int
    entity_count: int


@dataclass(frozen=True)
class BufferPatch:
    chunk_index: int
    chunk_buffer_offset: int
    allocation_size: int
    element_count: int
    capacity: int
    data: memoryview


@dataclass(frozen=True)
class BlobAsset:
    index: int
    payload_offset: int
    length: int
    content_hash: int
    data: memoryview


def _hash128_id(raw: bytes) -> str:
    """Convert Unity's nibble-swapped in-memory Hash128 bytes to text."""
    if len(raw) != 16:
        raise ValueError("a Hash128 must contain exactly 16 bytes")
    return "".join(f"{value:02x}"[::-1] for value in raw)


def _fixed_string(raw: bytes) -> str:
    if len(raw) < 2:
        raise DotsFormatError("truncated FixedString value")
    length = struct.unpack_from("<H", raw)[0]
    if length > len(raw) - 2:
        raise DotsFormatError(
            f"FixedString length {length} exceeds its {len(raw) - 2}-byte capacity"
        )
    try:
        return raw[2 : 2 + length].decode("utf-8")
    except UnicodeDecodeError as exc:
        raise DotsFormatError("FixedString contains invalid UTF-8") from exc


class DotsFile:
    """Parsed DOTS container plus targeted ECS chunk accessors."""

    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.data = self.path.read_bytes()
        self.file_version: int
        self.file_type: str
        self.nodes: tuple[DotsNode, ...]
        self.archetypes: tuple[Archetype, ...]
        self.chunks: tuple[Chunk, ...]
        self.chunk_size: int
        self._parse()

    def _parse(self) -> None:
        data = self.data
        if len(data) < FILE_HEADER_SIZE:
            raise DotsFormatError(f"{self.path}: truncated DOTS header")
        if data[:8] != DOTS_MAGIC:
            raise DotsFormatError(f"{self.path}: missing DOTSBIN magic")

        self.file_version, header_size = struct.unpack_from("<ii", data, 8)
        if self.file_version != SUPPORTED_FILE_VERSION:
            raise DotsFormatError(
                f"{self.path}: DOTS version {self.file_version} is unsupported; "
                f"expected {SUPPORTED_FILE_VERSION}"
            )
        if header_size != FILE_HEADER_SIZE:
            raise DotsFormatError(
                f"{self.path}: DOTS header size {header_size} is unsupported; "
                f"expected {FILE_HEADER_SIZE}"
            )
        self.file_type = _fixed_string(data[32:96])
        first_level_count = struct.unpack_from("<i", data, 96)[0]
        nodes_offset = struct.unpack_from("<q", data, 104)[0]
        nodes_size = struct.unpack_from("<i", data, 112)[0]
        metadata_offset = struct.unpack_from("<q", data, 120)[0]
        metadata_size = struct.unpack_from("<i", data, 128)[0]
        data_offset, data_size = struct.unpack_from("<qq", data, 136)

        if first_level_count != 1:
            raise DotsFormatError(
                f"{self.path}: expected one root node, found {first_level_count}"
            )
        if data_offset != header_size or data_offset + data_size != nodes_offset:
            raise DotsFormatError(f"{self.path}: non-contiguous DOTS data section")
        if metadata_size != 0 or metadata_offset != nodes_offset:
            raise DotsFormatError(f"{self.path}: unexpected DOTS metadata section")
        if nodes_offset < 0 or nodes_size < 0 or nodes_offset + nodes_size != len(data):
            raise DotsFormatError(f"{self.path}: invalid DOTS node section bounds")

        self.nodes = self._parse_nodes(nodes_offset, nodes_size)
        archetype_node = self.node(ARCHETYPES_NODE_ID)
        self.archetypes = self._parse_archetypes(archetype_node)
        chunks_node = self.node(CHUNKS_NODE_ID)
        self.chunk_size, self.chunks = self._parse_chunks(chunks_node)

    def _parse_nodes(self, start: int, size: int) -> tuple[DotsNode, ...]:
        section = memoryview(self.data)[start : start + size]
        nodes: list[DotsNode] = []
        offset = 0
        while offset < size:
            if offset + 72 > size:
                raise DotsFormatError(f"{self.path}: truncated DOTS node header")
            header_size, next_sibling, children_count = struct.unpack_from(
                "<iii", section, offset + 24
            )
            data_offset, data_size = struct.unpack_from("<qq", section, offset + 56)
            if header_size not in (72, 80) or offset + header_size > size:
                raise DotsFormatError(
                    f"{self.path}: unsupported DOTS node header size {header_size}"
                )
            if next_sibling < -1 or children_count < 0:
                raise DotsFormatError(f"{self.path}: invalid DOTS node navigation data")
            if data_offset != -1 and (
                data_offset < FILE_HEADER_SIZE
                or data_size < 0
                or data_offset + data_size > len(self.data)
            ):
                raise DotsFormatError(f"{self.path}: invalid DOTS node data bounds")
            revision = (
                struct.unpack_from("<i", section, offset + 72)[0]
                if header_size == 80
                else None
            )
            nodes.append(
                DotsNode(
                    node_id=_hash128_id(bytes(section[offset + 8 : offset + 24])),
                    data_offset=data_offset,
                    data_size=data_size,
                    revision=revision,
                    children_count=children_count,
                )
            )
            offset += header_size
        if offset != size:
            raise DotsFormatError(f"{self.path}: DOTS node section is misaligned")
        if not nodes or nodes[0].children_count != len(nodes) - 1:
            raise DotsFormatError(f"{self.path}: unsupported DOTS node hierarchy")
        return tuple(nodes)

    def node(self, node_id: str) -> DotsNode:
        matches = [node for node in self.nodes if node.node_id == node_id.lower()]
        if len(matches) != 1:
            raise DotsFormatError(
                f"{self.path}: expected one {node_id} node, found {len(matches)}"
            )
        return matches[0]

    def _parse_archetypes(self, node: DotsNode) -> tuple[Archetype, ...]:
        view = memoryview(self.data)[node.data_offset : node.data_offset + node.data_size]
        offset = 0

        def read_u32() -> int:
            nonlocal offset
            if offset + 4 > len(view):
                raise DotsFormatError(f"{self.path}: truncated archetype node")
            value = struct.unpack_from("<I", view, offset)[0]
            offset += 4
            return value

        type_count = read_u32()
        if type_count == 0 or type_count > 100_000:
            raise DotsFormatError(f"{self.path}: implausible DOTS type count {type_count}")
        if offset + type_count * 8 > len(view):
            raise DotsFormatError(f"{self.path}: truncated DOTS type hash array")
        type_hashes = struct.unpack_from(f"<{type_count}Q", view, offset)
        offset += type_count * 8

        archetype_count = read_u32()
        archetypes: list[Archetype] = []
        for _ in range(archetype_count):
            entity_count = read_u32()
            component_count = read_u32()
            hashes: list[int] = []
            for _ in range(component_count):
                serialized_index = read_u32()
                index = serialized_index & TYPE_INDEX_MASK
                if index >= len(type_hashes):
                    raise DotsFormatError(
                        f"{self.path}: archetype type index {index} is out of range"
                    )
                hashes.append(type_hashes[index])
            archetypes.append(Archetype(entity_count, tuple(hashes)))
        if offset != len(view):
            raise DotsFormatError(
                f"{self.path}: {len(view) - offset} trailing bytes in archetype node"
            )
        return tuple(archetypes)

    def _parse_chunks(self, node: DotsNode) -> tuple[int, tuple[Chunk, ...]]:
        expected_entities = sum(archetype.entity_count for archetype in self.archetypes)
        candidates: list[tuple[int, tuple[Chunk, ...]]] = []
        for chunk_size in (16_384, 32_768, 65_536):
            if node.data_size % chunk_size:
                continue
            parsed: list[Chunk] = []
            total_entities = 0
            valid = True
            for index in range(node.data_size // chunk_size):
                offset = node.data_offset + index * chunk_size
                archetype_index = struct.unpack_from("<i", self.data, offset)[0]
                entity_count = struct.unpack_from("<i", self.data, offset + 16)[0]
                if not 0 <= archetype_index < len(self.archetypes) or not 0 <= entity_count <= 4096:
                    valid = False
                    break
                parsed.append(
                    Chunk(index, offset, chunk_size, archetype_index, entity_count)
                )
                total_entities += entity_count
            if valid and total_entities == expected_entities:
                candidates.append((chunk_size, tuple(parsed)))
        # Sparse chunks can contain enough zeroes in their unused tail to look
        # like multiple smaller chunks. The client scenes use 32 KiB chunks,
        # while the bundled dedicated-server scenes use 64 KiB chunks, so the
        # largest fully validated interpretation is the authoritative one.
        if candidates:
            largest_size = max(size for size, _ in candidates)
            largest = [candidate for candidate in candidates if candidate[0] == largest_size]
            if len(largest) == 1:
                return largest[0]
        if len(candidates) != 1:
            sizes = [size for size, _ in candidates]
            raise DotsFormatError(
                f"{self.path}: could not uniquely validate the ECS chunk size; "
                f"candidates={sizes}, expectedEntities={expected_entities}"
            )
        return candidates[0]

    def buffer_patches(self) -> tuple[BufferPatch, ...]:
        node = self.node(BUFFER_DATA_NODE_ID)
        view = memoryview(self.data)[node.data_offset : node.data_offset + node.data_size]
        if len(view) < 4:
            raise DotsFormatError(f"{self.path}: truncated buffer data node")
        offset = 0
        chunk_count = struct.unpack_from("<i", view, offset)[0]
        offset += 4
        if chunk_count != len(self.chunks):
            raise DotsFormatError(
                f"{self.path}: buffer node has {chunk_count} chunks; "
                f"chunk node has {len(self.chunks)}"
            )

        patches: list[BufferPatch] = []
        for chunk in self.chunks:
            if offset + 4 > len(view):
                raise DotsFormatError(f"{self.path}: truncated buffer patch count")
            patch_count = struct.unpack_from("<i", view, offset)[0]
            offset += 4
            if patch_count < 0:
                raise DotsFormatError(f"{self.path}: negative buffer patch count")
            for _ in range(patch_count):
                if offset + 8 > len(view):
                    raise DotsFormatError(f"{self.path}: truncated buffer patch header")
                chunk_offset, allocation_size = struct.unpack_from("<ii", view, offset)
                offset += 8
                if (
                    chunk_offset < 0
                    or allocation_size < 0
                    or offset + allocation_size > len(view)
                ):
                    raise DotsFormatError(f"{self.path}: invalid buffer patch bounds")
                header_offset = chunk.file_offset + CHUNK_BUFFER_OFFSET + chunk_offset
                if header_offset + 16 > chunk.file_offset + chunk.size:
                    raise DotsFormatError(f"{self.path}: buffer header is outside its chunk")
                pointer, length, capacity = struct.unpack_from("<Qii", self.data, header_offset)
                if pointer != 0 or length < 0 or capacity < length:
                    raise DotsFormatError(f"{self.path}: invalid serialized buffer header")
                patches.append(
                    BufferPatch(
                        chunk_index=chunk.index,
                        chunk_buffer_offset=chunk_offset,
                        allocation_size=allocation_size,
                        element_count=length,
                        capacity=capacity,
                        data=view[offset : offset + allocation_size],
                    )
                )
                offset += allocation_size
        if offset != len(view):
            raise DotsFormatError(
                f"{self.path}: {len(view) - offset} trailing bytes in buffer data node"
            )
        return tuple(patches)

    def blob_assets(self) -> tuple[BlobAsset, ...]:
        """Return the validated payloads in Unity's serialized blob batch."""
        node = self.node(BLOB_ASSETS_NODE_ID)
        view = memoryview(self.data)[node.data_offset : node.data_offset + node.data_size]
        if len(view) < 16:
            raise DotsFormatError(f"{self.path}: truncated blob asset batch")
        total_size, asset_count, reference_count, padding = struct.unpack_from(
            "<iiii", view
        )
        if (
            total_size != len(view)
            or asset_count < 0
            or reference_count != 1
            or padding != 0
        ):
            raise DotsFormatError(f"{self.path}: invalid blob asset batch header")

        assets: list[BlobAsset] = []
        offset = 16
        for index in range(asset_count):
            if offset + 32 > len(view):
                raise DotsFormatError(f"{self.path}: truncated blob asset header")
            validation_pointer, length, allocator, content_hash, header_padding = (
                struct.unpack_from("<QiiQQ", view, offset)
            )
            if (
                validation_pointer != 0
                or length < 0
                or length % 16
                or allocator != 1
                or header_padding != 0
            ):
                raise DotsFormatError(f"{self.path}: invalid blob asset header")
            payload_offset = offset + 32
            if payload_offset + length > len(view):
                raise DotsFormatError(f"{self.path}: truncated blob asset payload")
            assets.append(
                BlobAsset(
                    index=index,
                    payload_offset=payload_offset,
                    length=length,
                    content_hash=content_hash,
                    data=view[payload_offset : payload_offset + length],
                )
            )
            offset = payload_offset + length
        if offset != len(view):
            raise DotsFormatError(
                f"{self.path}: {len(view) - offset} trailing bytes in blob asset batch"
            )
        return tuple(assets)

    def chunks_for_signature(self, signature: frozenset[int]) -> tuple[Chunk, ...]:
        indices = {
            index
            for index, archetype in enumerate(self.archetypes)
            if archetype.signature == signature
        }
        return tuple(chunk for chunk in self.chunks if chunk.archetype_index in indices)


__all__ = [
    "Archetype",
    "BlobAsset",
    "BufferPatch",
    "CHUNK_BUFFER_OFFSET",
    "Chunk",
    "DotsFile",
    "DotsFormatError",
]
