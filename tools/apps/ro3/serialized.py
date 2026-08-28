"""Enough of Unity's ``SerializedFile`` to answer "what is in this bundle, and what is it
called" — without decoding a single asset.

Why this exists next to ``unex``, which decodes assets properly: Ragnarok Online 3 ships
188,361 bundles, and building unex's full virtual filesystem over all of them costs hours
and gigabytes of memory, because it deserializes every object. Choosing *which* bundles
to hand to unex needs far less than that — a class id and a name per object — and that
much can be read straight off the object table.

Two things make the shortcut safe:

* the object table is exact. Offsets, sizes and type indices come from the file's own
  metadata, not from guessing.
* ``m_Name`` sits at a known offset for the handful of classes this indexes. It is the
  first field of ``Texture2D``, ``Sprite``, ``TextAsset``, ``Material``, ``Mesh``,
  ``AnimationClip`` and ``Shader``; ``MonoBehaviour`` puts it after
  ``m_GameObject`` / ``m_Enabled`` / ``m_Script``, which are fixed-size. A length that is
  not a plausible name length is rejected rather than reinterpreted, so a class whose
  layout differs yields *no* name instead of a wrong one.

Anything this module is unsure of is reported as unnamed. It is an index, not a decoder:
the moment a real asset is wanted, the bundle goes to unex.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from pathlib import Path

import lz4.block

from .bundle import parse as parse_bundle

# Unity class ids, and where m_Name starts within the object's own data.
# 0 = first field. MonoBehaviour: PPtr m_GameObject (12) + m_Enabled (1, aligned to 4)
# + PPtr m_Script (12) = 28.
NAME_AT: dict[int, int] = {
    1: None,  # GameObject - name is after the component list, so it is not read here
    21: 0,  # Material
    28: 0,  # Texture2D
    43: 0,  # Mesh
    48: 0,  # Shader
    49: 0,  # TextAsset
    74: 0,  # AnimationClip
    83: 0,  # AudioClip
    114: 28,  # MonoBehaviour
    115: 0,  # MonoScript
    128: 0,  # Font
    142: 0,  # AssetBundle
    213: 0,  # Sprite
    687078895: 0,  # SpriteAtlas
}

CLASS_NAMES: dict[int, str] = {
    1: "GameObject",
    4: "Transform",
    21: "Material",
    23: "MeshRenderer",
    28: "Texture2D",
    33: "MeshFilter",
    43: "Mesh",
    48: "Shader",
    49: "TextAsset",
    74: "AnimationClip",
    83: "AudioClip",
    91: "AnimatorController",
    95: "Animator",
    114: "MonoBehaviour",
    115: "MonoScript",
    128: "Font",
    137: "SkinnedMeshRenderer",
    142: "AssetBundle",
    150: "PreloadData",
    213: "Sprite",
    687078895: "SpriteAtlas",
}

MAX_NAME = 256


@dataclass(frozen=True, slots=True)
class Entry:
    """One object in a bundle."""

    path_id: int
    class_id: int
    name: str | None

    @property
    def class_name(self) -> str:
        return CLASS_NAMES.get(self.class_id, f"Class{self.class_id}")


def bundle_payload(image: bytes) -> bytes:
    """Every data block of a bundle, concatenated. The bundle must already be decrypted."""
    info = parse_bundle(image)
    out = bytearray()
    pos = info.data_offset
    for block in info.blocks:
        chunk = image[pos:pos + block.compressed_size]
        pos += block.compressed_size
        if block.compression in (2, 3):
            out += lz4.block.decompress(chunk, uncompressed_size=block.uncompressed_size)
        elif block.compression == 0:
            out += chunk
        else:
            raise ValueError(f"block compression mode {block.compression} is not handled")
    return bytes(out)


def _read_cstr(data: bytes, pos: int) -> tuple[str, int]:
    end = data.index(b"\0", pos)
    return data[pos:end].decode("utf-8", "replace"), end + 1


def read_objects(data: bytes) -> list[Entry]:
    """The object table of one SerializedFile, with names where they can be read safely.

    Only the modern header (version >= 22, which 2022.3 writes) is handled; anything else
    raises, because reading an unexpected layout is how an index quietly fills with noise.
    """
    if len(data) < 48:
        raise ValueError("too short to be a SerializedFile")
    _meta_size, _file_size, version, _data_offset = struct.unpack_from(">IIII", data, 0)
    if version < 22:
        raise ValueError(f"SerializedFile version {version} is older than 22")
    (_big_meta, big_file, big_data, _unknown) = struct.unpack_from(">QQQq", data, 16)
    pos = 48
    _unity_version, pos = _read_cstr(data, pos)
    (_platform,) = struct.unpack_from("<i", data, pos)
    pos += 4
    type_tree_enabled = data[pos]
    pos += 1
    if not type_tree_enabled:
        raise ValueError("the type tree is stripped; this index needs it to size the header")

    (type_count,) = struct.unpack_from("<i", data, pos)
    pos += 4
    class_ids: list[int] = []
    for _ in range(type_count):
        class_id, pos = _read_type(data, pos)
        class_ids.append(class_id)

    (object_count,) = struct.unpack_from("<i", data, pos)
    pos += 4
    entries: list[Entry] = []
    for _ in range(object_count):
        pos = (pos + 3) & ~3
        path_id, byte_start, byte_size, type_index = struct.unpack_from("<qqii", data, pos)
        pos += 24
        if not 0 <= type_index < len(class_ids):
            continue
        class_id = class_ids[type_index]
        start = int(big_data) + byte_start
        entries.append(Entry(path_id, class_id, _name_at(data, start, byte_size, class_id)))
    if big_file and big_file > len(data):
        raise ValueError(f"file declares {big_file} bytes, payload has {len(data)}")
    return entries


def _read_type(data: bytes, pos: int) -> tuple[int, int]:
    """Skip one SerializedType, returning its class id and the position after it."""
    (class_id,) = struct.unpack_from("<i", data, pos)
    pos += 4
    pos += 1  # m_IsStrippedType
    pos += 2  # m_ScriptTypeIndex
    if class_id == 114:
        pos += 16  # m_ScriptID
    pos += 16  # m_OldTypeHash

    (node_count, string_size) = struct.unpack_from("<ii", data, pos)
    pos += 8
    pos += node_count * 32  # TypeTreeNode records, blob form
    pos += string_size
    (dependency_count,) = struct.unpack_from("<i", data, pos)
    pos += 4 + dependency_count * 4
    return class_id, pos


def _name_at(data: bytes, start: int, size: int, class_id: int) -> str | None:
    offset = NAME_AT.get(class_id)
    if offset is None:
        return None
    pos = start + offset
    if pos + 4 > len(data) or offset + 4 > size:
        return None
    (length,) = struct.unpack_from("<i", data, pos)
    if not 0 <= length <= MAX_NAME or pos + 4 + length > len(data) or offset + 4 + length > size:
        return None
    raw = data[pos + 4:pos + 4 + length]
    try:
        name = raw.decode("utf-8")
    except UnicodeDecodeError:
        return None
    # A real name is printable. Anything else means the layout assumption did not hold.
    if any(ch < " " for ch in name):
        return None
    return name


def index_bundle(path: Path) -> list[Entry]:
    """Every object in one staged (already decrypted) bundle file."""
    return read_objects(bundle_payload(Path(path).read_bytes()))
