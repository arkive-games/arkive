"""Convert PNG assets from the raw game export to WebP, mirroring the tree.

Recursively walks a source root (e.g. the raw export ``Content/UI``) and writes a
``*.webp`` for every ``*.png`` into the destination root (e.g. ``resource/UI``),
preserving the relative directory structure.

Idempotent: an existing ``.webp`` that is newer than its source ``.png`` is
skipped, so re-running only converts new/changed files. Pass ``--force`` to
reconvert everything.

Usage (from the ``tools`` repo root, with uv)::

    # Marker icons only
    uv run python -m aion2.tools.assets.convert_webp \
        "G:/NCSoft/Export/Exports/AION2/Content/UI/Resource/Texture/Icon" \
        "G:/NCSoft/aion2-map/resource/UI/Resource/Texture/Icon"

    # A single world map's tiles
    uv run python -m aion2.tools.assets.convert_webp \
        "G:/NCSoft/Export/Exports/AION2/Content/UI/Map/WorldMap/World_L_A" \
        "G:/NCSoft/aion2-map/resource/UI/Map/WorldMap/World_L_A"

    # Whole UI tree (large)
    uv run python -m aion2.tools.assets.convert_webp \
        "G:/NCSoft/Export/Exports/AION2/Content/UI" \
        "G:/NCSoft/aion2-map/resource/UI"
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from PIL import Image


def _exceeds(image_path: Path, max_size: int) -> bool:
    """True when an existing output is still larger than the cap."""
    try:
        with Image.open(image_path) as img:
            return max(img.size) > max_size
    except Exception:  # noqa: BLE001 - unreadable output: reconvert it
        return True


def convert_tree(
    src_root: Path,
    dest_root: Path,
    *,
    quality: int = 90,
    lossless: bool = False,
    force: bool = False,
    max_size: int | None = None,
    include: "re.Pattern[str] | None" = None,
) -> tuple[int, int]:
    """Convert every ``*.png`` under ``src_root`` to ``*.webp`` under ``dest_root``.

    ``include`` filters by file NAME (not path) when the source tree holds more
    than the site serves: the world-map folders carry ``_Masked_`` and
    ``_TransparentMapPath_`` variants next to the real tiles, 77 MB of art the
    frontend never requests.

    ``max_size`` caps the longest edge (never enlarges). The icon trees ship at
    256px for a UI that renders them at 32-56px, so capping at conversion time
    is worth roughly 4x on those trees. Leave it unset for anything that is not
    an icon -- map tiles are 1024px by design, and ``Texture/ETC`` /
    ``Texture/BG`` hold 512x256 tooltip frames and a 1024x1024 window plate.

    Returns ``(converted, skipped)`` counts.
    """
    src_root = Path(src_root)
    dest_root = Path(dest_root)
    if not src_root.exists():
        raise SystemExit(f"Source path does not exist: {src_root}")

    pngs = (
        [src_root]
        if src_root.is_file() and src_root.suffix.lower() == ".png"
        else sorted(src_root.rglob("*.png"))
    )
    rel_base = src_root.parent if src_root.is_file() else src_root

    converted = 0
    skipped = 0
    for src_file in pngs:
        if include is not None and not include.match(src_file.name):
            continue
        rel = src_file.relative_to(rel_base)
        dest_file = (dest_root / rel).with_suffix(".webp")

        if not force and dest_file.exists():
            if dest_file.stat().st_mtime >= src_file.stat().st_mtime:
                # An up-to-date output still has to be reconverted when it
                # predates the cap -- otherwise lowering max_size is a silent
                # no-op across the whole tree, since every .webp is newer than
                # the .png it came from.
                if max_size is None or not _exceeds(dest_file, max_size):
                    skipped += 1
                    continue

        dest_file.parent.mkdir(parents=True, exist_ok=True)
        try:
            with Image.open(src_file) as img:
                if max_size is not None and max(img.size) > max_size:
                    # thumbnail() preserves aspect ratio and only ever shrinks.
                    img = img.copy()
                    img.thumbnail((max_size, max_size), Image.LANCZOS)
                if lossless:
                    img.save(dest_file, "WEBP", lossless=True)
                else:
                    img.save(dest_file, "WEBP", quality=quality, method=6)
        except Exception as exc:  # noqa: BLE001 - report and continue
            print(f"FAILED {src_file}: {exc}", file=sys.stderr)
            continue
        converted += 1
        if converted % 100 == 0:
            print(f"  ...{converted} converted")

    return converted, skipped


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("src", help="Source root (PNG tree) or a single .png file")
    parser.add_argument("dest", help="Destination root (WebP tree)")
    parser.add_argument(
        "-q",
        "--quality",
        type=int,
        default=90,
        help="WebP quality 1-100 (default 90; ignored with --lossless)",
    )
    parser.add_argument(
        "--lossless",
        action="store_true",
        help="Lossless WebP (larger files, pixel-exact)",
    )
    parser.add_argument(
        "-f",
        "--force",
        action="store_true",
        help="Reconvert even if an up-to-date .webp exists",
    )
    parser.add_argument(
        "--max-size",
        type=int,
        default=None,
        help=(
            "Cap the longest edge in pixels (never enlarges). Use for icon "
            "trees only -- not for map tiles or full-size UI plates."
        ),
    )
    args = parser.parse_args(argv)

    converted, skipped = convert_tree(
        Path(args.src),
        Path(args.dest),
        quality=args.quality,
        lossless=args.lossless,
        force=args.force,
        max_size=args.max_size,
    )
    print(f"Done: {converted} converted, {skipped} skipped (up-to-date).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
