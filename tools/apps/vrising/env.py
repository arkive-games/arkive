"""Per-machine paths for the V Rising pipeline — environment only, no defaults.

Set the variables in ``tools/.env`` (see ``tools/.env.example``) or export them:

  VRISING_RAW       unex export root (Texture2D/, MonoBehaviour/, guid-index.json)
  VRISING_DATA_OUT  data-vrising repo (dataset the frontend fetches)
  VRISING_RES_OUT   resource-vrising repo (WebP tiles + icons)
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# tools/.env — anchored to the repo layout so the CWD doesn't matter.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def require_dir(name: str) -> Path:
    """The directory configured under ``name``; raises when unset."""
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"{name} is not set: add it to tools/.env (see tools/.env.example) or export it"
        )
    return Path(value)


def optional_dir(name: str) -> Path | None:
    """Like :func:`require_dir` but ``None`` when unset (for skippable tests
    and genuinely optional inputs)."""
    value = os.environ.get(name)
    return Path(value) if value else None
