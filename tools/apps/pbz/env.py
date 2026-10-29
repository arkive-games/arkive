"""Per-machine paths for the Phantom Blade Zero pipeline: environment only, no defaults.

Set the variables in ``tools/.env`` (see ``tools/.env.example``) or export them:

  PBZ_RAW       uex export root (the ProjectPBZ/... tree `uex export --profile pbz` writes)
  PBZ_DATA_OUT  data-pbz repo (dataset the frontend fetches)
  PBZ_RES_OUT   resource-pbz repo (WebP tiles + icons)
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# tools/.env, anchored to the repo layout so the CWD doesn't matter.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def require_dir(name: str) -> Path:
    """The directory configured under ``name``; raises when unset."""
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"{name} is not set: add it to tools/.env (see tools/.env.example) or export it"
        )
    return Path(value)
