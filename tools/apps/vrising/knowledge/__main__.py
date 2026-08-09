"""CLI for verified V Rising knowledge-base data."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from ..common import write_json
from ..env import require_dir
from ..version import stamp_version
from .rewards import extract_vblood_rewards, load_vblood_reward_payload


PARSED_PATH = Path(__file__).resolve().parent.parent / "parsed" / "knowledge" / "vblood-rewards.json"


def _required_file(name: str) -> Path:
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
    parser = argparse.ArgumentParser(prog="python -m vrising.knowledge")
    parser.add_argument("stage", choices=("extract", "verify", "emit"))
    args = parser.parse_args(argv)

    if args.stage == "extract":
        payload = extract_vblood_rewards(
            require_dir("VRISING_GAME_ROOT"),
            _required_file("VRISING_PREFABS"),
            _required_file("VRISING_VBLOOD"),
            _required_file("VRISING_TECH"),
            _required_file("VRISING_RECIPES"),
            PARSED_PATH,
        )
    else:
        payload = load_vblood_reward_payload(PARSED_PATH)

    if args.stage == "emit":
        data_out = require_dir("VRISING_DATA_OUT")
        write_json(data_out / "knowledge" / "vblood-rewards.json", payload)
        stamp_version(data_out)

    print(json.dumps(payload["summary"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

