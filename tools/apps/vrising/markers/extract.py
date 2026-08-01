"""Extract spawn-chain marker candidates from the installed V Rising build."""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
import argparse
import json
import math
from pathlib import Path
import struct
from typing import Iterable, Iterator

from ..common import write_json
from .classify import (
    aggregate_display_markers,
    classify_prefab,
    summarize_randomized_resources,
)
from .dots import DotsFile, DotsFormatError
from .randomized import load_randomized_spawn_definitions


WORLD_ENTITIES_NAME = "5b2998a2f0961324d880ab4afec89fe2.0.entities"
ENTITY_SCENES_RELATIVE = Path("VRising_Data/StreamingAssets/EntityScenes")

ENTITY_HASH = 0x6F02124D960C5B29
SPAWN_CHAIN_HASH = 0x6DBFF1C92D859A9B
ROTATION_HASH = 0xB1AC034499F49E3E
TRANSLATION_HASH = 0xA42DE7CC0763E5BE
STATIC_TRANSFORM_INDEX_HASH = 0xDD171D948CCB47EA
TERRAIN_CHUNK_HASH = 0x7E1420EFC0836973
STATIC_HASH = 0x495ADD5CE8198CA0
STORE_SUBSCENE_ENTITY_HASH = 0x18B748B7BEF8D4DF
SIMULATE_HASH = 0x2D6324EC1523C9E0
SCENE_SECTION_HASH = 0xA466B7C9C19E31F1
WORLD_ASSET_CHUNKS_HASH = 0x940DC5B834F717FD

SPAWN_SIGNATURE = frozenset(
    {
        SPAWN_CHAIN_HASH,
        ROTATION_HASH,
        TRANSLATION_HASH,
        STATIC_TRANSFORM_INDEX_HASH,
        TERRAIN_CHUNK_HASH,
        STATIC_HASH,
        STORE_SUBSCENE_ENTITY_HASH,
        SIMULATE_HASH,
        SCENE_SECTION_HASH,
    }
)

# The first serialized hash is TerrainChunkMetadata in the shipped format-77
# world archetype. Its runtime stable hash differs because the current IL2CPP
# metadata describes a later in-memory revision; the full signature and the
# 248-entry cross-reference below make this identification unambiguous.
SERIALIZED_TERRAIN_METADATA_HASH = 0x047D12ED8A2C93F7
WORLD_METADATA_SIGNATURE = frozenset(
    {
        SERIALIZED_TERRAIN_METADATA_HASH,
        0xED278C5A39E448EC,
        0xA6754BAAD3BCCAC3,
        0xB5EE2584E86BC0EA,
        0x6203E7E4958DD319,
        SIMULATE_HASH,
        SCENE_SECTION_HASH,
    }
)

CHUNK_SPAN = 160.0
WORLD_OFFSET = 3200.0
METADATA_ARRAY_OFFSET = 0x200
METADATA_STRIDE = 160

SPAWN_PREFAB_OFFSET = 1088
SPAWN_TRANSLATION_OFFSET = 2112
SPAWN_TERRAIN_CHUNK_OFFSET = 5696
SPAWN_STATIC_INDEX_OFFSET = 5952
SPAWN_CAPACITY = 128


@dataclass(frozen=True)
class TerrainMetadata:
    entity: tuple[int, int]
    coordinate: tuple[int, int]
    scene_guid: str
    rotation: int
    map_type: int
    chunk_name: str
    has_chunk_portals: bool
    has_spawn_points: bool


def _read_fixed_string128(data: bytes, offset: int) -> str:
    length = struct.unpack_from("<H", data, offset)[0]
    if length > 126:
        raise DotsFormatError(f"FixedString128 length {length} exceeds 126")
    try:
        return data[offset + 2 : offset + 2 + length].decode("utf-8")
    except UnicodeDecodeError as exc:
        raise DotsFormatError("invalid UTF-8 in terrain chunk name") from exc


def read_scene_guid(header_path: Path) -> str:
    data = header_path.read_bytes()
    if len(data) < 0x64:
        raise DotsFormatError(f"{header_path}: truncated entity scene header")
    guid = data[0x54:0x64]
    if guid == bytes(16):
        raise DotsFormatError(f"{header_path}: empty scene GUID")
    return guid.hex()


def rotate_local_position(x: float, z: float, rotation: int) -> tuple[float, float]:
    """Rotate a point around a 160-unit terrain tile's centre."""
    if rotation == 0:
        return x, z
    if rotation == 90:
        return z, CHUNK_SPAN - x
    if rotation == 180:
        return CHUNK_SPAN - x, CHUNK_SPAN - z
    if rotation == 270:
        return CHUNK_SPAN - z, x
    raise DotsFormatError(f"unsupported terrain rotation {rotation}")


def world_position(
    local: tuple[float, float, float], coordinate: tuple[int, int], rotation: int
) -> tuple[float, float, float]:
    x, height, z = local
    x, z = rotate_local_position(x, z, rotation)
    return (
        x + coordinate[0] * CHUNK_SPAN - WORLD_OFFSET,
        height,
        z + coordinate[1] * CHUNK_SPAN - WORLD_OFFSET,
    )


def _parse_world_metadata(world: DotsFile) -> dict[tuple[int, int], TerrainMetadata]:
    chunks = world.chunks_for_signature(WORLD_METADATA_SIGNATURE)
    if not chunks:
        raise DotsFormatError(f"{world.path}: terrain metadata archetype not found")
    metadata: dict[tuple[int, int], TerrainMetadata] = {}
    for chunk in chunks:
        for index in range(chunk.entity_count):
            entity = struct.unpack_from("<ii", world.data, chunk.file_offset + 64 + index * 8)
            offset = chunk.file_offset + METADATA_ARRAY_OFFSET + index * METADATA_STRIDE
            x, y = struct.unpack_from("<bb", world.data, offset)
            scene_guid = world.data[offset + 4 : offset + 20].hex()
            rotation, map_type = struct.unpack_from("<ii", world.data, offset + 20)
            chunk_name = _read_fixed_string128(world.data, offset + 28)
            if rotation not in (0, 90, 180, 270) or not chunk_name:
                raise DotsFormatError(
                    f"{world.path}: invalid terrain metadata for entity {entity}"
                )
            if entity in metadata:
                raise DotsFormatError(f"{world.path}: duplicate terrain metadata entity {entity}")
            metadata[entity] = TerrainMetadata(
                entity=entity,
                coordinate=(x, y),
                scene_guid=scene_guid,
                rotation=rotation,
                map_type=map_type,
                chunk_name=chunk_name,
                has_chunk_portals=bool(world.data[offset + 156]),
                has_spawn_points=bool(world.data[offset + 157]),
            )
    return metadata


def load_world_placements(entity_scenes: Path) -> tuple[TerrainMetadata, ...]:
    world = DotsFile(entity_scenes / WORLD_ENTITIES_NAME)
    metadata = _parse_world_metadata(world)
    world_asset_archetypes = {
        index
        for index, archetype in enumerate(world.archetypes)
        if WORLD_ASSET_CHUNKS_HASH in archetype.type_hashes
    }
    chunks = [
        chunk for chunk in world.chunks if chunk.archetype_index in world_asset_archetypes
    ]
    if len(chunks) != 1 or chunks[0].entity_count != 1:
        raise DotsFormatError(
            f"{world.path}: expected one WorldAssetChunks singleton chunk"
        )
    chunk = chunks[0]
    patches = [
        patch
        for patch in world.buffer_patches()
        if patch.chunk_index == chunk.index
        and patch.element_count == len(metadata)
        and patch.allocation_size == patch.element_count * 12
    ]
    if len(patches) != 1:
        raise DotsFormatError(
            f"{world.path}: expected one {len(metadata)}-entry WorldAssetChunks buffer"
        )

    placements: list[TerrainMetadata] = []
    data = patches[0].data
    seen_coordinates: set[tuple[int, int]] = set()
    for index in range(patches[0].element_count):
        x, y, entity_index, entity_version = struct.unpack_from("<bb2xii", data, index * 12)
        entity = (entity_index, entity_version)
        item = metadata.get(entity)
        if item is None:
            raise DotsFormatError(
                f"{world.path}: WorldAssetChunks references missing entity {entity}"
            )
        if item.coordinate != (x, y):
            raise DotsFormatError(
                f"{world.path}: coordinate mismatch for metadata entity {entity}"
            )
        if item.coordinate in seen_coordinates:
            raise DotsFormatError(
                f"{world.path}: duplicate world terrain coordinate {item.coordinate}"
            )
        seen_coordinates.add(item.coordinate)
        placements.append(item)
    if len(placements) != len(metadata):
        raise DotsFormatError(f"{world.path}: incomplete world terrain placement table")
    return tuple(placements)


def load_prefab_names(path: Path) -> dict[int, tuple[str, ...]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"{path}: prefab reference must be a JSON object")
    reverse: dict[int, list[str]] = defaultdict(list)
    for name, prefab_id in raw.items():
        if isinstance(name, str) and isinstance(prefab_id, int):
            reverse[prefab_id].append(name)
    return {prefab_id: tuple(sorted(names)) for prefab_id, names in reverse.items()}


def _header_for_scene(scene_path: Path) -> Path:
    suffix = ".0.entities"
    if not scene_path.name.endswith(suffix):
        raise ValueError(f"not a section-zero entity scene: {scene_path}")
    return scene_path.with_name(scene_path.name[: -len(suffix)] + ".entityheader")


def _spawn_chunks(scene: DotsFile) -> tuple:
    chunks = scene.chunks_for_signature(SPAWN_SIGNATURE)
    for chunk in chunks:
        if chunk.entity_count > SPAWN_CAPACITY:
            raise DotsFormatError(
                f"{scene.path}: spawn-chain chunk count {chunk.entity_count} exceeds "
                f"validated capacity {SPAWN_CAPACITY}"
            )
    return chunks


def _iter_local_spawns(
    scene: DotsFile, prefab_names: dict[int, tuple[str, ...]]
) -> Iterator[dict]:
    for chunk in _spawn_chunks(scene):
        for index in range(chunk.entity_count):
            prefab_id, prefab_type = struct.unpack_from(
                "<ii", scene.data, chunk.file_offset + SPAWN_PREFAB_OFFSET + index * 8
            )
            aliases = prefab_names.get(prefab_id)
            if aliases is None:
                raise DotsFormatError(
                    f"{scene.path}: unknown spawn-chain prefab id {prefab_id}"
                )
            if len(aliases) != 1:
                raise DotsFormatError(
                    f"{scene.path}: ambiguous spawn-chain prefab id {prefab_id}: {aliases}"
                )
            local = struct.unpack_from(
                "<fff", scene.data, chunk.file_offset + SPAWN_TRANSLATION_OFFSET + index * 12
            )
            if not all(math.isfinite(value) for value in local):
                raise DotsFormatError(f"{scene.path}: non-finite spawn-chain translation")
            local_chunk = struct.unpack_from(
                "<bb", scene.data, chunk.file_offset + SPAWN_TERRAIN_CHUNK_OFFSET + index * 2
            )
            if local_chunk != (0, 0):
                raise DotsFormatError(
                    f"{scene.path}: unhandled local terrain chunk {local_chunk}"
                )
            static_index = struct.unpack_from(
                "<i", scene.data, chunk.file_offset + SPAWN_STATIC_INDEX_OFFSET + index * 4
            )[0]
            yield {
                "prefabId": prefab_id,
                "prefabName": aliases[0],
                "prefabType": prefab_type,
                "localPosition": list(local),
                "localTerrainChunk": list(local_chunk),
                "staticTransformIndex": static_index,
            }


def _scene_files(entity_scenes: Path) -> Iterable[Path]:
    return sorted(
        path
        for path in entity_scenes.glob("*.0.entities")
        if path.name != WORLD_ENTITIES_NAME
    )


def iter_marker_audit(
    entity_scenes: Path, prefab_reference: Path
) -> Iterator[dict]:
    """Yield every placed spawn chain, including non-resource audit records."""
    placements = load_world_placements(entity_scenes)
    by_guid: dict[str, list[TerrainMetadata]] = defaultdict(list)
    for placement in placements:
        by_guid[placement.scene_guid].append(placement)
    prefab_names = load_prefab_names(prefab_reference)
    randomized_definitions = load_randomized_spawn_definitions(
        entity_scenes, prefab_names
    )

    for scene_path in _scene_files(entity_scenes):
        scene = DotsFile(scene_path)
        chunks = _spawn_chunks(scene)
        if not chunks:
            continue
        header_path = _header_for_scene(scene_path)
        if not header_path.is_file():
            raise DotsFormatError(f"{scene_path}: matching entityheader is missing")
        scene_guid = read_scene_guid(header_path)
        scene_placements = by_guid.get(scene_guid)
        if not scene_placements:
            raise DotsFormatError(
                f"{scene_path}: scene GUID {scene_guid} has no world placement"
            )
        local_spawns = list(_iter_local_spawns(scene, prefab_names))
        for placement in scene_placements:
            for local_index, local in enumerate(local_spawns):
                position = world_position(
                    tuple(local["localPosition"]), placement.coordinate, placement.rotation
                )
                classification = classify_prefab(local["prefabName"])
                randomized_definition = randomized_definitions.get(local["prefabId"])
                randomized_resources = (
                    summarize_randomized_resources(randomized_definition)
                    if randomized_definition is not None
                    and classification is not None
                    and classification.kind.startswith("random_")
                    else None
                )
                yield {
                    "sourceScene": scene_path.name,
                    "sourceIndex": local_index,
                    "sceneGuid": scene_guid,
                    "chunkName": placement.chunk_name,
                    "chunkCoordinate": list(placement.coordinate),
                    "chunkRotation": placement.rotation,
                    **local,
                    "worldPosition": list(position),
                    "resource": classification.to_dict() if classification else None,
                    "randomizedResources": randomized_resources,
                }


def extract_marker_audit(
    entity_scenes: Path, prefab_reference: Path, output_dir: Path
) -> dict:
    """Write full JSONL audit data, classified resources, and display points."""
    output_dir.mkdir(parents=True, exist_ok=True)
    raw_path = output_dir / "spawn-chains.raw.jsonl"
    resources: list[dict] = []
    prefab_counts: Counter[str] = Counter()
    resource_counts: Counter[str] = Counter()
    scene_counts: Counter[str] = Counter()
    randomized_counts: Counter[str] = Counter()
    total = 0
    with raw_path.open("w", encoding="utf-8", newline="\n") as stream:
        for record in iter_marker_audit(entity_scenes, prefab_reference):
            stream.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
            stream.write("\n")
            total += 1
            prefab_counts[record["prefabName"]] += 1
            scene_counts[record["sourceScene"]] += 1
            if record["resource"]:
                resources.append(record)
                resource_counts[record["resource"]["kind"]] += 1
                if record["randomizedResources"]:
                    randomized_counts[
                        record["randomizedResources"]["settingsPrefabName"]
                    ] += 1

    display = aggregate_display_markers(resources)
    write_json(output_dir / "resources.raw.json", resources)
    write_json(output_dir / "resources.display.json", display)
    world = DotsFile(entity_scenes / WORLD_ENTITIES_NAME)
    version_path = entity_scenes.parents[2] / "VERSION"
    game_version = (
        version_path.read_text(encoding="utf-8").strip()
        if version_path.is_file()
        else None
    )
    summary = {
        "gameVersion": game_version,
        "dotsFileVersion": world.file_version,
        "chunkSize": world.chunk_size,
        "placedSpawnChains": total,
        "resourcePoints": len(resources),
        "displayPoints": len(display),
        "sourceScenes": len(scene_counts),
        "resourceKinds": dict(sorted(resource_counts.items())),
        "randomizedResourceSettings": dict(sorted(randomized_counts.items())),
        "prefabCounts": dict(sorted(prefab_counts.items())),
    }
    write_json(output_dir / "summary.json", summary)
    return summary


def _entity_scenes_from_game_root(game_root: Path) -> Path:
    path = game_root / ENTITY_SCENES_RELATIVE
    if not path.is_dir():
        raise FileNotFoundError(f"V Rising EntityScenes directory not found: {path}")
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--game-root", type=Path, required=True)
    parser.add_argument("--prefabs", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    summary = extract_marker_audit(
        _entity_scenes_from_game_root(args.game_root), args.prefabs, args.output
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
