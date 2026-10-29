"""Tiles stage: each painted area map into a WebP tile pyramid, plus the
legend icons the marker pins use.

Layout is palworld's (``tools/apps/palworld/maps/tiles.py``): level 0 is the
native grid of ``TILE``-px tiles flat in ``tiles/<Map>/``, and levels
1..``TILE_LEVELS`` halve the image per step into ``tiles/<Map>/z-<L>/``, named
``<Map>_<xx>_<yy>.webp`` with (0,0) top-left.

Not every painting is a multiple of the tile size (Pangzhen's is 8192x4512),
so edge tiles are padded with transparency to a full tile. That is safe here
and only here: these maps place markers in image pixels counted from the
top-left, so padding the right and bottom edges moves nothing.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

from ..common import read_json
from .emit import PBZ, RAW_FILES, SUBTYPES, TEXTURE_DIR, TILE, TILE_LEVELS, site_maps
from .projection import anchors_from_asset

Image.MAX_IMAGE_PIXELS = None  # the paintings are up to 8192x8192

ICON_DIRS = (
    PBZ / "UI/InGame/Map", PBZ / "UI/InGame/Map/Texture", PBZ / "UI/HUD/White/NeedItem",
    PBZ / "UI/UINew/HUD", PBZ / "UI/Inventory/Icon",
)
PORTRAIT_DIR = PBZ / "UI/InGame/Literature/Gallery"
ICON_EDGE = 128
# The pins draw every icon `object-fit: cover` inside the same ring, so each one
# is trimmed to its drawn pixels and centred on a square with this much margin:
# a tall key and a squat chest then read at one size.
ICON_MARGIN = 0.2


def _save_webp(img: Image.Image, path: Path, quality: int = 88) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "WEBP", quality=quality, method=6)


def texture_path(raw: Path, texture: str) -> Path:
    return Path(raw) / TEXTURE_DIR / f"{texture}.png"


def image_sizes(raw: Path) -> dict[str, tuple[int, int]]:
    """``{site map id: (width, height)}`` of each painting, read from headers."""
    anchors = anchors_from_asset(read_json(Path(raw) / RAW_FILES["anchors"]))
    maps, _ = site_maps(Path(raw), anchors)
    sizes = {}
    for m in maps:
        with Image.open(texture_path(raw, m["texture"])) as img:
            sizes[m["id"]] = img.size
    return sizes


def slice_pyramid(img: Image.Image, map_id: str, out_dir: Path) -> int:
    img = img.convert("RGBA")
    total = 0
    for level in range(TILE_LEVELS + 1):
        scale = 2 ** level
        src = img if level == 0 else img.resize(
            (max(1, img.width // scale), max(1, img.height // scale)), Image.LANCZOS)
        cols, rows = -(-src.width // TILE), -(-src.height // TILE)
        level_dir = out_dir if level == 0 else out_dir / f"z-{level}"
        for x in range(cols):
            for y in range(rows):
                tile = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
                tile.paste(src.crop((x * TILE, y * TILE, min((x + 1) * TILE, src.width),
                                     min((y + 1) * TILE, src.height))), (0, 0))
                _save_webp(tile, level_dir / f"{map_id}_{x:02d}_{y:02d}.webp")
                total += 1
    return total


def square_icon(img: Image.Image) -> Image.Image:
    """``img`` trimmed to its opaque pixels and centred on a padded square."""
    img = img.convert("RGBA")
    bbox = img.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if bbox:
        img = img.crop(bbox)
    edge = round(max(img.size) / (1 - 2 * ICON_MARGIN))
    canvas = Image.new("RGBA", (edge, edge), (0, 0, 0, 0))
    canvas.paste(img, ((edge - img.width) // 2, (edge - img.height) // 2))
    return canvas.resize((ICON_EDGE, ICON_EDGE), Image.LANCZOS)


def boss_portraits(raw: Path) -> set[str]:
    """The codex portraits ``placements`` puts on boss markers."""
    rows = read_json(Path(raw) / RAW_FILES["codex"])[0]["Rows"].values()
    return {r["WhiteIcon"]["AssetPathName"].rsplit(".", 1)[-1] for r in rows
            if r["bIsBoss"] and r["WhiteIcon"]["AssetPathName"]}


def convert_icons(raw: Path, res_out: Path) -> None:
    for st in SUBTYPES:
        src = next((Path(raw) / d / f"{st.icon}.png" for d in ICON_DIRS
                    if (Path(raw) / d / f"{st.icon}.png").is_file()), None)
        if src is None:
            raise RuntimeError(f"icon {st.icon} for {st.id} is missing from the export")
        with Image.open(src) as img:
            _save_webp(square_icon(img), Path(res_out) / "icons" / f"{st.icon}.webp", quality=92)
    # Portraits are opaque paintings: filling the ring is the point, so no margin.
    portraits = 0
    for name in sorted(boss_portraits(raw)):
        src = Path(raw) / PORTRAIT_DIR / f"{name}.png"
        if not src.is_file():
            continue
        with Image.open(src) as img:
            img = img.convert("RGBA")
            img.thumbnail((ICON_EDGE, ICON_EDGE), Image.LANCZOS)
            _save_webp(img, Path(res_out) / "icons" / f"{name}.webp", quality=88)
            portraits += 1
    print(f"tiles: {len(SUBTYPES)} icons, {portraits} boss portraits")


def run_tiles(raw: Path, res_out: Path, only: list[str] | None = None) -> None:
    raw, res_out = Path(raw), Path(res_out)
    anchors = anchors_from_asset(read_json(raw / RAW_FILES["anchors"]))
    maps, _ = site_maps(raw, anchors)
    for m in maps:
        if only and m["id"] not in only:
            continue
        with Image.open(texture_path(raw, m["texture"])) as img:
            n = slice_pyramid(img, m["id"], res_out / "tiles" / m["id"])
            preview = img.convert("RGB")
            preview.thumbnail((1600, 1600), Image.LANCZOS)
            _save_webp(preview, res_out / "preview" / f"{m['id']}.webp", quality=82)
        print(f"tiles: {m['id']} ({m['texture']}) {n} tiles across {TILE_LEVELS + 1} levels")
    convert_icons(raw, res_out)
