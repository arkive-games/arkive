"""Per-machine paths for the Ragnarok Online 3 pipeline — environment only, no defaults.

Set the variables in ``tools/.env`` (see ``tools/.env.example``) or export them:

  RO3_GAME      the installed game's Unity data directory (``ro3_Data``), read
                directly by :mod:`.vfs` to walk ``StreamingAssets/VFS``. Its parent is
                also where :mod:`.fairguard` reads ``FairGuardProtect.dll`` from.
  RO3_RAW       unex export root (Texture2D/, MonoBehaviour/, guid-index.json)
  RO3_STAGE     where :mod:`.unpack` writes deobfuscated, standard UnityFS bundles for
                unex to read. Optional; defaults to ``RO3_RAW/decrypted``. Worth setting
                explicitly because the full stage is the size of the game's VFS (23 GB).
  RO3_DATA_OUT  data-ro3 repo (dataset the frontend fetches)
  RO3_RES_OUT   resource-ro3 repo (WebP tiles + icons)
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
