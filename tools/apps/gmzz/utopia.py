"""Emit the Utopian Theater (乌托邦剧场) memory-fragment cards.

Run from ``tools/``::

    uex export --profile gmzz --only C7/Content/Arts/UI_2/Resource/Skill
    uv run python -m gmzz.utopia

The mode is called ``Mythic`` internally — the client's ``UtopiaTheate`` naming
only survives in its audio paths — so the table is ``MythicCardInfoData``.

**There is no pathway (途径) field.** ``Tag`` separates the 81 universal cards
from the 200 pathway-locked ones, but which of the six pathways each of those
200 belongs to is not in this table, and no table in the export carries it. The
split is therefore *not* emitted rather than guessed: a wiki that states the
wrong pathway is worse than one that doesn't state it. If the mapping turns up,
add it here — the page already groups by tag and quality.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from PIL import Image

from .common import write_json
from .env import excel_dir, require_dir
from .tables import load_strings, load_table, resolve_text, unresolved_ids
from .version import stamp_version

CARD_TABLE = "MythicCardInfoData"
OUT_FILE = "utopia/cards.json"
ICON_SUBDIR = "utopia"
WEBP_QUALITY = 90

#: `CardIcon` is a UE object path, `/Game/<dir>/<Name>.<Name>`. uex exports it
#: under the pak's own root, where `/Game/` is `C7/Content/`.
_OBJECT_PATH = re.compile(r"^/Game/(?P<path>.+?)\.(?P<name>[^.]+)$")


def icon_asset_path(card_icon: str) -> str | None:
    """The exported PNG path (relative to GMZZ_RAW) for a `CardIcon` value."""
    match = _OBJECT_PATH.match(card_icon or "")
    if not match:
        return None
    return f"C7/Content/{match.group('path')}.png"


def build(excel: Path, raw: Path, data_out: Path, res_out: Path) -> tuple[int, int]:
    strings = load_strings(excel)
    rows = resolve_text(load_table(excel, CARD_TABLE), strings)

    cards = []
    for key in sorted(rows, key=int):
        row = rows[key]
        mutex = row.get("MutexCard") or []
        cards.append({
            "cardId": row["CardID"],
            "quality": row["Quality"],
            "tag": row["Tag"],
            "name": row["Name"],
            "description": row["Description"],
            "buffId": row["BuffID"],
            # Client stores an empty table when there are none; normalise to a list.
            "mutexCardIds": list(mutex) if isinstance(mutex, list) else [],
            "icon": Path(row["CardIcon"].split(".")[-1]).name if row.get("CardIcon") else "",
        })

    missing = unresolved_ids(cards)
    if missing:
        raise RuntimeError(
            f"{CARD_TABLE}: {len(missing)} text id(s) had no zh-CN string, e.g. {sorted(missing)[:3]}"
        )

    # Validate every icon before writing anything, so a partial export cannot
    # leave the dataset naming images the image repo does not have.
    wanted: dict[str, Path] = {}
    for key in sorted(rows, key=int):
        card_icon = rows[key].get("CardIcon") or ""
        asset = icon_asset_path(card_icon)
        if asset is None:
            raise RuntimeError(f"card {key}: unparseable CardIcon {card_icon!r}")
        wanted[Path(asset).stem] = Path(raw) / asset
    absent = {name: p for name, p in wanted.items() if not p.is_file()}
    if absent:
        raise FileNotFoundError(
            f"{len(absent)} card icon(s) absent from the export, e.g. "
            f"{sorted(absent)[:3]} — run: uex export --profile gmzz "
            f"--only C7/Content/Arts/UI_2/Resource/Skill"
        )

    target = Path(res_out) / ICON_SUBDIR
    target.mkdir(parents=True, exist_ok=True)
    for name, png in sorted(wanted.items()):
        with Image.open(png) as img:
            img.save(target / f"{name}.webp", "WEBP", quality=WEBP_QUALITY, method=6)
    write_json(Path(data_out) / OUT_FILE, cards)

    print(f"utopia: {len(cards)} cards -> {OUT_FILE}, {len(wanted)} webp -> {target}")
    return len(cards), len(wanted)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--excel", type=Path, default=None)
    parser.add_argument("--raw", type=Path, default=None)
    parser.add_argument("--data-out", type=Path, default=None)
    parser.add_argument("--res-out", type=Path, default=None)
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
