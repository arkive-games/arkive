from __future__ import annotations

from vrising.markers.extract import TerrainMetadata
from vrising.markers.navigation import navigation_points, terrain_chunk_center


def _placement(name: str, coordinate: tuple[int, int]) -> TerrainMetadata:
    return TerrainMetadata(
        entity=(1, 1),
        coordinate=coordinate,
        scene_guid="0" * 32,
        rotation=0,
        map_type=0,
        chunk_name=name,
        has_chunk_portals=False,
        has_spawn_points=False,
    )


def test_terrain_chunk_center_uses_the_reviewed_world_grid():
    assert terrain_chunk_center((9, 10)) == (-1680.0, 0.0, -1520.0)


def test_navigation_points_keep_only_authored_waypoint_chunks():
    points = navigation_points(
        (
            _placement("Farbane_Mid18_Waypoint_Territory", (9, 10)),
            _placement("Farbane_Mid17_Territory", (8, 10)),
            _placement("Dunley_Mid09_Waypoint", (12, 15)),
        )
    )

    assert [point["chunkName"] for point in points] == [
        "Farbane_Mid18_Waypoint_Territory",
        "Dunley_Mid09_Waypoint",
    ]
    assert points[0]["positionPrecision"] == "terrain-chunk-center"
    assert points[1]["worldPosition"] == [-1200.0, 0.0, -720.0]
