"""Emit the equipment and 封印物 icons into ``resource-gmzz``.

Run from ``tools/`` (after ``gmzz.equipment`` and ``gmzz.relics``)::

    uex export --profile gmzz --only C7/Content/Arts/UI_2/Resource/Item/Large
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
    return webp.is_file() and webp.stat().st_mtime >= png.stat().st_mtime


def build(raw: Path, data_out: Path, res_out: Path) -> tuple[int, int, int]:
    """Convert every equipment/relic icon. Returns (distinct, written, current)."""
    wanted = icon_ids(data_out)

    # Validated up front, exactly as in `gmzz.icons`: data-gmzz and resource-gmzz
    # are committed separately, so a run that converted half the set before
    # failing would ship a dataset naming images the image repo lacks. Coverage
    # is 100% today, so a miss means the export regressed rather than that an
    # icon is legitimately unavailable — an error, not a skip.
    source = Path(raw) / ICON_SOURCE
    export_hint = f"run: uex export --profile gmzz --only {ICON_SOURCE}"
    if not source.is_dir():
        raise FileNotFoundError(f"{source} not found — {export_hint}")
    pngs = {icon: source / f"{icon}.png" for icon in wanted}
    missing = [icon for icon, png in pngs.items() if not png.is_file()]
    if missing:
        raise FileNotFoundError(
            f"{len(missing)} icon(s) absent from the export, e.g. "
            f"{missing[:5]} — a partial export? {export_hint}"
        )

    target = Path(res_out) / OUT_SUBDIR
    target.mkdir(parents=True, exist_ok=True)
    written = 0
    for icon in wanted:
        webp = target / f"{icon}.webp"
        if _is_current(webp, pngs[icon]):
            continue
        with Image.open(pngs[icon]) as img:
            img.save(webp, "WEBP", quality=WEBP_QUALITY, method=6)
        written += 1

    current = len(wanted) - written
    print(f"equipicons: {len(wanted)} icons, {written} written, {current} already current -> {target}")
    return len(wanted), written, current


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
