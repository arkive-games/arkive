"""Convert the aion2 UI asset trees from the raw export to the resource repo.

One stage per tree, with a per-tree pixel cap where the tree is icon art. The
caps come from an audit of the largest box the frontend ever renders each tree
at (CSS px, so a cap needs headroom for a 2-3x device pixel ratio):

    Item / Item/ETC   56px  (ItemPage hero; everything else is 32px or less)
    Icon              60px  (a selected location marker: 40 * 1.25 * 1.2)
    Portrait          43.2px (a selected creature pin: 40 * 0.9 * 1.2)
    Icon_Arcana       unrendered today, but wired to the 56px ItemIcon path
    Skill             unrendered today

128px covers all of them at DPR 2 with room to spare, and is worth ~4x on the
Item tree (4844 files, 128.9 MB -> ~35 MB) which dominates the resource repo.

Trees deliberately NOT capped:

    Map/WorldMap      1024px tiles -- capping them destroys the map
    Texture/ETC       512x256 tooltip frames / grade banners, not icons
    Texture/BG        a 1024x1024 full-window background plate

Usage (from the ``tools`` repo root, with uv)::

    uv run python -m aion2.tools.assets            # every tree
    uv run python -m aion2.tools.assets --only Item
    uv run python -m aion2.tools.assets --force
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

from .convert_webp import convert_tree
from .pyramid import shipped_map_names

# The world-map folders hold the real grid tiles (``<Map>_XX_YY.png``) next to
# ``_Masked_`` and ``_TransparentMapPath_`` variants and ``*_Design`` maps that
# the frontend never requests -- 77 MB of art, three times the size of the
# tiles themselves. Only the grid is shipped.
GRID_TILE = re.compile(r"^.+_\d+_\d+\.png$", re.IGNORECASE)

# Longest-edge cap in pixels, or None to keep the source size, plus an optional
# filename filter. Paths are relative to <raw>/UI and <resource>/UI alike.
TREES: dict[str, tuple[int | None, "re.Pattern[str] | None"]] = {
    "Resource/Texture/Item": (128, None),
    "Resource/Texture/Icon": (128, None),
    "Resource/Texture/Icon_Arcana": (128, None),
    "Resource/Texture/Portrait": (128, None),
    "Resource/Texture/Skill": (128, None),
    # Not icons -- see the module docstring.
    "Resource/Texture/ETC": (None, None),
    "Resource/Texture/BG": (None, None),
    # Map tiles are capped at the tile size maps.json declares, NOT shipped at
    # native size. Some maps' raw art is a higher mip than their sector plane
    # size -- World_L_A's tiles are 2048px against a declared tileWidth of 1024
    # -- and shipping those natively costs 4x the bytes for pixels the engine
    # scales straight back down into a 1024 slot.
    "Map/WorldMap": (1024, GRID_TILE),
}


def _root(var: str, suffix: str) -> Path:
    value = os.environ.get(var)
    if not value:
        raise SystemExit(f"{var} is not set (see tools/.env.example)")
    return Path(value) / suffix


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--only",
        action="append",
        default=None,
        help="Convert only trees whose path contains this substring (repeatable)",
    )
    parser.add_argument(
        "-f",
        "--force",
        action="store_true",
        help="Reconvert even where an up-to-date .webp exists",
    )
    args = parser.parse_args(argv)

    raw_ui = _root("RAW_DATA_PATH", "UI")
    res_ui = _root("AION2_RES_OUT", "UI")
    if not raw_ui.exists():
        raise SystemExit(f"Raw export UI tree not found: {raw_ui}")

    total_converted = 0
    total_skipped = 0
    data_out = os.environ.get("AION2_DATA_OUT")
    shipped = shipped_map_names(Path(data_out)) if data_out else None

    for rel, (max_size, include) in TREES.items():
        if args.only and not any(needle in rel for needle in args.only):
            continue
        src = raw_ui / rel
        if not src.exists():
            print(f"SKIP {rel}: not in the raw export", file=sys.stderr)
            continue
        cap = f"<={max_size}px" if max_size else "native size"
        print(f"== {rel} ({cap})")
        if rel == "Map/WorldMap" and shipped is not None:
            # Per shipped map rather than the whole tree: the export holds ~70
            # world-map folders against the 10 the picker offers, and the rest
            # is art nothing can reach.
            converted = skipped = 0
            for name in sorted(shipped):
                map_src = src / name / "Res"
                if not map_src.is_dir():
                    continue
                c, s = convert_tree(
                    map_src,
                    res_ui / rel / name / "Res",
                    force=args.force,
                    max_size=max_size,
                    include=include,
                )
                converted += c
                skipped += s
        else:
            converted, skipped = convert_tree(
                src,
                res_ui / rel,
                force=args.force,
                max_size=max_size,
                include=include,
            )
        print(f"   {converted} converted, {skipped} up-to-date")
        total_converted += converted
        total_skipped += skipped

    print(f"Done: {total_converted} converted, {total_skipped} skipped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
