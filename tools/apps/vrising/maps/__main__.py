"""CLI: ``python -m vrising.maps <extract|calibrate|regions|emit|tiles>``.

Paths come from env vars / ``tools/.env`` — required per stage, no defaults
(see ``vrising.env``):
  VRISING_RAW       unex export root
  VRISING_DATA_OUT  data-vrising repo
  VRISING_RES_OUT   resource-vrising repo

Stage order for a cold build:
  extract -> calibrate (once, human-reviewed) -> regions -> emit -> tiles
"""

from __future__ import annotations

import argparse
from pathlib import Path

from ..env import require_dir

PARSED_DIR = Path(__file__).resolve().parent.parent / "parsed"


def main() -> None:
    ap = argparse.ArgumentParser(prog="python -m vrising.maps")
    ap.add_argument("stage", choices=["extract", "calibrate", "regions", "emit", "tiles"])
    args = ap.parse_args()

    if args.stage == "extract":
        from .extract import write_parsed
        write_parsed(require_dir("VRISING_RAW"), PARSED_DIR)
        print(f"extract: wrote {PARSED_DIR}")
    elif args.stage == "calibrate":
        from .calibrate import run_calibrate
        run_calibrate(require_dir("VRISING_RAW"), PARSED_DIR)
    elif args.stage == "regions":
        from .masks import run_regions
        run_regions(require_dir("VRISING_RAW"), PARSED_DIR)
    elif args.stage == "emit":
        from ..version import stamp_version
        from .emit import run_emit
        run_emit(PARSED_DIR, require_dir("VRISING_DATA_OUT"))
        stamp_version(require_dir("VRISING_DATA_OUT"))
    elif args.stage == "tiles":
        from ..version import stamp_version
        from .tiles import run_tiles
        run_tiles(
            require_dir("VRISING_RAW"),
            require_dir("VRISING_DATA_OUT"),
            require_dir("VRISING_RES_OUT"),
        )
        stamp_version(require_dir("VRISING_DATA_OUT"))


if __name__ == "__main__":
    main()
