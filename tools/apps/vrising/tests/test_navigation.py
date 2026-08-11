from __future__ import annotations

import struct

from vrising.markers.extract import TerrainMetadata
from vrising.markers.navigation import (
    CAVE_PORTAL_PREFAB_ID,
    ScenePortal,
    TerrainPortalLink,
    WAYGATE_PREFABS,
    _waypoint_metadata_at,
    cave_passage_points,
)


def _placement(
    name: str,
    coordinate: tuple[int, int],
    *,
    has_chunk_portals: bool = False,
) -> TerrainMetadata:
    return TerrainMetadata(
        entity=(1, 1),
        coordinate=coordinate,
        scene_guid="0" * 32,
        rotation=0,
        map_type=0,
        chunk_name=name,
        has_chunk_portals=has_chunk_portals,
        has_spawn_points=False,
    )


def test_waypoint_metadata_requires_official_prefab_and_authored_transform():
    data = bytearray(72)
    prefab_id = next(iter(WAYGATE_PREFABS))
    struct.pack_into("<i", data, 0, prefab_id)
    struct.pack_into(
        "<16f",
        data,
        4,
        1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0,
        37.5, 10.0, 137.5, 1.0,
    )
    struct.pack_into("<i", data, 68, 5832704)

    (waypoint,) = _waypoint_metadata_at(bytes(data), 0, 1) or ()

    assert waypoint.prefab_id == prefab_id
    assert waypoint.local_position == (37.5, 10.0, 137.5)
    assert waypoint.static_transform_index == 5832704
    struct.pack_into("<i", data, 0, 123456)
    assert _waypoint_metadata_at(bytes(data), 0, 1) is None


def test_cave_passages_keep_only_official_prefab_and_reciprocal_pairs():
    cave_pairs = (
        ((6, 10), (15, 20)),
        ((10, 10), (10, 19)),
        ((12, 10), (10, 14)),
        ((15, 10), (7, 15)),
        ((13, 11), (5, 20)),
    )
    dracula_pair = ((24, 2), (19, 16))
    all_pairs = (*cave_pairs, dracula_pair)
    coordinates = tuple(coordinate for pair in all_pairs for coordinate in pair)
    placements = tuple(
        _placement(f"Chunk_{x}_{y}", (x, y), has_chunk_portals=True)
        for x, y in coordinates
    )
    links = {
        source: (TerrainPortalLink(target, 0),)
        for first, second in all_pairs
        for source, target in ((first, second), (second, first))
    }
    portals = {
        coordinate: (
            ScenePortal(
                CAVE_PORTAL_PREFAB_ID if coordinate not in dracula_pair else 1670626205,
                (1.0, 2.0, 3.0),
                0,
            ),
        )
        for coordinate in coordinates
    }

    points = cave_passage_points(placements, links, portals)

    assert len(points) == 10
    assert len({point["pairId"] for point in points}) == 5
    assert all(point["portalPrefabId"] == CAVE_PORTAL_PREFAB_ID for point in points)
    assert not any(tuple(point["chunkCoordinate"]) in dracula_pair for point in points)
    by_id = {point["endpointId"]: point for point in points}
    assert all(
        by_id[point["pairedEndpointId"]]["pairedEndpointId"] == point["endpointId"]
        for point in points
    )
    first = by_id["navigation-cave-passage-6-10-0"]
    assert first["worldPosition"] == [-2239.0, 2.0, -1597.0]
    assert first["positionPrecision"] == "authored-transform"
    assert first["connection"] == "bidirectional"
    assert {point["connectionGroup"] for point in points} == {1, 2, 3, 4, 5}
