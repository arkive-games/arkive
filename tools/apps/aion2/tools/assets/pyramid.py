"""Build downscaled tile-pyramid levels for the aion2 world maps.

The engines render level 0 (the native tiles the game ships) at map zoom 0 and
above. Below that they ask for progressively coarser levels, so that zooming out
costs a handful of small tiles instead of the whole native grid -- which is what
makes a phone able to hold a whole map in memory.

Level ``L`` is the full map downscaled by ``2**L`` and re-cut into ``TILE``-sized
tiles, written to ``<Map>/Res/z-<L>/<Map>_XX_YY.webp``. Level 0 stays exactly
where it is, so no existing tile URL changes.

Two things differ from palworld's slicer, and neither is optional here:

1. **There is no whole-map source image.** The aion2 export ships the map
   already cut into per-tile PNGs, so a level has to be built by stitching the
   grid first. Levels are then produced by halving the previous level rather
   than re-resampling the full image each time -- same result, a fraction of
   the work.

2. **The grids are not powers of two.** aion2 has 8x8, 5x5, 4x4 and 2x2 maps.
   Both engines locate a tile with ``ceil(count / 2**level)``, so a slicer that
   truncates (palworld's ``COUNT >> lvl``, correct only for 8) would write 2
   columns where the engine asks for 3 and every request for the third would
   404. Tile counts here are ceilings, and the right/bottom edge tiles are
   padded out to a full tile.

Usage (from the ``tools`` repo root, with uv)::

    uv run python -m aion2.tools.assets.pyramid            # every map
    uv run python -m aion2.tools.assets.pyramid --only World_L_A
    uv run python -m aion2.tools.assets.pyramid --force
"""

from __future__ import annotations

import argparse
import math
import os
import re
import sys
from pathlib import Path

from PIL import Image

# The native tile edge. Every aion2 map ships 1024px tiles; a map whose tiles
# are a different size is skipped rather than silently mis-tiled.
TILE = 1024

# The engines clamp to map zoom -3 (GameMapView MIN_ZOOM), so deeper levels
# would never be requested.
MAX_LEVELS = 3

TILE_RE = re.compile(r"^(?P<name>.+)_(?P<x>\d+)_(?P<y>\d+)\.(?:png|webp)$")


class UnexpectedTileSize(ValueError):
    """A map whose native tiles are not ``TILE`` square.

    Not fatal to a run: the export holds far more maps than the site ships
    (dungeons, arenas, design scratch maps) and some use other tile sizes, so
    the walker skips those rather than aborting on the first one.
    """


def shipped_map_names(data_out: Path) -> set[str] | None:
    """Names of the maps the site actually serves, from the emitted maps.json.

    The export holds ~70 world-map folders -- design scratch copies, dungeons,
    arenas, a SharedMap bucket -- against the 10 the picker offers. Converting
    or pyramiding the rest is 74 MB of art nothing can reach, and it all ends up
    inside the toy bundle.

    Returns None when maps.json has not been emitted yet, meaning "no filter":
    a first run on a clean checkout should still do something useful.
    """
    path = data_out / "maps.json"
    if not path.is_file():
        return None
    import json

    doc = json.loads(path.read_text(encoding="utf-8"))
    maps = doc["maps"] if isinstance(doc, dict) else doc
    return {m["name"] for m in maps if m.get("name")}


def pyramid_levels(tiles_x: int, tiles_y: int, max_levels: int = MAX_LEVELS) -> int:
    """How many downscaled levels are worth writing for one map.

    Stops once a level fits in a single tile -- halving a 1x1 grid again just
    rewrites the same image at lower quality. A 1x1 map gets no pyramid at all.
    """
    longest = max(tiles_x, tiles_y)
    if longest <= 1:
        return 0
    return min(max_levels, math.ceil(math.log2(longest)))


def _grid(src_dir: Path, name: str) -> dict[tuple[int, int], Path]:
    """Map ``(x, y) -> tile path`` for one map's native tiles."""
    out: dict[tuple[int, int], Path] = {}
    for path in src_dir.glob(f"{name}_*.png"):
        m = TILE_RE.match(path.name)
        if m and m.group("name") == name:
            out[(int(m.group("x")), int(m.group("y")))] = path
    return out


def stitch(src_dir: Path, name: str) -> tuple[Image.Image, int, int] | None:
    """Compose one map's native tiles into a single image.

    Returns ``(image, tiles_x, tiles_y)``, or None when the map has no tiles.
    A hole in the grid is left transparent rather than aborting -- that is a
    resource gap to fix at conversion time, and it should look like one.
    """
    tiles = _grid(src_dir, name)
    if not tiles:
        return None
    tiles_x = max(x for x, _ in tiles) + 1
    tiles_y = max(y for _, y in tiles) + 1
    canvas = Image.new("RGBA", (tiles_x * TILE, tiles_y * TILE), (0, 0, 0, 0))
    for (x, y), path in sorted(tiles.items()):
        with Image.open(path) as tile:
            if tile.size != (TILE, TILE):
                # Some maps' raw art is a higher mip than their declared tile
                # size (World_L_A ships 2048px tiles against a tileWidth of
                # 1024). The conversion caps those at TILE, so the pyramid has
                # to normalise the same way or level 1 would be built from a
                # map twice the size of the level 0 it sits above. Anything
                # that is not a square larger than TILE is a map this pipeline
                # does not understand -- skip it rather than guess.
                if tile.width != tile.height or tile.width < TILE:
                    raise UnexpectedTileSize(
                        f"{path.name}: expected a square >= {TILE}px, "
                        f"got {tile.width}x{tile.height}"
                    )
                tile = tile.resize((TILE, TILE), Image.LANCZOS)
            canvas.paste(tile.convert("RGBA"), (x * TILE, y * TILE))
    return canvas, tiles_x, tiles_y


def _cut(level_img: Image.Image, out_dir: Path, name: str, quality: int) -> int:
    """Cut one downscaled level into padded TILE-sized tiles."""
    out_dir.mkdir(parents=True, exist_ok=True)
    count_x = math.ceil(level_img.width / TILE)
    count_y = math.ceil(level_img.height / TILE)
    written = 0
    for x in range(count_x):
        for y in range(count_y):
            box = (x * TILE, y * TILE, (x + 1) * TILE, (y + 1) * TILE)
            tile = level_img.crop(box)  # crop pads past the edge with zeros
            tile.save(out_dir / f"{name}_{x:02d}_{y:02d}.webp", "WEBP",
                      quality=quality, method=6)
            written += 1
    return written


def build_map_pyramid(
    src_dir: Path,
    dest_dir: Path,
    name: str,
    *,
    quality: int = 90,
    force: bool = False,
) -> tuple[int, int]:
    """Write ``z-1..z-N`` under ``dest_dir`` for one map.

    Returns ``(levels_written, tiles_written)``.
    """
    stitched = stitch(src_dir, name)
    if stitched is None:
        return 0, 0
    full, tiles_x, tiles_y = stitched
    levels = pyramid_levels(tiles_x, tiles_y)

    tiles_written = 0
    level_img = full
    for level in range(1, levels + 1):
        # Halve the previous level rather than resampling the full image again.
        level_img = level_img.resize(
            (max(1, level_img.width // 2), max(1, level_img.height // 2)),
            Image.LANCZOS,
        )
        out_dir = dest_dir / f"z-{level}"
        expected = math.ceil(tiles_x / 2**level) * math.ceil(tiles_y / 2**level)
        if not force and out_dir.is_dir():
            if len(list(out_dir.glob("*.webp"))) == expected:
                continue
        tiles_written += _cut(level_img, out_dir, name, quality)
    return levels, tiles_written


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--only",
        action="append",
        default=None,
        help="Only maps whose name contains this substring (repeatable)",
    )
    parser.add_argument("-q", "--quality", type=int, default=90, help="WebP quality")
    parser.add_argument(
        "-f", "--force", action="store_true", help="Rewrite levels that already look complete"
    )
    args = parser.parse_args(argv)

    raw = os.environ.get("RAW_DATA_PATH")
    res = os.environ.get("AION2_RES_OUT")
    data = os.environ.get("AION2_DATA_OUT")
    if not raw or not res:
        raise SystemExit("RAW_DATA_PATH and AION2_RES_OUT must be set (see tools/.env.example)")
    raw_maps = Path(raw) / "UI" / "Map" / "WorldMap"
    res_maps = Path(res) / "UI" / "Map" / "WorldMap"
    if not raw_maps.is_dir():
        raise SystemExit(f"Raw world-map tree not found: {raw_maps}")

    shipped = shipped_map_names(Path(data)) if data else None
    if shipped is None:
        print("maps.json not found -- building every map in the export", file=sys.stderr)

    total_tiles = 0
    for src_map in sorted(p for p in raw_maps.iterdir() if p.is_dir()):
        name = src_map.name
        if shipped is not None and name not in shipped:
            continue
        if args.only and not any(needle in name for needle in args.only):
            continue
        src_dir = src_map / "Res"
        if not src_dir.is_dir():
            continue
        try:
            levels, written = build_map_pyramid(
                src_dir,
                res_maps / name / "Res",
                name,
                quality=args.quality,
                force=args.force,
            )
        except UnexpectedTileSize as exc:
            print(f"SKIP {name}: {exc}", file=sys.stderr)
            continue
        if levels == 0:
            print(f"SKIP {name}: no tiles, or already a single tile", file=sys.stderr)
            continue
        print(f"{name}: {levels} level(s), {written} tile(s) written")
        total_tiles += written

    print(f"Done: {total_tiles} pyramid tiles.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
