"""Extract navigation landmarks from authored V Rising terrain metadata."""

from __future__ import annotations

from pathlib import Path

from ..common import write_json
from .extract import CHUNK_SPAN, WORLD_OFFSET, TerrainMetadata, load_world_placements


WAYPOINT_CHUNK_TOKEN = "_Waypoint"
POSITION_PRECISION = "terrain-chunk-center"


def terrain_chunk_center(coordinate: tuple[int, int]) -> tuple[float, float, float]:
    """Return the world-space centre of a 160-unit terrain chunk."""
    half_span = CHUNK_SPAN / 2
    return (
        coordinate[0] * CHUNK_SPAN - WORLD_OFFSET + half_span,
        0.0,
        coordinate[1] * CHUNK_SPAN - WORLD_OFFSET + half_span,
    )


def navigation_points(placements: tuple[TerrainMetadata, ...]) -> list[dict]:
    """Build source-backed waygate points without claiming object precision."""
    points: list[dict] = []
    seen_coordinates: set[tuple[int, int]] = set()
    for placement in placements:
        if WAYPOINT_CHUNK_TOKEN not in placement.chunk_name:
            continue
        if placement.coordinate in seen_coordinates:
            raise ValueError(
                f"duplicate waypoint terrain coordinate {placement.coordinate}"
            )
        seen_coordinates.add(placement.coordinate)
        points.append(
            {
                "kind": "waygate",
                "chunkName": placement.chunk_name,
                "chunkCoordinate": list(placement.coordinate),
                "worldPosition": list(terrain_chunk_center(placement.coordinate)),
                "positionPrecision": POSITION_PRECISION,
            }
        )
    return sorted(points, key=lambda item: (item["chunkCoordinate"], item["chunkName"]))


def extract_navigation_points(entity_scenes: Path, output_dir: Path) -> dict:
    """Write reviewed navigation points recovered from the world placement table."""
    points = navigation_points(load_world_placements(entity_scenes))
    output_dir.mkdir(parents=True, exist_ok=True)
    write_json(output_dir / "navigation.json", points)
    summary = {
        "waygateTerrainChunks": len(points),
        "positionPrecision": POSITION_PRECISION,
    }
    write_json(output_dir / "navigation.summary.json", summary)
    return summary


__all__ = [
    "POSITION_PRECISION",
    "WAYPOINT_CHUNK_TOKEN",
    "extract_navigation_points",
    "navigation_points",
    "terrain_chunk_center",
]
