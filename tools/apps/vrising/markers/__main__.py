"""CLI for extracting curated V Rising resources and V Blood spawns."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from ..env import require_dir
from .bosses import SERVER_ENTITY_SCENES_RELATIVE, extract_boss_markers
from .emit import load_marker_payload
from .extract import ENTITY_SCENES_RELATIVE, extract_marker_audit
from .localization import LOCALIZATION_RELATIVE
from .navigation import extract_navigation_points


PARSED_DIR = Path(__file__).resolve().parent.parent / "parsed" / "markers"


def _required_path(name: str) -> Path:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"{name} is not set: add it to tools/.env (see tools/.env.example)"
        )
    path = Path(value)
    if not path.is_file():
        raise FileNotFoundError(f"{name} does not point to a file: {path}")
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m vrising.markers")
    parser.add_argument("stage", choices=("extract", "verify"))
    args = parser.parse_args(argv)

    if args.stage == "extract":
        game_root = require_dir("VRISING_GAME_ROOT")
        prefabs = _required_path("VRISING_PREFABS")
        vblood = _required_path("VRISING_VBLOOD")
        resources = extract_marker_audit(
            game_root / ENTITY_SCENES_RELATIVE, prefabs, PARSED_DIR
        )
        bosses = extract_boss_markers(game_root, prefabs, vblood, PARSED_DIR)
        navigation = extract_navigation_points(
            game_root / ENTITY_SCENES_RELATIVE,
            game_root / SERVER_ENTITY_SCENES_RELATIVE,
            PARSED_DIR,
        )
        payload = load_marker_payload(PARSED_DIR, game_root / LOCALIZATION_RELATIVE)
        print(
            json.dumps(
                {
                    "resources": resources,
                    "bosses": bosses,
                    "navigation": navigation,
                    "emit": payload["summary"],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        game_root = require_dir("VRISING_GAME_ROOT")
        print(
            json.dumps(
                load_marker_payload(
                    PARSED_DIR, game_root / LOCALIZATION_RELATIVE
                )["summary"],
                indent=2,
            )
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
