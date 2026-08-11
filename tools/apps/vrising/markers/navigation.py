"""Extract navigation landmarks from authored V Rising terrain metadata."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import math
from pathlib import Path
import struct

from ..common import write_json
from .dots import Chunk, DotsFile, DotsFormatError
from .extract import (
    WORLD_ENTITIES_NAME,
    TerrainMetadata,
    load_world_placements,
    read_scene_guid,
    world_position,
)


AUTHORED_POSITION_PRECISION = "authored-transform"

TERRAIN_CHUNK_PORTAL_BUFFER_HASH = 0x6203E7E4958DD319
CHUNK_SCENE_PORTAL_METADATA_HASH = 0xE31FD2F0834F3442
CHUNK_WAYPOINT_METADATA_HASH = 0x10C26FE7BF544368

WAYGATE_PREFABS = {
    2107199037: "TM_Workstation_Waypoint_World",
    1552296924: "TM_Workstation_Waypoint_World_Cursed",
    1052636561: "TM_Workstation_Waypoint_World_GloomRot_North",
    -540245540: "TM_Workstation_Waypoint_World_GloomRot_South",
    1409226104: "TM_Workstation_Waypoint_World_SilverHills",
    165077432: "TM_Workstation_Waypoint_World_Snow",
    -512512749: "TM_Workstation_Waypoint_World_Strongblade",
    -1340667394: "TM_Workstation_Waypoint_World_UnlockedFromStart",
}
WAYPOINT_RECORD_SIZE = 72
EXPECTED_WAYGATES = 22

CAVE_PORTAL_PREFAB_ID = 200761932
CAVE_PORTAL_PREFAB_NAME = "TM_General_Entrance_Gate"
CAVE_MAP_ICON = "MapIcon_Cave_Entryway"
CAVE_MARKER_ICON = "MapIcon_CavePassage"
CAVE_ABILITY_PREFAB = "AB_Interact_UseEntryway_Cave_AbilityGroup"

TERRAIN_PORTAL_ELEMENT_SIZE = 8
TERRAIN_PORTAL_CAPACITY = 16
TERRAIN_PORTAL_BUFFER_STRIDE = 16 + (
    TERRAIN_PORTAL_ELEMENT_SIZE * TERRAIN_PORTAL_CAPACITY
)
PORTAL_RECORD_SIZE = 72
PORTALS_PER_COMPONENT = 4
PORTAL_COMPONENT_SIZE = PORTAL_RECORD_SIZE * PORTALS_PER_COMPONENT
EXPECTED_CAVE_ENDPOINTS = 10
EXPECTED_CAVE_PAIRS = 5

# Arkive-owned display groups. These are deliberately explicit rather than
# derived from list order so a game update cannot silently renumber a passage.
CAVE_PASSAGE_GROUPS = {
    frozenset(((6, 10), (15, 20))): 1,
    frozenset(((10, 10), (10, 19))): 2,
    frozenset(((12, 10), (10, 14))): 3,
    frozenset(((13, 11), (5, 20))): 4,
    frozenset(((15, 10), (7, 15))): 5,
}


@dataclass(frozen=True)
class TerrainPortalLink:
    target_coordinate: tuple[int, int]
    target_portal_index: int


@dataclass(frozen=True)
class ScenePortal:
    prefab_id: int
    local_position: tuple[float, float, float]
    static_transform_index: int


@dataclass(frozen=True)
class SceneWaypoint:
    prefab_id: int
    local_position: tuple[float, float, float]
    static_transform_index: int


def _terrain_portal_buffers_at(
    chunk_data: bytes,
    base: int,
    placements: tuple[TerrainMetadata, ...],
) -> tuple[tuple[TerrainPortalLink, ...], ...] | None:
    links_by_entity: list[tuple[TerrainPortalLink, ...]] = []
    for entity_index, placement in enumerate(placements):
        header = base + entity_index * TERRAIN_PORTAL_BUFFER_STRIDE
        pointer, length, capacity = struct.unpack_from("<Qii", chunk_data, header)
        if (
            pointer != 0
            or capacity != TERRAIN_PORTAL_CAPACITY
            or not 0 <= length <= TERRAIN_PORTAL_CAPACITY
            or bool(length) != placement.has_chunk_portals
        ):
            return None
        links: list[TerrainPortalLink] = []
        for index in range(length):
            offset = header + 16 + index * TERRAIN_PORTAL_ELEMENT_SIZE
            target_x, target_y, padding, target_portal_index = struct.unpack_from(
                "<bbHi", chunk_data, offset
            )
            if padding != 0 or not 0 <= target_portal_index < PORTALS_PER_COMPONENT:
                return None
            links.append(
                TerrainPortalLink((target_x, target_y), target_portal_index)
            )
        links_by_entity.append(tuple(links))
    return tuple(links_by_entity)


def find_terrain_portal_buffers(
    world: DotsFile,
    chunk: Chunk,
    placements: tuple[TerrainMetadata, ...],
) -> tuple[tuple[TerrainPortalLink, ...], ...]:
    """Locate TerrainChunkPortalBuffer through its invariant serialized layout."""
    if TERRAIN_CHUNK_PORTAL_BUFFER_HASH not in world.archetypes[
        chunk.archetype_index
    ].type_hashes:
        raise DotsFormatError(f"{world.path}: terrain portal buffer is missing")
    if len(placements) != chunk.entity_count or not any(
        placement.has_chunk_portals for placement in placements
    ):
        raise DotsFormatError(f"{world.path}: invalid terrain portal placement group")

    chunk_data = world.data[chunk.file_offset : chunk.file_offset + chunk.size]
    candidates: list[tuple[tuple[TerrainPortalLink, ...], ...]] = []
    end = chunk.size - chunk.entity_count * TERRAIN_PORTAL_BUFFER_STRIDE
    for base in range(64, end + 1, 16):
        parsed = _terrain_portal_buffers_at(chunk_data, base, placements)
        if parsed is not None:
            candidates.append(parsed)
    if len(candidates) != 1:
        raise DotsFormatError(
            f"{world.path}: expected one terrain portal buffer layout in chunk "
            f"{chunk.index}, found {len(candidates)}"
        )
    return candidates[0]


def load_terrain_portal_links(
    entity_scenes: Path,
    placements: tuple[TerrainMetadata, ...],
) -> dict[tuple[int, int], tuple[TerrainPortalLink, ...]]:
    """Read every terrain portal link and tie it back to a placed terrain chunk."""
    world = DotsFile(entity_scenes / WORLD_ENTITIES_NAME)
    by_entity = {placement.entity: placement for placement in placements}
    result: dict[tuple[int, int], tuple[TerrainPortalLink, ...]] = {}
    for chunk in world.chunks:
        archetype = world.archetypes[chunk.archetype_index]
        if TERRAIN_CHUNK_PORTAL_BUFFER_HASH not in archetype.type_hashes:
            continue
        chunk_placements: list[TerrainMetadata] = []
        for index in range(chunk.entity_count):
            entity = struct.unpack_from(
                "<ii", world.data, chunk.file_offset + 64 + index * 8
            )
            placement = by_entity.get(entity)
            if placement is None:
                raise DotsFormatError(
                    f"{world.path}: portal buffer entity {entity} has no terrain metadata"
                )
            chunk_placements.append(placement)
        if not any(placement.has_chunk_portals for placement in chunk_placements):
            continue
        buffers = find_terrain_portal_buffers(
            world, chunk, tuple(chunk_placements)
        )
        for placement, links in zip(chunk_placements, buffers, strict=True):
            if links:
                result[placement.coordinate] = links

    expected = {
        placement.coordinate for placement in placements if placement.has_chunk_portals
    }
    if set(result) != expected:
        raise DotsFormatError(
            f"{world.path}: terrain portal buffers cover {len(result)} of "
            f"{len(expected)} flagged chunks"
        )
    return result


def _is_affine_matrix(data: bytes, offset: int) -> bool:
    values = struct.unpack_from("<16f", data, offset)
    if not all(math.isfinite(value) for value in values):
        return False
    if not all(
        math.isclose(values[index], expected, abs_tol=1e-5)
        for index, expected in ((3, 0.0), (7, 0.0), (11, 0.0), (15, 1.0))
    ):
        return False
    axes = (values[0:3], values[4:7], values[8:11])
    return all(math.isclose(math.dist((0.0, 0.0, 0.0), axis), 1.0, abs_tol=1e-4) for axis in axes)


def _waypoint_metadata_at(
    chunk_data: bytes,
    base: int,
    entity_count: int,
) -> tuple[SceneWaypoint, ...] | None:
    waypoints: list[SceneWaypoint] = []
    for entity_index in range(entity_count):
        offset = base + entity_index * WAYPOINT_RECORD_SIZE
        prefab_id = struct.unpack_from("<i", chunk_data, offset)[0]
        if prefab_id not in WAYGATE_PREFABS or not _is_affine_matrix(
            chunk_data, offset + 4
        ):
            return None
        local_position = struct.unpack_from("<fff", chunk_data, offset + 52)
        static_transform_index = struct.unpack_from("<i", chunk_data, offset + 68)[0]
        if static_transform_index < 0:
            return None
        waypoints.append(
            SceneWaypoint(prefab_id, local_position, static_transform_index)
        )
    return tuple(waypoints)


def find_scene_waypoints(
    scene: DotsFile,
    chunk: Chunk,
) -> tuple[SceneWaypoint, ...]:
    """Locate ChunkWaypointMetadata by its official Prefab and TRS layout."""
    if CHUNK_WAYPOINT_METADATA_HASH not in scene.archetypes[
        chunk.archetype_index
    ].type_hashes:
        raise DotsFormatError(f"{scene.path}: waypoint metadata is missing")
    chunk_data = scene.data[chunk.file_offset : chunk.file_offset + chunk.size]
    candidates: list[tuple[SceneWaypoint, ...]] = []
    end = chunk.size - chunk.entity_count * WAYPOINT_RECORD_SIZE
    for base in range(64, end + 1, 4):
        parsed = _waypoint_metadata_at(chunk_data, base, chunk.entity_count)
        if parsed is not None:
            candidates.append(parsed)
    if len(candidates) != 1:
        raise DotsFormatError(
            f"{scene.path}: expected one waypoint metadata layout in chunk "
            f"{chunk.index}, found {len(candidates)}"
        )
    return candidates[0]


def _scene_portals_at(
    chunk_data: bytes,
    base: int,
    entity_count: int,
) -> tuple[tuple[ScenePortal, ...], ...] | None:
    entities: list[tuple[ScenePortal, ...]] = []
    for entity_index in range(entity_count):
        component = base + entity_index * PORTAL_COMPONENT_SIZE
        portals: list[ScenePortal] = []
        for portal_index in range(PORTALS_PER_COMPONENT):
            offset = component + portal_index * PORTAL_RECORD_SIZE
            prefab_id = struct.unpack_from("<i", chunk_data, offset)[0]
            if prefab_id == 0:
                if portal_index == 0:
                    return None
                if chunk_data[offset : offset + PORTAL_RECORD_SIZE] != bytes(
                    PORTAL_RECORD_SIZE
                ):
                    return None
                continue
            if portal_index != 0:
                return None
            if not _is_affine_matrix(chunk_data, offset + 4):
                return None
            local_position = struct.unpack_from("<fff", chunk_data, offset + 52)
            static_transform_index = struct.unpack_from("<i", chunk_data, offset + 68)[0]
            if static_transform_index < 0:
                return None
            portals.append(
                ScenePortal(prefab_id, local_position, static_transform_index)
            )
        if not portals:
            return None
        entities.append(tuple(portals))
    return tuple(entities)


def find_scene_portals(
    scene: DotsFile,
    chunk: Chunk,
    required_prefab_id: int = CAVE_PORTAL_PREFAB_ID,
) -> tuple[tuple[ScenePortal, ...], ...]:
    """Locate portal metadata containing the required official portal Prefab."""
    if CHUNK_SCENE_PORTAL_METADATA_HASH not in scene.archetypes[
        chunk.archetype_index
    ].type_hashes:
        raise DotsFormatError(f"{scene.path}: scene portal metadata is missing")
    chunk_data = scene.data[chunk.file_offset : chunk.file_offset + chunk.size]
    candidates: list[tuple[tuple[ScenePortal, ...], ...]] = []
    end = chunk.size - chunk.entity_count * PORTAL_COMPONENT_SIZE
    for base in range(64, end + 1, 4):
        parsed = _scene_portals_at(chunk_data, base, chunk.entity_count)
        if parsed is not None and any(
            portal.prefab_id == required_prefab_id
            for entity in parsed
            for portal in entity
        ):
            candidates.append(parsed)
    if not candidates:
        return ()
    if len(candidates) != 1:
        raise DotsFormatError(
            f"{scene.path}: expected one scene portal metadata layout in chunk "
            f"{chunk.index}, found {len(candidates)}"
        )
    return candidates[0]


def _server_scenes_by_guid(entity_scenes: Path) -> dict[str, Path]:
    result: dict[str, Path] = {}
    for header_path in sorted(entity_scenes.glob("*.entityheader")):
        scene_path = header_path.with_name(header_path.stem + ".0.entities")
        if not scene_path.is_file():
            continue
        guid = read_scene_guid(header_path)
        if guid in result:
            raise DotsFormatError(
                f"{entity_scenes}: duplicate server scene GUID {guid}"
            )
        result[guid] = scene_path
    return result


def load_waygate_points(
    server_entity_scenes: Path,
    placements: tuple[TerrainMetadata, ...],
) -> list[dict]:
    """Extract every placed world Waygate from official waypoint metadata."""
    scenes_by_guid = _server_scenes_by_guid(server_entity_scenes)
    placements_by_guid: dict[str, list[TerrainMetadata]] = defaultdict(list)
    for placement in placements:
        placements_by_guid[placement.scene_guid].append(placement)

    points: list[dict] = []
    seen_coordinates: set[tuple[int, int]] = set()
    for scene_guid, scene_placements in sorted(placements_by_guid.items()):
        scene_path = scenes_by_guid.get(scene_guid)
        if scene_path is None:
            continue
        scene = DotsFile(scene_path)
        chunks = [
            chunk
            for chunk in scene.chunks
            if CHUNK_WAYPOINT_METADATA_HASH
            in scene.archetypes[chunk.archetype_index].type_hashes
        ]
        for chunk in chunks:
            waypoints = find_scene_waypoints(scene, chunk)
            for placement in scene_placements:
                for waypoint in waypoints:
                    if placement.coordinate in seen_coordinates:
                        raise DotsFormatError(
                            f"duplicate Waygate terrain coordinate {placement.coordinate}"
                        )
                    seen_coordinates.add(placement.coordinate)
                    authored_world_position = world_position(
                        waypoint.local_position,
                        placement.coordinate,
                        placement.rotation,
                    )
                    points.append(
                        {
                            "kind": "waygate",
                            "waygateId": (
                                f"navigation-waygate-{placement.coordinate[0]}-"
                                f"{placement.coordinate[1]}"
                            ),
                            "chunkName": placement.chunk_name,
                            "chunkCoordinate": list(placement.coordinate),
                            "chunkRotation": placement.rotation,
                            "waypointPrefabId": waypoint.prefab_id,
                            "waypointPrefabName": WAYGATE_PREFABS[waypoint.prefab_id],
                            "localPosition": list(waypoint.local_position),
                            "worldPosition": list(authored_world_position),
                            "positionPrecision": AUTHORED_POSITION_PRECISION,
                        }
                    )

    points.sort(key=lambda item: item["waygateId"])
    if len(points) != EXPECTED_WAYGATES:
        raise DotsFormatError(
            f"expected {EXPECTED_WAYGATES} world Waygates, found {len(points)}"
        )
    return points


def load_scene_portals(
    server_entity_scenes: Path,
    placements: tuple[TerrainMetadata, ...],
) -> dict[tuple[int, int], tuple[ScenePortal, ...]]:
    """Resolve authored portal components for placed chunks that have links."""
    scenes_by_guid = _server_scenes_by_guid(server_entity_scenes)
    result: dict[tuple[int, int], tuple[ScenePortal, ...]] = {}
    for placement in placements:
        if not placement.has_chunk_portals:
            continue
        scene_path = scenes_by_guid.get(placement.scene_guid)
        if scene_path is None:
            raise DotsFormatError(
                f"server scene for terrain chunk {placement.chunk_name} is missing"
            )
        scene = DotsFile(scene_path)
        chunks = [
            chunk
            for chunk in scene.chunks
            if CHUNK_SCENE_PORTAL_METADATA_HASH
            in scene.archetypes[chunk.archetype_index].type_hashes
        ]
        matches = [
            entities
            for chunk in chunks
            if (entities := find_scene_portals(scene, chunk))
        ]
        if not matches:
            continue
        if len(matches) != 1:
            raise DotsFormatError(
                f"{scene.path}: expected one Cave Passage portal component, "
                f"found {len(matches)}"
            )
        entities = matches[0]
        if len(entities) != 1:
            raise DotsFormatError(
                f"{scene.path}: expected one scene portal entity, found {len(entities)}"
            )
        result[placement.coordinate] = entities[0]
    return result


def _endpoint_id(coordinate: tuple[int, int], portal_index: int) -> str:
    return f"navigation-cave-passage-{coordinate[0]}-{coordinate[1]}-{portal_index}"


def _pair_id(
    source: tuple[int, int], target: tuple[int, int]
) -> str:
    first, second = sorted((source, target))
    return (
        f"cave-passage-{first[0]}-{first[1]}-"
        f"{second[0]}-{second[1]}"
    )


def cave_passage_points(
    placements: tuple[TerrainMetadata, ...],
    links_by_coordinate: dict[tuple[int, int], tuple[TerrainPortalLink, ...]],
    portals_by_coordinate: dict[tuple[int, int], tuple[ScenePortal, ...]],
) -> list[dict]:
    """Build official Cave Passage endpoints and validate their two-way pairs."""
    placement_by_coordinate = {placement.coordinate: placement for placement in placements}
    points: list[dict] = []
    for coordinate, links in links_by_coordinate.items():
        placement = placement_by_coordinate[coordinate]
        portals = portals_by_coordinate.get(coordinate)
        if portals is None:
            continue
        if len(portals) != len(links):
            raise DotsFormatError(
                f"{placement.chunk_name}: portal metadata/link count mismatch"
            )
        for portal_index, (link, portal) in enumerate(zip(links, portals, strict=True)):
            if portal.prefab_id != CAVE_PORTAL_PREFAB_ID:
                continue
            target_placement = placement_by_coordinate.get(link.target_coordinate)
            target_links = links_by_coordinate.get(link.target_coordinate)
            target_portals = portals_by_coordinate.get(link.target_coordinate)
            if (
                target_placement is None
                or target_links is None
                or target_portals is None
                or link.target_portal_index >= len(target_links)
                or link.target_portal_index >= len(target_portals)
            ):
                raise DotsFormatError(
                    f"{placement.chunk_name}: cave passage target is missing"
                )
            reverse = target_links[link.target_portal_index]
            target_portal = target_portals[link.target_portal_index]
            if (
                target_portal.prefab_id != CAVE_PORTAL_PREFAB_ID
                or reverse.target_coordinate != coordinate
                or reverse.target_portal_index != portal_index
            ):
                raise DotsFormatError(
                    f"{placement.chunk_name}: cave passage link is not bidirectional"
                )
            local_position = portal.local_position
            authored_world_position = world_position(
                local_position, coordinate, placement.rotation
            )
            pair_key = frozenset((coordinate, link.target_coordinate))
            connection_group = CAVE_PASSAGE_GROUPS.get(pair_key)
            if connection_group is None:
                raise DotsFormatError(
                    f"{placement.chunk_name}: Cave Passage pair has no reviewed "
                    "connection group"
                )
            points.append(
                {
                    "kind": "cave-passage",
                    "endpointId": _endpoint_id(coordinate, portal_index),
                    "pairId": _pair_id(coordinate, link.target_coordinate),
                    "pairedEndpointId": _endpoint_id(
                        link.target_coordinate, link.target_portal_index
                    ),
                    "chunkName": placement.chunk_name,
                    "chunkCoordinate": list(coordinate),
                    "chunkRotation": placement.rotation,
                    "portalIndex": portal_index,
                    "targetChunkCoordinate": list(link.target_coordinate),
                    "targetPortalIndex": link.target_portal_index,
                    "portalPrefabId": portal.prefab_id,
                    "portalPrefabName": CAVE_PORTAL_PREFAB_NAME,
                    "mapIconPrefabName": CAVE_MAP_ICON,
                    "abilityPrefabName": CAVE_ABILITY_PREFAB,
                    "localPosition": list(local_position),
                    "worldPosition": list(authored_world_position),
                    "positionPrecision": AUTHORED_POSITION_PRECISION,
                    "connection": "bidirectional",
                    "connectionGroup": connection_group,
                }
            )

    points.sort(key=lambda item: item["endpointId"])
    pairs: dict[str, list[dict]] = defaultdict(list)
    by_id = {point["endpointId"]: point for point in points}
    for point in points:
        pairs[point["pairId"]].append(point)
        paired = by_id.get(point["pairedEndpointId"])
        if paired is None or paired["pairedEndpointId"] != point["endpointId"]:
            raise DotsFormatError(
                f"cave passage endpoint {point['endpointId']} has no reciprocal endpoint"
            )
    if len(points) != EXPECTED_CAVE_ENDPOINTS or len(pairs) != EXPECTED_CAVE_PAIRS:
        raise DotsFormatError(
            f"expected {EXPECTED_CAVE_ENDPOINTS} Cave Passage endpoints in "
            f"{EXPECTED_CAVE_PAIRS} pairs, found {len(points)} in {len(pairs)}"
        )
    if any(len(pair) != 2 for pair in pairs.values()):
        raise DotsFormatError("every Cave Passage pair must contain exactly two endpoints")
    return points


def extract_navigation_points(
    client_entity_scenes: Path,
    server_entity_scenes: Path,
    output_dir: Path,
) -> dict:
    """Write waygates and official bidirectional Cave Passage endpoints."""
    placements = load_world_placements(client_entity_scenes)
    waygates = load_waygate_points(server_entity_scenes, placements)
    terrain_links = load_terrain_portal_links(client_entity_scenes, placements)
    scene_portals = load_scene_portals(server_entity_scenes, placements)
    cave_passages = cave_passage_points(placements, terrain_links, scene_portals)
    points = [*waygates, *cave_passages]
    output_dir.mkdir(parents=True, exist_ok=True)
    write_json(output_dir / "navigation.json", points)
    summary = {
        "navigationMarkers": len(points),
        "waygateMarkers": len(waygates),
        "cavePassageEndpoints": len(cave_passages),
        "cavePassagePairs": len({item["pairId"] for item in cave_passages}),
        "waygatePositionPrecision": AUTHORED_POSITION_PRECISION,
        "cavePassagePositionPrecision": AUTHORED_POSITION_PRECISION,
    }
    write_json(output_dir / "navigation.summary.json", summary)
    return summary


__all__ = [
    "AUTHORED_POSITION_PRECISION",
    "CAVE_ABILITY_PREFAB",
    "CAVE_MAP_ICON",
    "CAVE_MARKER_ICON",
    "CAVE_PORTAL_PREFAB_ID",
    "CAVE_PORTAL_PREFAB_NAME",
    "CAVE_PASSAGE_GROUPS",
    "CHUNK_SCENE_PORTAL_METADATA_HASH",
    "CHUNK_WAYPOINT_METADATA_HASH",
    "EXPECTED_WAYGATES",
    "ScenePortal",
    "SceneWaypoint",
    "TERRAIN_CHUNK_PORTAL_BUFFER_HASH",
    "TerrainPortalLink",
    "WAYGATE_PREFABS",
    "cave_passage_points",
    "extract_navigation_points",
    "find_scene_portals",
    "find_scene_waypoints",
    "find_terrain_portal_buffers",
    "load_scene_portals",
    "load_terrain_portal_links",
    "load_waygate_points",
]
