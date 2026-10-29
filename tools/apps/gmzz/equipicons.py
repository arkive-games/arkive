"""Emit the equipment and 封印物 icons, and the rarity plates behind them, into
``resource-gmzz``.

Run from ``tools/`` (after ``gmzz.equipment`` and ``gmzz.relics``)::

    uex export --profile gmzz --only C7/Content/Arts/UI_2/Resource/Item/Large
    uex export --profile gmzz --only C7/Content/Arts/UI_2/Resource/ConfigIcon/ItemQuality
    uex export --profile gmzz --only C7/Content/Arts/UI_2/Resource/Common_2/Atlas
    uv run python -m gmzz.equipicons

The ids come from the **already-emitted** JSON rather than from the game tables
again. Those two stages perform the joins that decide which items exist at all
(``ItemNewData`` filtered by subtype, the 非凡物质 rows), so re-deriving the set
here would be a second implementation of the same filter, free to drift from the
first. Reading their output also makes the ordering dependency impossible to get
wrong: no ``equipment.json``, no icons.

**The ``icon`` field is not the row's own id.** Item 3001059 (温暖的皮靴) carries
``icon: "3280621"``, and several items share one icon — hence 270 distinct images
for 517 rows. Keying off the row id instead would ask the export for hundreds of
files that were never there and resolve none of the ones that are.

Images land in the same ``icons/`` directory as ``gmzz.icons``, not a second one:
these are all ``Item/Large`` art under the client's own numeric names, so a split
would only invent a distinction the source does not make. The id spaces do not
collide — verified against the goods set, 0 shared ids — but note the collision
risk is real rather than structural: relic artifacts and materials sit in the
same ``2xxxxxx`` band as the train-trade goods, and only their values differ.

**The rarity plates are the game's, not ours.** The client draws every item icon
over ``ConfigIcon/ItemQuality/ItemQuality01..07`` — a dark textured square with a
coloured bar along its foot, white through green, blue, purple, gold and orange
to red — and ``ItemNewData.quality`` is the ``0N`` in that name (the 橙 rows are
quality 6, and 06 is the orange plate). They ship under ``ui/`` with the
client's own names so the page can index them by quality rather than by a
colour table we would otherwise have to keep in step by hand.

**So are the 冒险/竞技 marks.** `UI_Com_Icon_Type_PVE` (a horned mask) and
`UI_Com_Icon_Type_PVP` (crossed swords) are sprites in the shared
`Atlas_Common_2`, which ships as one texture plus a table of rectangles rather
than as files of their own, so they are cut out here by the atlas's own
rectangles and shipped under `ui/` with their sprite names. Which widget draws
them is not provable from the package — the item tips' blueprints are among the
unnamed ones — so the pairing with `ItemNewData.Tag` rests on the names.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

from .common import read_json
from .env import require_dir
from .icons import ICON_SOURCE, OUT_SUBDIR, WEBP_QUALITY

EQUIPMENT_FILE = "equipment/equipment.json"
RELICS_FILE = "relics/relics.json"

#: The rarity plates, ``ItemQuality01.png`` .. ``ItemQuality07.png``.
PLATE_SOURCE = "C7/Content/Arts/UI_2/Resource/ConfigIcon/ItemQuality"
PLATE_OUT_SUBDIR = "ui"
PLATE_QUALITIES = range(1, 8)
#: The 136x136 asset is a 120x120 plate inside a soft drop shadow. The page's
#: tile draws its own border and clips to it, so only the plate is shipped —
#: shadow included, the coloured bar would sit a few pixels above the tile's
#: edge with a translucent gap beneath it.
PLATE_BOX = (9, 9, 129, 129)

#: Sprites cut from the client's shared UI atlas, under their sprite names.
ATLAS_SOURCE = "C7/Content/Arts/UI_2/Resource/Common_2/Atlas"
ATLAS_NAME = "Atlas_Common_2"
ATLAS_SPRITES = ("UI_Com_Icon_Type_PVE", "UI_Com_Icon_Type_PVP")

#: Which module to run when one of the inputs is absent.
_PRODUCER = {EQUIPMENT_FILE: "gmzz.equipment", RELICS_FILE: "gmzz.relics"}


def _load(data_out: Path, rel: str):
    path = Path(data_out) / rel
    if not path.is_file():
        raise RuntimeError(
            f"{path} not found — run: uv run python -m {_PRODUCER[rel]} first"
        )
    return read_json(path)


def icon_ids(data_out: Path) -> list[str]:
    """Every distinct icon id across equipment items, artifacts and materials.

    Sorted so a re-run converts in a stable order and the summary is comparable
    between runs.
    """
    equipment = _load(data_out, EQUIPMENT_FILE)
    relics = _load(data_out, RELICS_FILE)

    rows = [
        *equipment["items"],
        *relics["artifacts"],
        *relics["materials"]["items"],
    ]
    ids = {str(row["icon"]) for row in rows if row.get("icon")}
    if not ids:
        raise RuntimeError(
            f"no icon ids in {EQUIPMENT_FILE} + {RELICS_FILE} — did their shape change?"
        )
    return sorted(ids)


def _is_current(webp: Path, png: Path) -> bool:
    """True when ``webp`` was written from the current ``png``.

    Only an mtime comparison: the conversion is deterministic, so an image newer
    than its source cannot be stale, and re-encoding 270 PNGs on every run costs
    a minute for a byte-identical result.
    """
    return webp.is_file() and webp.stat().st_size > 0 and webp.stat().st_mtime >= png.stat().st_mtime


def _sources(raw: Path, subdir: str, names: list[str], what: str) -> dict[str, Path]:
    """``{name: png}`` for every wanted asset, or raise naming the export to run.

    Validated up front, exactly as in `gmzz.icons`: data-gmzz and resource-gmzz
    are committed separately, so a run that converted half the set before
    failing would ship a dataset naming images the image repo lacks. Coverage
    is 100% today, so a miss means the export regressed rather than that an
    asset is legitimately unavailable — an error, not a skip.
    """
    source = Path(raw) / subdir
    export_hint = f"run: uex export --profile gmzz --only {subdir}"
    if not source.is_dir():
        raise FileNotFoundError(f"{source} not found — {export_hint}")
    pngs = {name: source / f"{name}.png" for name in names}
    missing = [name for name, png in pngs.items() if not png.is_file()]
    if missing:
        raise FileNotFoundError(
            f"{len(missing)} {what}(s) absent from the export, e.g. "
            f"{missing[:5]} — a partial export? {export_hint}"
        )
    return pngs


def _convert(pngs: dict[str, Path], target: Path, box: tuple[int, int, int, int] | None = None) -> int:
    """Write one WebP per source into ``target``; returns how many were (re)written."""
    target.mkdir(parents=True, exist_ok=True)
    written = 0
    for name, png in pngs.items():
        webp = target / f"{name}.webp"
        if _is_current(webp, png):
            continue
        with Image.open(png) as img:
            (img.crop(box) if box else img).save(webp, "WEBP", quality=WEBP_QUALITY, method=6)
        written += 1
    return written


def _atlas_boxes(raw: Path, names: tuple[str, ...]) -> tuple[Path, dict[str, tuple[int, int, int, int]]]:
    """The atlas texture and ``{sprite: crop box}`` for every wanted sprite, or raise.

    The atlas JSON keys each sprite by its name, most with a ``_Sprite`` suffix
    and some (the two marks among them) without, and gives its top-left
    ``StartUV`` and ``Size`` in texture pixels.
    """
    source = Path(raw) / ATLAS_SOURCE
    export_hint = f"run: uex export --profile gmzz --only {ATLAS_SOURCE}"
    table = source / f"{ATLAS_NAME}.json"
    texture = source / f"Texture_{ATLAS_NAME}.png"
    if not table.is_file() or not texture.is_file():
        raise FileNotFoundError(f"{ATLAS_NAME} not found under {source} — {export_hint}")
    sprites = {entry["Key"]: entry["Value"] for entry in read_json(table)[0]["Properties"]["Sprites"]}
    boxes: dict[str, tuple[int, int, int, int]] = {}
    missing: list[str] = []
    for name in names:
        sprite = sprites.get(name) or sprites.get(f"{name}_Sprite")
        if sprite is None:
            missing.append(name)
            continue
        x, y = int(sprite["StartUV"]["X"]), int(sprite["StartUV"]["Y"])
        boxes[name] = (x, y, x + int(sprite["Size"]["X"]), y + int(sprite["Size"]["Y"]))
    if missing:
        raise FileNotFoundError(
            f"{len(missing)} sprite(s) absent from {ATLAS_NAME}, e.g. {missing[:5]} — a partial export? {export_hint}"
        )
    return texture, boxes


def _cut(texture: Path, boxes: dict[str, tuple[int, int, int, int]], target: Path) -> int:
    """Write one WebP per sprite into ``target``; returns how many were (re)written."""
    stale = {name: box for name, box in boxes.items() if not _is_current(target / f"{name}.webp", texture)}
    if not stale:
        return 0
    target.mkdir(parents=True, exist_ok=True)
    with Image.open(texture) as atlas:
        for name, box in stale.items():
            atlas.crop(box).save(target / f"{name}.webp", "WEBP", quality=WEBP_QUALITY, method=6)
    return len(stale)


def build(raw: Path, data_out: Path, res_out: Path) -> tuple[int, int, int]:
    """Convert every equipment/relic icon, the rarity plates and the atlas sprites.

    Returns (distinct, written, current) over all three sets together.
    """
    wanted = icon_ids(data_out)
    plates = [f"ItemQuality{quality:02d}" for quality in PLATE_QUALITIES]

    # Both sources are checked before either is written, for the same reason
    # each is checked before its own conversion.
    icon_pngs = _sources(raw, ICON_SOURCE, wanted, "icon")
    plate_pngs = _sources(raw, PLATE_SOURCE, plates, "plate")
    atlas, sprite_boxes = _atlas_boxes(raw, ATLAS_SPRITES)

    target = Path(res_out) / OUT_SUBDIR
    written = _convert(icon_pngs, target)
    written += _convert(plate_pngs, Path(res_out) / PLATE_OUT_SUBDIR, PLATE_BOX)
    written += _cut(atlas, sprite_boxes, Path(res_out) / PLATE_OUT_SUBDIR)

    total = len(wanted) + len(plates) + len(sprite_boxes)
    current = total - written
    print(
        f"equipicons: {len(wanted)} icons + {len(plates)} plates + {len(sprite_boxes)} sprites, "
        f"{written} written, {current} already current -> {target.parent}"
    )
    return total, written, current


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=None, help="override GMZZ_RAW")
    parser.add_argument("--data-out", type=Path, default=None, help="override GMZZ_DATA_OUT")
    parser.add_argument("--res-out", type=Path, default=None, help="override GMZZ_RES_OUT")
    args = parser.parse_args(argv)

    # No `stamp_version` here. The version is a digest of GMZZ_DATA_OUT's
    # contents, and this stage reads that directory without writing to it, so
    # stamping could only rewrite version.json with the value it already holds.
    build(
        args.raw or require_dir("GMZZ_RAW"),
        args.data_out or require_dir("GMZZ_DATA_OUT"),
        args.res_out or require_dir("GMZZ_RES_OUT"),
    )


if __name__ == "__main__":
    main()
