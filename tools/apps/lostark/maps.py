"""Zone maps: minimap tiles, their world georeferencing, and the placed actors.

Two files per map id under ``LOSTARK_MAPDATA`` carry everything the frontend
needs, so the world-to-pixel transform here is **read from the client** rather
than fitted against the art the way V Rising's had to be (see ``tools/AGENTS.md``):

``MinimapData.loa``
    The minimap volume: a ``_Full`` texture name, a tile count, then one record
    per tile holding the tile's own world AABB and its column/row. Tiles cover
    the volume uniformly, so their union is the map's world bounds and the
    per-tile mapping is exactly the global linear one.

``DeployData.loa``
    Placed actors as ``CEFDeployActor_<Class>`` markers, each followed
    immediately by its world X and Y.

Calibration note, because the numbers mislead: checking that actor positions
fall inside the map AABB proves nothing — the box is large enough that six
different byte offsets all scored 100%. What discriminates is the fraction
landing on *opaque* pixels of the walkable silhouette (~4% for a random
scatter, 73.6% for the accepted transform on Luterra Castle).
:func:`verify_alignment` keeps that check runnable, and ``python -m lostark
maps`` refuses to write below :data:`MIN_ALIGNMENT`.
"""

from __future__ import annotations

import re
import struct
from dataclasses import dataclass
from pathlib import Path

from .loa import Bounds, finite

# Actor classes worth putting on a map, and the subtype id each becomes.
# Deliberately a subset: PathNode/Path/TrackMove describe patrol geometry rather
# than places, and would swamp the map with tens of thousands of dots.
ACTOR_SUBTYPES: dict[str, str] = {
    "NPC": "npc",
    "Prop": "prop",
    "Spot": "spot",
    "QuestZone": "questzone",
    "PortalPoint": "portal",
    "TeleportPoint": "teleport",
    "Trap": "trap",
    "Vehicle": "vehicle",
    "Transport": "transport",
    "Tower": "tower",
    "ClientMonster": "monster",
}

# Presentation for the subtypes above. Colours only: the client ships no icon
# for a deploy actor, and inventing artwork would misrepresent the source.
SUBTYPE_COLORS: dict[str, str] = {
    "npc": "#ff5a5a",
    "prop": "#5ac8ff",
    "spot": "#ffd23c",
    "questzone": "#7cff8c",
    "portal": "#b478ff",
    "teleport": "#b478ff",
    "trap": "#ff8c3c",
    "vehicle": "#8cd8c8",
    "transport": "#8cd8c8",
    "tower": "#d8d8d8",
    "monster": "#ff5a5a",
}

_ACTOR = re.compile(rb"CEFDeployActor_([A-Za-z]+)\x00")
_TILE_SUFFIX = re.compile(r"_(\d+)x(\d+)$")

# Floor for :func:`verify_alignment`. A correct transform scored 73.6% on the
# reference map and a random scatter scores about the silhouette's own coverage
# (~4%), so this sits far above noise and well below the honest result.
MIN_ALIGNMENT = 0.5

# Marker pin size relative to the engine's default of 1.25. Zone maps here are
# ~2048px across and carry a couple of thousand points, so the default buries
# the art under overlapping dots.
PIN_SCALE = 0.45


@dataclass(frozen=True)
class Tile:
    """One minimap tile: its texture name and the world box it covers.

    Deliberately carries no grid indices. The ``<a>x<b>`` in the name is not the
    pixel grid position (see :class:`MinimapVolume`), and keeping the parsed
    numbers around only invites someone to lay tiles out with them.
    """

    name: str
    bounds: Bounds


@dataclass(frozen=True)
class MinimapVolume:
    """A map's tile grid plus the world box it covers.

    The ``<a>x<b>`` suffix in a tile's name is NOT its pixel grid position.
    World X *decreases* as ``a`` increases, so tile ``0x0`` holds the highest X
    and belongs at the right-hand edge. Laying tiles out by name while mapping
    positions inside each tile by increasing X mirrors the art across tile
    boundaries — consistent within a tile, scrambled between them, and
    invisible to any check that builds its reference mosaic the same wrong way.
    So grid slots are derived from each tile's own AABB instead.
    """

    map_id: str
    texture_stem: str
    tiles: list[Tile]

    @property
    def bounds(self) -> Bounds:
        box = self.tiles[0].bounds
        for tile in self.tiles[1:]:
            box = box.union(tile.bounds)
        return box

    @property
    def tile_span(self) -> tuple[float, float]:
        """One tile's world width and height (uniform across the volume)."""
        first = self.tiles[0]
        return first.bounds.width, first.bounds.height

    @property
    def cols(self) -> int:
        span_x, _ = self.tile_span
        return round(self.bounds.width / span_x)

    @property
    def rows(self) -> int:
        _, span_y = self.tile_span
        return round(self.bounds.height / span_y)

    def placements(self) -> dict[tuple[int, int], Tile]:
        """Each tile keyed by its ``(column, row)`` slot in the image grid.

        Derived through the same orientation the frontend is told to use
        (``flipX=False``, ``flipY=True``): column ascends with world X, and row 0
        is the highest world Y because image rows run downward.
        """
        box = self.bounds
        span_x, span_y = self.tile_span
        out: dict[tuple[int, int], Tile] = {}
        for tile in self.tiles:
            col = round((tile.bounds.min_x - box.min_x) / span_x)
            row = round((box.max_y - tile.bounds.max_y) / span_y)
            out[(col, row)] = tile
        return out


@dataclass(frozen=True)
class Actor:
    subtype: str
    x: float
    y: float


def read_minimap(path: Path, map_id: str) -> MinimapVolume | None:
    """The tile grid for one map, or ``None`` when the map ships no minimap.

    Anchors on ``<STEM>_<col>x<row>`` names rather than walking the record
    stream, so an unexpected field elsewhere cannot shift the parse. The tile
    payload is six floats (min x/y/z, max x/y/z) followed by two ints; the
    ints repeat the grid position that the name already gives, so the name
    wins and they are ignored.
    """
    data = path.read_bytes()
    tiles: list[Tile] = []
    stems: set[str] = set()
    for match in re.finditer(rb"([A-Za-z0-9_]+_\d+x\d+)\x00", data):
        name = match.group(1).decode("ascii")
        suffix = _TILE_SUFFIX.search(name)
        if not suffix:
            continue
        values = struct.unpack_from("<6f", data, match.end()) if match.end() + 24 <= len(data) else None
        if values is None or not finite(*values):
            continue
        tiles.append(Tile(name, Bounds(*values)))
        stems.add(name[: suffix.start()])

    if not tiles:
        return None
    # One volume per map in every file seen; if that ever stops holding, the
    # ambiguity should be loud rather than silently resolved to the first.
    if len(stems) != 1:
        raise ValueError(f"{path}: expected one tile stem, found {sorted(stems)}")
    return MinimapVolume(map_id=map_id, texture_stem=stems.pop(), tiles=tiles)


def read_actors(path: Path, bounds: Bounds) -> list[Actor]:
    """Placed actors of the mapped classes, dropping any outside the volume.

    The two floats after the class string are world X and Y. Out-of-bounds
    positions are dropped rather than clamped: a clamped point is a silent lie
    on the map, whereas a dropped one shows up in the emitted counts.
    """
    data = path.read_bytes()
    actors: list[Actor] = []
    for match in _ACTOR.finditer(data):
        subtype = ACTOR_SUBTYPES.get(match.group(1).decode("ascii"))
        if subtype is None:
            continue
        end = match.end()
        if end + 8 > len(data):
            continue
        x, y = struct.unpack_from("<ff", data, end)
        if not finite(x, y) or not bounds.contains(x, y):
            continue
        actors.append(Actor(subtype, x, y))
    return actors


def map_meta(volume: MinimapVolume, tile_px: int, name: str) -> dict[str, object]:
    """The ``GameMapMeta`` row the frontend's map engine consumes.

    ``flipY`` is true because world Y increases upward while image rows increase
    downward; ``pxAxis`` stays X. Verified by scoring points against the
    walkable silhouette, not assumed from the other games' conventions.
    """
    box = volume.bounds
    return {
        "id": volume.map_id,
        "name": name,
        "type": "zone",
        "tileWidth": tile_px,
        "tileHeight": tile_px,
        "tilesCountX": volume.cols,
        "tilesCountY": volume.rows,
        "isVisible": True,
        "worldBounds": {
            "min": {"x": box.min_x, "y": box.min_y},
            "max": {"x": box.max_x, "y": box.max_y},
        },
        "orientation": {"pxAxis": "X", "flipX": False, "flipY": True},
    }


def markers(actors: list[Actor]) -> list[dict[str, object]]:
    """Actors as marker rows, in the shared data contract's shape."""
    per_subtype: dict[str, int] = {}
    rows: list[dict[str, object]] = []
    for actor in actors:
        index = per_subtype.get(actor.subtype, 0)
        per_subtype[actor.subtype] = index + 1
        rows.append(
            {
                "id": f"{actor.subtype}-{index}",
                "subtype": actor.subtype,
                "x": round(actor.x, 2),
                "y": round(actor.y, 2),
                "images": [],
                "contributors": [],
                "indexInSubtype": index,
            }
        )
    return rows


def tile_images(art_root: Path, volume: MinimapVolume) -> dict[tuple[int, int], Path]:
    """The exported PNG for each tile, by grid position.

    ``laex`` writes one directory per package with lowercased texture names.
    Tiles are looked up rather than globbed so a missing one is visible to the
    caller instead of silently shrinking the grid.
    """
    found: dict[tuple[int, int], Path] = {}
    for slot, tile in volume.placements().items():
        for candidate in art_root.rglob(f"{tile.name.lower()}.png"):
            found[slot] = candidate
            break
    return found


def world_to_pixel(
    volume: MinimapVolume, tile_px: int, x: float, y: float
) -> tuple[float, float]:
    """World position to a pixel on the assembled grid.

    Mirrors ``worldToPixel`` in ``@gamemap/map-engine-gl`` for the orientation
    :func:`map_meta` declares, so the check below tests what the frontend will
    actually draw rather than a private convention.
    """
    box = volume.bounds
    width = volume.cols * tile_px
    height = volume.rows * tile_px
    px = (x - box.min_x) / box.width * width
    py = height - (y - box.min_y) / box.height * height  # flipY
    return px, py


def verify_alignment(
    volume: MinimapVolume,
    actors: list[Actor],
    images: dict[tuple[int, int], Path],
) -> tuple[float, int]:
    """Fraction of actors landing on walkable (opaque) pixels, and the count.

    This is the transform's only honest test. Containment in the map AABB is
    worthless — the box is large enough that several wrong byte offsets score
    100% — whereas a wrong transform scatters points into transparent void,
    where a random placement scores roughly the silhouette's own coverage (~4%).

    Both the mosaic and the points go through the *global* transform, which is
    the point: an earlier version placed tiles by their name and sampled within
    each tile, so a grid mirrored across tile boundaries scored just as well as
    a correct one. Import is local so the emit path does not pay for Pillow.
    """
    from PIL import Image

    if not images or not actors:
        return 0.0, 0

    tile_px = max(Image.open(p).size[0] for p in images.values())
    mosaic = Image.new("L", (volume.cols * tile_px, volume.rows * tile_px), 0)
    for (col, row), path in images.items():
        alpha = Image.open(path).convert("RGBA").getchannel("A")
        mosaic.paste(alpha, (col * tile_px, row * tile_px))
    pixels = mosaic.load()
    width, height = mosaic.size

    on = 0
    for actor in actors:
        px, py = world_to_pixel(volume, tile_px, actor.x, actor.y)
        ix = min(max(int(px), 0), width - 1)
        iy = min(max(int(py), 0), height - 1)
        if pixels[ix, iy] > 8:
            on += 1
    return on / len(actors), len(actors)


def write_tiles(
    images: dict[tuple[int, int], Path],
    out_dir: Path,
    map_id: str,
) -> tuple[int, int]:
    """Convert each tile to WebP under ``tiles/<mapId>/``; returns (written, px).

    Named ``<mapId>_<col>_<row>.webp`` with zero-padded indices, matching the
    convention the other games' tile sets already use.
    """
    from PIL import Image

    target = out_dir / "tiles" / map_id
    target.mkdir(parents=True, exist_ok=True)
    tile_px = 0
    for (col, row), path in sorted(images.items()):
        image = Image.open(path).convert("RGBA")
        tile_px = max(tile_px, image.size[0])
        image.save(target / f"{map_id}_{col:02d}_{row:02d}.webp", "WEBP", quality=90, method=6)
    return len(images), tile_px


def types(actors: list[Actor]) -> dict[str, object]:
    """The taxonomy for the subtypes actually present on the emitted maps."""
    present = sorted({actor.subtype for actor in actors})
    return {
        "categories": [
            {
                "id": "deploy",
                "pinVariant": "pin",
                "subtypes": [
                    {
                        "id": subtype,
                        "color": SUBTYPE_COLORS.get(subtype, "#d8d8d8"),
                        "pinVariant": "pin",
                        # The engine's default (1.25) is sized for maps several
                        # times this one's 2048px, where it buries the zone
                        # under overlapping dots.
                        "iconScale": PIN_SCALE,
                        "defaultActive": subtype != "prop",
                    }
                    for subtype in present
                ],
            }
        ]
    }
