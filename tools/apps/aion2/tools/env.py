"""Per-machine paths for the AION2 tools — environment only, no defaults.

Set the variables in ``tools/.env`` (see ``tools/.env.example``) or export them:

  RAW_DATA_PATH   raw UE5 export root (…/Exports/AION2/Content)
  AION2_DATA_OUT  data repo (dataset the frontend fetches)
  AION2_RES_OUT   resource repo (WebP image set under UI/)
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# tools/.env — anchored to the repo layout so the CWD doesn't matter.
load_dotenv(Path(__file__).resolve().parents[3] / ".env")


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
