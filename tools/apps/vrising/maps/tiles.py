"""Tiles stage: the single 6080x6080 world map into a WebP tile grid, plus the
``MapIcon_*`` sprites the marker pins use.

Convention is palworld's, unchanged (``tools/apps/palworld/maps/tiles.py``):
ONE native zoom level, tiles at ``<res>/tiles/<MapId>/<MapId>_<xx>_<yy>.webp``
with zero-padded 2-digit ``col_row`` indices, ``(0,0)`` top-left, ``y`` down.
``GameMapTiles`` pins ``minNativeZoom = maxNativeZoom = 0`` and Leaflet scales
for zoom, so there is deliberately no ``{z}/{x}/{y}`` pyramid.

Tile size: 6080 is not divisible by 1024, so this map uses 1216 x 5 = 6080
exactly. Non-1024 tile sizes are established (aion2's Abyss_Battlefield_A ships
1020). Padding to 6144 is rejected on purpose — it would put a fudge factor into
``worldBounds`` and every marker would inherit the error.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

from .extract import WORLD_MAP

Image.MAX_IMAGE_PIXELS = None  # the source map is 6080x6080 (~37 MPx)

MAP_ID = "Vardoran"
MAP_SIZE = 6080
TILE = 1216
COUNT = 5
# Marker-pin sources: every sprite whose stem starts with one of these. The
# whole set is converted even though types.yaml references only a couple, so a
# later taxonomy addition needs no resource re-run.
ICON_PREFIXES = ("MapIcon_", "MiniMapMask")
# A preview render of the whole map, handy for calibration review and for a
# future site card. Long edge in px.
PREVIEW_EDGE = 1520


def tile_grid(size: int, tile: int = TILE) -> tuple[int, int]:
    """``(tile, count)`` for a square map of ``size`` px.

    Raises when ``tile`` does not divide ``size``: a partial edge tile would
    make the pixel grid disagree with ``tileWidth * tilesCountX``, which is the
    denominator of the world->pixel transform.
    """
    if size % tile:
        raise ValueError(
            f"map size {size} is not divisible by tile size {tile}; pick a divisor "
            f"(6080 = 1216x5 = 760x8 = 1520x4) instead of padding the image"
        )
    return tile, size // tile


def _save_webp(img: Image.Image, dest: Path) -> None:
    img.save(dest, "WEBP", quality=90, method=6)


def slice_tiles(src: Path, res_out: Path, tile: int = TILE, count: int = COUNT) -> int:
    """Slice ``src`` into ``count`` x ``count`` ``tile``-px WebP tiles. Returns the count."""
    src, res_out = Path(src), Path(res_out)
    out_dir = res_out / "tiles" / MAP_ID
    out_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    with Image.open(src) as img:
        img = img.convert("RGBA")
        for x in range(count):
            for y in range(count):
                box = (x * tile, y * tile, (x + 1) * tile, (y + 1) * tile)
                _save_webp(img.crop(box), out_dir / f"{MAP_ID}_{x:02d}_{y:02d}.webp")
                written += 1
    return written


def write_preview(src: Path, res_out: Path) -> None:
    """A downscaled whole-map WebP (``preview/Vardoran.webp``) for review."""
    src, res_out = Path(src), Path(res_out)
    out = res_out / "preview"
    out.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as img:
        scale = PREVIEW_EDGE / max(img.size)
        small = img.convert("RGB").resize(
            (round(img.width * scale), round(img.height * scale)), Image.LANCZOS
        )
        _save_webp(small, out / f"{MAP_ID}.webp")


def convert_icons(raw: Path, res_out: Path) -> int:
    """Convert every map-icon sprite to ``<res>/icons/<stem>.webp``. Returns the count."""
    raw, res_out = Path(raw), Path(res_out)
    icon_dir = res_out / "icons"
    icon_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    for src in sorted((raw / "Texture2D").glob("*.png")):
        if not src.stem.startswith(ICON_PREFIXES):
            continue
        with Image.open(src) as im:
            _save_webp(im.convert("RGBA"), icon_dir / f"{src.stem}.webp")
        written += 1
    return written


def run_tiles(raw: Path, data_out: Path, res_out: Path) -> None:
    """Full resource build. ``data_out`` is unused today (no data-driven icon
    list — the whole MapIcon set is converted) but kept in the signature so the
    stage matches the other pipelines' shape."""
    raw, res_out = Path(raw), Path(res_out)
    src = raw / WORLD_MAP
    with Image.open(src) as img:
        if img.width != img.height:
            raise RuntimeError(f"world map is {img.width}x{img.height}, expected a square image")
        tile, count = tile_grid(img.width)
    n = slice_tiles(src, res_out, tile=tile, count=count)
    print(f"tiles: {MAP_ID} {n} tiles of {tile}px ({tile * count}x{tile * count})")
    write_preview(src, res_out)
    print(f"tiles: preview {PREVIEW_EDGE}px")
    icons = convert_icons(raw, res_out)
    print(f"icons: {icons} converted")
