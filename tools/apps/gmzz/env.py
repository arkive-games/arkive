"""Per-machine paths for the GMZZ pipelines — environment only, no defaults.

Set the variables in ``tools/.env`` (see ``tools/.env.example``) or export them:

  GMZZ_RAW       uex export root (the ``C7/...`` tree uex writes)
  GMZZ_GAME      installed client root (``.../GMZZLauncher/Game/C7``), optional —
                 only used to stamp the client build into ``version.json``
  GMZZ_DATA_OUT  data-gmzz repo (dataset the frontend fetches)
  GMZZ_RES_OUT   resource-gmzz repo (WebP icons and art)
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
    """Like :func:`require_dir` but ``None`` when unset."""
    value = os.environ.get(name)
    return Path(value) if value else None


def excel_dir() -> Path:
    """The exported ``Data/Excel`` directory inside ``GMZZ_RAW``."""
    from .tables import EXCEL_DIR

    return require_dir("GMZZ_RAW") / EXCEL_DIR
