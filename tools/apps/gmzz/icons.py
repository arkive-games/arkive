"""Emit the train-trade goods icons into ``resource-gmzz``.

Run from ``tools/`` (after ``gmzz.traintrade``)::

    uv run python -m gmzz.icons

Goods do not carry an icon path. The chain is
``TrainTradeGoodsData.SystemItemID`` → ``ItemNewData.icon`` → a numeric asset
under ``C7/Content/Arts/UI_2/Resource/Item/{Large,Middle,Small}/<icon>.uasset``,
so the icon id is resolved here and written alongside the images as
``traintrade/icons.json``. It is kept out of ``goods.json`` on purpose: every
field there is the client's own, and this one is a join we performed.

Reaching those assets at all requires uex's ``GAME_LordOfMysteries`` provider
with ``paksDir`` set to the **game root** — see this app's README.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

from .common import read_json, write_json
from .env import excel_dir, require_dir
from .tables import load_table
from .version import stamp_version

#: uex writes its PNGs mirroring the virtual path. `Large` is 400x400; `Middle`
#: and `Small` exist but the wiki wants the crisp one and downscales in CSS.
ICON_SOURCE = "C7/Content/Arts/UI_2/Resource/Item/Large"
OUT_SUBDIR = "icons"
WEBP_QUALITY = 90


def goods_icon_ids(excel: Path, goods: list[dict]) -> dict[str, str]:
    """``{goods id: icon id}`` for every row, via the item table.

    Raises if any row fails to resolve: a goods entry with no icon would render
    as a hole in the wiki, and silently skipping it hides a broken join.
    """
    items = load_table(excel, "ItemNewData")
    out: dict[str, str] = {}
    unresolved: list[int] = []
    for row in goods:
        item = items.get(str(row["SystemItemID"]))
        icon = (item or {}).get("icon")
        if not icon:
            unresolved.append(row["ID"])
            continue
        out[str(row["ID"])] = str(icon)
    if unresolved:
        raise RuntimeError(
            f"{len(unresolved)} goods had no icon via ItemNewData, e.g. {unresolved[:5]}"
        )
    return out


def build(excel: Path, raw: Path, data_out: Path, res_out: Path) -> int:
    goods = read_json(Path(data_out) / "traintrade" / "goods.json")
    icons = goods_icon_ids(excel, goods)
    write_json(Path(data_out) / "traintrade" / "icons.json", icons)

    source = Path(raw) / ICON_SOURCE
    if not source.is_dir():
        raise FileNotFoundError(
            f"{source} not found — run: uex export --profile gmzz --only {ICON_SOURCE}"
        )
    target = Path(res_out) / OUT_SUBDIR
    target.mkdir(parents=True, exist_ok=True)

    # The HIGH_ tiers share art with their base tier, so distinct ids < goods rows.
    written = 0
    for icon in sorted(set(icons.values())):
        png = source / f"{icon}.png"
        if not png.is_file():
            raise FileNotFoundError(f"icon {icon} missing from the export: {png}")
        with Image.open(png) as img:
            img.save(target / f"{icon}.webp", "WEBP", quality=WEBP_QUALITY, method=6)
        written += 1
    print(f"icons: {written} webp for {len(icons)} goods -> {target}")
    return written


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--excel", type=Path, default=None, help="override the exported Data/Excel dir")
    parser.add_argument("--raw", type=Path, default=None, help="override GMZZ_RAW")
    parser.add_argument("--data-out", type=Path, default=None, help="override GMZZ_DATA_OUT")
    parser.add_argument("--res-out", type=Path, default=None, help="override GMZZ_RES_OUT")
    args = parser.parse_args(argv)

    data_out = args.data_out or require_dir("GMZZ_DATA_OUT")
    build(
        args.excel or excel_dir(),
        args.raw or require_dir("GMZZ_RAW"),
        data_out,
        args.res_out or require_dir("GMZZ_RES_OUT"),
    )
    stamp_version(data_out)


if __name__ == "__main__":
    main()
