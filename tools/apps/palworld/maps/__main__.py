"""CLI: ``python -m palworld.maps <extract|calibrate|emit|tiles>``.

Paths come from env vars / ``tools/.env`` — required per stage, no defaults
(see ``palworld.env``):
  PALWORLD_RAW       raw UE export root (…/Content/Pal)
  PALWORLD_DATA_OUT  data-palworld repo
  PALWORLD_RES_OUT   resource-palworld repo
"""

from __future__ import annotations

import argparse
from pathlib import Path

from ..env import require_dir

PARSED_DIR = Path(__file__).resolve().parent.parent / "parsed"


def main() -> None:
    ap = argparse.ArgumentParser(prog="python -m palworld.maps")
    ap.add_argument("stage", choices=["extract", "calibrate", "emit", "tiles"])
    args = ap.parse_args()

    if args.stage == "extract":
        from .extract import write_parsed
        write_parsed(require_dir("PALWORLD_RAW"), PARSED_DIR)
        print(f"extract: wrote {PARSED_DIR}")
    elif args.stage == "calibrate":
        from .calibrate import run_calibrate
        run_calibrate(require_dir("PALWORLD_RAW"), PARSED_DIR)
    elif args.stage == "emit":
        from ..version import stamp_version
        from .emit import run_emit
        run_emit(PARSED_DIR, require_dir("PALWORLD_DATA_OUT"))
        stamp_version(require_dir("PALWORLD_DATA_OUT"))
    elif args.stage == "tiles":
        from ..version import stamp_version
        from .tiles import run_tiles
        run_tiles(
            require_dir("PALWORLD_RAW"),
            require_dir("PALWORLD_DATA_OUT"),
            require_dir("PALWORLD_RES_OUT"),
        )
        stamp_version(require_dir("PALWORLD_DATA_OUT"))


if __name__ == "__main__":
    main()
