"""CLI: ``python -m pbz.maps <scan|emit|tiles|icons|all>``.

Paths come from env vars / ``tools/.env`` (see ``pbz.env``):
  PBZ_RAW       uex export root
  PBZ_DATA_OUT  data-pbz repo
  PBZ_RES_OUT   resource-pbz repo
  PBZ_GAME      the Steam install, read only to stamp the game build (optional)
  UEX_EXE / UEX_HOME  the uex binary ``scan`` streams the level cells through

The raw export these stages read is::

  uex export --profile pbz --only \\
    ProjectPBZ/Content/PBZContent/DataTable/UI ProjectPBZ/Content/PBZContent/DataTable/Item \\
    ProjectPBZ/Content/PBZContent/Maps/DT_MapItemData.uasset \\
    ProjectPBZ/Content/PBZContent/Maps/GlobalMapAnchorData.uasset \\
    ProjectPBZ/Content/PBZContent/UI/Texture/Map ProjectPBZ/Content/PBZContent/UI/InGame/Map \\
    ProjectPBZ/Content/PBZContent/DataTable/DT_LevelLootDataTable.uasset \n    ProjectPBZ/Content/PBZContent/DataTable/DT_CodexEnemyDataTable.uasset \n    ProjectPBZ/Content/PBZContent/UI/InGame/Literature/Gallery \n    ProjectPBZ/Content/PBZContent/UI/UINew/items \n    ProjectPBZ/Content/Localization/Game

``scan`` adds ``placements.json`` to that root (not part of the export; see ``scan``).
"""

from __future__ import annotations

import argparse

from ..env import require_dir


def main() -> None:
    ap = argparse.ArgumentParser(prog="python -m pbz.maps")
    ap.add_argument("stage", choices=["scan", "emit", "tiles", "icons", "all"])
    ap.add_argument("--only", nargs="*", help="tiles: restrict to these map ids")
    args = ap.parse_args()

    raw = require_dir("PBZ_RAW")
    if args.stage == "scan":
        from .scan import run_scan
        run_scan(raw)
        return
    if args.stage == "icons":
        from .tiles import convert_icons
        convert_icons(raw, require_dir("PBZ_RES_OUT"))
        return
    if args.stage in ("tiles", "all"):
        from .tiles import run_tiles
        run_tiles(raw, require_dir("PBZ_RES_OUT"), args.only)
    if args.stage in ("emit", "all"):
        from ..version import stamp_version
        from .emit import run_emit
        from .tiles import image_sizes
        data_out = require_dir("PBZ_DATA_OUT")
        run_emit(raw, data_out, image_sizes(raw))
        stamp_version(data_out)


if __name__ == "__main__":
    main()
