"""Extract fixed V Blood spawn positions for the curated public map."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import argparse
import json
import math
from pathlib import Path
import struct
from typing import Iterable

from ..common import write_json
from .dots import BufferPatch, Chunk, DotsFile, DotsFormatError
from .extract import (
    CHUNK_SPAN,
    ENTITY_SCENES_RELATIVE,
    WORLD_OFFSET,
    WORLD_ENTITIES_NAME,
    load_prefab_names,
    load_world_placements,
    read_scene_guid,
    world_position,
)
from .localization import localize_fixed_bosses


SERVER_ENTITY_SCENES_RELATIVE = Path(
    "VRising_Server/VRisingServer_Data/StreamingAssets/EntityScenes"
)

VBLOOD_SOURCE_HASH = 0x0F6E12A8AC0F8BF6
GLOBAL_PATROL_STATE_HASH = 0x306E805BE7E45A67
PATROL_BUS_STOP_NODE_HASH = 0x60486F2701E5B081
TRANSLATION_HASH = 0xA42DE7CC0763E5BE
LOCAL_TO_WORLD_HASH = 0x97490261B3C2DE08
UNIT_ENTRY_HASH = 0x65F288F216C36A6A

# UnitCompositionGroupUnitEntry has InternalBufferCapacity(8).
UNIT_ENTRY_SIZE = 16
UNIT_ENTRY_CAPACITY = 8
UNIT_BUFFER_STRIDE = 16 + UNIT_ENTRY_SIZE * UNIT_ENTRY_CAPACITY

# PatrolBusStopNode has InternalBufferCapacity(6). Each node stores the
# authored terrain chunk and a version-4 BusStopGuid. The GUID identifies the
# road stop at runtime, but its exact within-chunk position is not serialized
# in a form this static extractor can resolve.
PATROL_NODE_SIZE = 20
PATROL_NODE_CAPACITY = 6
PATROL_BUFFER_STRIDE = 16 + PATROL_NODE_SIZE * PATROL_NODE_CAPACITY


@dataclass(frozen=True)
class UnitEntry:
    prefab_id: int
    prefab_name: str
    is_vblood: bool
    custom_vblood_id: int
    custom_vblood_name: str | None
    base_stats_type: int


@dataclass(frozen=True)
class PatrolBusStop:
    chunk_x: int
    chunk_y: int
    bus_stop_guid: str

    @property
    def world_position(self) -> tuple[float, float, float]:
        return (
            self.chunk_x * CHUNK_SPAN - WORLD_OFFSET + CHUNK_SPAN / 2,
            0.0,
            self.chunk_y * CHUNK_SPAN - WORLD_OFFSET + CHUNK_SPAN / 2,
        )


def _unique_name(prefab_names: dict[int, tuple[str, ...]], prefab_id: int) -> str:
    names = prefab_names.get(prefab_id)
    if names is None:
        raise DotsFormatError(f"unknown prefab id {prefab_id}")
    if len(names) != 1:
        raise DotsFormatError(f"ambiguous prefab id {prefab_id}: {names}")
    return names[0]


def load_vblood_metadata(path: Path) -> dict[str, dict]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError(f"{path}: V Blood metadata must be a JSON array")
    result: dict[str, dict] = {}
    for row in raw:
        if not isinstance(row, list) or len(row) < 6:
            raise ValueError(f"{path}: malformed V Blood metadata row")
        display_name, prefab_name, category, level, act, region = row[:6]
        if not isinstance(prefab_name, str) or prefab_name in result:
            raise ValueError(f"{path}: invalid or duplicate V Blood prefab name")
        if level is not None and (
            not isinstance(level, int) or isinstance(level, bool) or level % 10
        ):
            raise ValueError(f"{path}: invalid scaled V Blood level for {prefab_name}")
        result[prefab_name] = {
            "displayName": display_name,
            "category": category,
            "level": level // 10 if level is not None else None,
            "act": act,
            "region": region,
        }
    return result


def _patch_map(patches: Iterable[BufferPatch], chunk_index: int) -> dict[int, BufferPatch]:
    return {
        patch.chunk_buffer_offset: patch
        for patch in patches
        if patch.chunk_index == chunk_index
    }


def _unit_entries_at(
    chunk_data: bytes,
    base: int,
    entity_count: int,
    patches: dict[int, BufferPatch],
    prefab_names: dict[int, tuple[str, ...]],
) -> tuple[tuple[UnitEntry, ...], ...] | None:
    entities: list[tuple[UnitEntry, ...]] = []
    for entity_index in range(entity_count):
        header_offset = base + entity_index * UNIT_BUFFER_STRIDE
        pointer, length, capacity = struct.unpack_from("<Qii", chunk_data, header_offset)
        if pointer != 0 or length <= 0 or capacity < length:
            return None
        if capacity == UNIT_ENTRY_CAPACITY:
            data = memoryview(chunk_data)[
                header_offset + 16 : header_offset + 16 + length * UNIT_ENTRY_SIZE
            ]
        else:
            patch = patches.get(header_offset - 64)
            if patch is None or patch.element_count != length or patch.capacity != capacity:
                return None
            if len(patch.data) < length * UNIT_ENTRY_SIZE:
                return None
            data = patch.data[: length * UNIT_ENTRY_SIZE]

        entries: list[UnitEntry] = []
        for index in range(length):
            offset = index * UNIT_ENTRY_SIZE
            prefab_id = struct.unpack_from("<i", data, offset)[0]
            flag = data[offset + 4]
            padding = bytes(data[offset + 5 : offset + 8])
            custom_id, base_stats_type = struct.unpack_from("<ii", data, offset + 8)
            if flag not in (0, 1) or padding != bytes(3) or not 0 <= base_stats_type <= 16:
                return None
            try:
                prefab_name = _unique_name(prefab_names, prefab_id)
                custom_name = (
                    _unique_name(prefab_names, custom_id) if custom_id != 0 else None
                )
            except DotsFormatError:
                return None
            entries.append(
                UnitEntry(
                    prefab_id=prefab_id,
                    prefab_name=prefab_name,
                    is_vblood=bool(flag),
                    custom_vblood_id=custom_id,
                    custom_vblood_name=custom_name,
                    base_stats_type=base_stats_type,
                )
            )
        if not any(entry.is_vblood for entry in entries):
            return None
        entities.append(tuple(entries))
    return tuple(entities)


def find_unit_entry_buffers(
    scene: DotsFile,
    chunk: Chunk,
    prefab_names: dict[int, tuple[str, ...]],
) -> tuple[tuple[UnitEntry, ...], ...]:
    """Locate and validate the authored unit-composition buffer by its layout."""
    if UNIT_ENTRY_HASH not in scene.archetypes[chunk.archetype_index].type_hashes:
        raise DotsFormatError(f"{scene.path}: unit-entry component is missing")
    chunk_data = scene.data[chunk.file_offset : chunk.file_offset + chunk.size]
    patches = _patch_map(scene.buffer_patches(), chunk.index)
    candidates: list[tuple[tuple[UnitEntry, ...], ...]] = []
    end = chunk.size - chunk.entity_count * UNIT_BUFFER_STRIDE
    for base in range(64, end + 1, 16):
        parsed = _unit_entries_at(
            chunk_data, base, chunk.entity_count, patches, prefab_names
        )
        if parsed is not None:
            candidates.append(parsed)
    if len(candidates) != 1:
        raise DotsFormatError(
            f"{scene.path}: expected one unit-entry buffer layout in chunk "
            f"{chunk.index}, found {len(candidates)}"
        )
    return candidates[0]


def _is_version_4_guid(value: bytes | memoryview) -> bool:
    return (
        len(value) == 16
        and (value[6] & 0xF0) == 0x40
        and (value[8] & 0xC0) == 0x80
    )


def _patrol_nodes_at(
    chunk_data: bytes,
    base: int,
    entity_count: int,
    patches: dict[int, BufferPatch],
) -> tuple[tuple[PatrolBusStop, ...], ...] | None:
    entities: list[tuple[PatrolBusStop, ...]] = []
    for entity_index in range(entity_count):
        header_offset = base + entity_index * PATROL_BUFFER_STRIDE
        pointer, length, capacity = struct.unpack_from("<Qii", chunk_data, header_offset)
        if pointer != 0 or length <= 0 or capacity < length:
            return None
        if capacity == PATROL_NODE_CAPACITY:
            data = memoryview(chunk_data)[
                header_offset + 16 : header_offset + 16 + length * PATROL_NODE_SIZE
            ]
        else:
            patch = patches.get(header_offset - 64)
            if patch is None or patch.element_count != length or patch.capacity != capacity:
                return None
            if len(patch.data) < length * PATROL_NODE_SIZE:
                return None
            data = patch.data[: length * PATROL_NODE_SIZE]

        nodes: list[PatrolBusStop] = []
        for index in range(length):
            offset = index * PATROL_NODE_SIZE
            chunk_x, chunk_y, padding = struct.unpack_from("<bbH", data, offset)
            guid = data[offset + 4 : offset + PATROL_NODE_SIZE]
            if (
                padding != 0
                or not 0 <= chunk_x < 40
                or not 0 <= chunk_y < 40
                or not _is_version_4_guid(guid)
            ):
                return None
            nodes.append(
                PatrolBusStop(
                    chunk_x=chunk_x,
                    chunk_y=chunk_y,
                    bus_stop_guid=bytes(guid).hex(),
                )
            )
        entities.append(tuple(nodes))
    return tuple(entities)


def find_patrol_bus_stop_buffers(
    scene: DotsFile,
    chunk: Chunk,
) -> tuple[tuple[PatrolBusStop, ...], ...]:
    """Locate and validate authored patrol routes without a hard-coded offset."""
    signature = scene.archetypes[chunk.archetype_index].signature
    required = {
        GLOBAL_PATROL_STATE_HASH,
        PATROL_BUS_STOP_NODE_HASH,
        UNIT_ENTRY_HASH,
        VBLOOD_SOURCE_HASH,
    }
    if not required <= signature:
        missing = ", ".join(f"0x{value:016x}" for value in sorted(required - signature))
        raise DotsFormatError(f"{scene.path}: roaming V Blood components are missing: {missing}")
    chunk_data = scene.data[chunk.file_offset : chunk.file_offset + chunk.size]
    patches = _patch_map(scene.buffer_patches(), chunk.index)
    candidates: list[tuple[tuple[PatrolBusStop, ...], ...]] = []
    end = chunk.size - chunk.entity_count * PATROL_BUFFER_STRIDE
    for base in range(64, end + 1, 16):
        parsed = _patrol_nodes_at(chunk_data, base, chunk.entity_count, patches)
        if parsed is not None:
            candidates.append(parsed)
    if len(candidates) != 1:
        raise DotsFormatError(
            f"{scene.path}: expected one patrol-node buffer layout in chunk "
            f"{chunk.index}, found {len(candidates)}"
        )
    return candidates[0]


def find_translations(scene: DotsFile, chunk: Chunk) -> tuple[tuple[float, float, float], ...]:
    """Locate Translation by exact agreement with LocalToWorld's fourth column."""
    signature = scene.archetypes[chunk.archetype_index].signature
    if TRANSLATION_HASH not in signature or LOCAL_TO_WORLD_HASH not in signature:
        raise DotsFormatError(f"{scene.path}: transform components are incomplete")
    data = scene.data[chunk.file_offset : chunk.file_offset + chunk.size]

    translations_by_bytes: dict[bytes, list[int]] = defaultdict(list)
    translation_size = chunk.entity_count * 12
    for offset in range(64, chunk.size - translation_size + 1, 16):
        translations_by_bytes[data[offset : offset + translation_size]].append(offset)

    matches: list[tuple[tuple[float, float, float], ...]] = []
    matrix_size = chunk.entity_count * 64
    for matrix_offset in range(64, chunk.size - matrix_size + 1, 16):
        positions = b"".join(
            data[
                matrix_offset + index * 64 + 48 : matrix_offset + index * 64 + 60
            ]
            for index in range(chunk.entity_count)
        )
        if positions not in translations_by_bytes:
            continue
        affine = True
        for index in range(chunk.entity_count):
            base = matrix_offset + index * 64
            if not all(
                math.isclose(
                    struct.unpack_from("<f", data, base + offset)[0],
                    expected,
                    abs_tol=1e-5,
                )
                for offset, expected in ((12, 0.0), (28, 0.0), (44, 0.0), (60, 1.0))
            ):
                affine = False
                break
            axes = (
                struct.unpack_from("<fff", data, base),
                struct.unpack_from("<fff", data, base + 16),
                struct.unpack_from("<fff", data, base + 32),
            )
            if not all(
                math.isclose(
                    math.dist((0.0, 0.0, 0.0), axis), 1.0, abs_tol=1e-5
                )
                for axis in axes
            ):
                affine = False
                break
        if not affine:
            continue
        values = tuple(
            struct.unpack_from("<fff", positions, index * 12)
            for index in range(chunk.entity_count)
        )
        if all(all(math.isfinite(value) for value in position) for position in values):
            matches.append(values)
    unique = list(dict.fromkeys(matches))
    if len(unique) != 1:
        raise DotsFormatError(
            f"{scene.path}: expected one Translation/LocalToWorld match in chunk "
            f"{chunk.index}, found {len(unique)}"
        )
    return unique[0]


def _boss_payload(
    entry: UnitEntry, vblood_metadata: dict[str, dict]
) -> dict:
    metadata = vblood_metadata.get(entry.prefab_name)
    if metadata is None:
        raise DotsFormatError(
            f"V Blood unit {entry.prefab_name} is missing from V Blood metadata"
        )
    return {
        "prefabId": entry.prefab_id,
        "prefabName": entry.prefab_name,
        **metadata,
    }


def extract_fixed_bosses(
    client_entity_scenes: Path,
    server_entity_scenes: Path,
    prefab_names: dict[int, tuple[str, ...]],
    vblood_metadata: dict[str, dict],
) -> list[dict]:
    placements_by_guid: dict[str, list] = defaultdict(list)
    for placement in load_world_placements(client_entity_scenes):
        placements_by_guid[placement.scene_guid].append(placement)

    records: list[dict] = []
    for scene_path in sorted(server_entity_scenes.glob("*.0.entities")):
        if scene_path.name == WORLD_ENTITIES_NAME:
            continue
        scene = DotsFile(scene_path)
        archetype_indices = {
            index
            for index, archetype in enumerate(scene.archetypes)
            if VBLOOD_SOURCE_HASH in archetype.type_hashes
        }
        if not archetype_indices:
            continue
        header_path = scene_path.with_name(
            scene_path.name.removesuffix(".0.entities") + ".entityheader"
        )
        scene_guid = read_scene_guid(header_path)
        placements = placements_by_guid.get(scene_guid)
        if not placements:
            raise DotsFormatError(
                f"{scene_path}: fixed V Blood scene has no world placement"
            )
        for chunk in scene.chunks:
            if chunk.archetype_index not in archetype_indices or chunk.entity_count == 0:
                continue
            units = find_unit_entry_buffers(scene, chunk, prefab_names)
            translations = find_translations(scene, chunk)
            for entity_index, entries in enumerate(units):
                bosses = [entry for entry in entries if entry.is_vblood]
                if len(bosses) != 1:
                    raise DotsFormatError(
                        f"{scene_path}: entity {entity_index} has {len(bosses)} V Blood units"
                    )
                for placement in placements:
                    records.append(
                        {
                            "movement": "fixed",
                            "boss": _boss_payload(bosses[0], vblood_metadata),
                            "sourceScene": scene_path.name,
                            "sourceChunkIndex": chunk.index,
                            "sourceEntityIndex": entity_index,
                            "sceneGuid": scene_guid,
                            "chunkName": placement.chunk_name,
                            "chunkCoordinate": list(placement.coordinate),
                            "chunkRotation": placement.rotation,
                            "localPosition": list(translations[entity_index]),
                            "worldPosition": list(
                                world_position(
                                    translations[entity_index],
                                    placement.coordinate,
                                    placement.rotation,
                                )
                            ),
                        }
                    )
    return sorted(
        records,
        key=lambda item: (
            item["boss"]["prefabName"],
            item["worldPosition"][0],
            item["worldPosition"][2],
        ),
    )


def extract_roaming_bosses(
    server_entity_scenes: Path,
    prefab_names: dict[int, tuple[str, ...]],
    vblood_metadata: dict[str, dict],
) -> list[dict]:
    """Extract ordered chunk corridors for globally patrolling V Blood units."""
    world_path = server_entity_scenes / WORLD_ENTITIES_NAME
    if not world_path.is_file():
        raise FileNotFoundError(f"bundled-server world scene is missing: {world_path}")
    scene = DotsFile(world_path)
    chunks = [
        chunk
        for chunk in scene.chunks
        if {
            GLOBAL_PATROL_STATE_HASH,
            PATROL_BUS_STOP_NODE_HASH,
            UNIT_ENTRY_HASH,
            VBLOOD_SOURCE_HASH,
        }
        <= scene.archetypes[chunk.archetype_index].signature
    ]
    if len(chunks) != 1:
        raise DotsFormatError(
            f"{world_path}: expected one roaming V Blood chunk, found {len(chunks)}"
        )

    chunk = chunks[0]
    units = find_unit_entry_buffers(scene, chunk, prefab_names)
    routes = find_patrol_bus_stop_buffers(scene, chunk)
    records: list[dict] = []
    for entity_index, (entries, route) in enumerate(zip(units, routes, strict=True)):
        bosses = [entry for entry in entries if entry.is_vblood]
        if len(bosses) != 1:
            raise DotsFormatError(
                f"{world_path}: entity {entity_index} has {len(bosses)} V Blood units"
            )
        records.append(
            {
                "movement": "roaming",
                "boss": _boss_payload(bosses[0], vblood_metadata),
                "sourceScene": world_path.name,
                "sourceChunkIndex": chunk.index,
                "sourceEntityIndex": entity_index,
                "routePrecision": "chunk-corridor",
                "route": [
                    {
                        "terrainChunk": [node.chunk_x, node.chunk_y],
                        "busStopGuid": node.bus_stop_guid,
                        "worldPosition": list(node.world_position),
                    }
                    for node in route
                ],
            }
        )
    return sorted(records, key=lambda item: item["boss"]["prefabName"])


def extract_boss_markers(
    game_root: Path,
    prefab_reference: Path,
    vblood_reference: Path,
    output_dir: Path,
) -> dict:
    client_entity_scenes = game_root / ENTITY_SCENES_RELATIVE
    server_entity_scenes = game_root / SERVER_ENTITY_SCENES_RELATIVE
    if not client_entity_scenes.is_dir() or not server_entity_scenes.is_dir():
        raise FileNotFoundError("V Rising client or bundled-server EntityScenes is missing")
    prefab_names = load_prefab_names(prefab_reference)
    vblood_metadata = load_vblood_metadata(vblood_reference)
    fixed = extract_fixed_bosses(
        client_entity_scenes,
        server_entity_scenes,
        prefab_names,
        vblood_metadata,
    )
    fixed = localize_fixed_bosses(fixed, game_root)
    roaming = extract_roaming_bosses(
        server_entity_scenes,
        prefab_names,
        vblood_metadata,
    )
    roaming = localize_fixed_bosses(roaming, game_root)
    output_dir.mkdir(parents=True, exist_ok=True)
    write_json(output_dir / "bosses.fixed.json", fixed)
    write_json(output_dir / "bosses.roaming.json", roaming)
    summary = {
        "fixedBossPoints": len(fixed),
        "fixedBossPrefabCount": len(
            {item["boss"]["prefabName"] for item in fixed}
        ),
        "roamingBosses": len(roaming),
        "roamingRouteStops": sum(len(item["route"]) for item in roaming),
    }
    write_json(output_dir / "bosses.summary.json", summary)
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--game-root", type=Path, required=True)
    parser.add_argument("--prefabs", type=Path, required=True)
    parser.add_argument("--vblood", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    summary = extract_boss_markers(
        args.game_root, args.prefabs, args.vblood, args.output
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
