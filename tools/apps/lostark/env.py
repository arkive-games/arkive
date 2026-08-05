"""Per-machine paths for the Lost Ark pipeline — environment only, no defaults.

Set the variables in ``tools/.env`` (see ``tools/.env.example``) or export them:

  LOSTARK_TABLES    lostark-explorer output: the ClientData/TableData directory
                    holding the EFTable_*.db SQLite files
  LOSTARK_DATA_OUT  data-lostark repo (dataset the frontend fetches)

Optional:

  LOSTARK_ICON_ATLAS  decoded UI icon atlas pages (``laex textures`` output, one
                      directory per package). Only needed to re-slice icon sets;
                      absent on a machine that just emits the dataset.
  LOSTARK_ICON_INFO   the client's ``IconInfo.loa`` sprite table, which maps an
                      ``Icon``/``IconIndex`` pair to an atlas page and rectangle
                      (see :mod:`lostark.icons`). Needed alongside
                      LOSTARK_ICON_ATLAS to slice icons.
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


def optional_file(name: str) -> Path | None:
    """The file configured under ``name``, or ``None`` when unset.

    Same contract as :func:`optional_dir`; separate so a caller reads as what it
    wants (``IconInfo.loa`` is a file, not a directory).
    """
    value = os.environ.get(name)
    return Path(value) if value else None
