r"""CLI: ``python -m pbz.maps <scan|speakers|emit|tiles|icons|all>``.

Paths come from env vars / ``tools/.env`` (see ``pbz.env``):
  PBZ_RAW       uex export root
  PBZ_DATA_OUT  data-pbz repo
  PBZ_RES_OUT   resource-pbz repo
  PBZ_GAME      the Steam install, read only to stamp the game build (optional)
  UEX_EXE / UEX_HOME  the uex binary ``scan`` streams the level cells through

The raw export these stages read::

  uex export --profile pbz --only \
    ProjectPBZ/Content/PBZContent/DataTable \
    ProjectPBZ/Content/PBZContent/Maps \
    ProjectPBZ/Content/PBZContent/UI/Texture/Map \
    ProjectPBZ/Content/PBZContent/UI/InGame/Map \
    ProjectPBZ/Content/PBZContent/UI/InGame/Literature/Gallery \
    ProjectPBZ/Content/PBZContent/UI/HUD/White/NeedItem \
    ProjectPBZ/Content/PBZContent/UI/UINew/HUD \
    ProjectPBZ/Content/PBZContent/UI/Inventory/Icon \
    ProjectPBZ/Content/PBZstory/PBZQuest \
    ProjectPBZ/Content/Localization/Game

``scan`` then adds ``placements.json``, ``blueprint_defaults.json``, ``flow_items.json``
and ``flow_speakers.json`` to that
root; they are derived, not exported (see ``scan``).
"""

from __future__ import annotations

import argparse

from ..env import require_dir


def main() -> None:
    ap = argparse.ArgumentParser(prog="python -m pbz.maps")
    ap.add_argument("stage", choices=["scan", "speakers", "emit", "tiles", "icons", "all"])
    ap.add_argument("--only", nargs="*", help="tiles: restrict to these map ids")
    args = ap.parse_args()

    raw = require_dir("PBZ_RAW")
    if args.stage in ("scan", "speakers"):
        from .scan import run_scan, run_speakers
        if args.stage == "scan":
            run_scan(raw)
        run_speakers(raw)  # reads the placements the scan just wrote
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
