"""Per-machine paths for the GMZZ pipelines — environment only, no defaults.

Set the variables in ``tools/.env`` (see ``tools/.env.example``) or export them:

  GMZZ_RAW       uex export root (the ``C7/...`` tree uex writes)
  GMZZ_GAME      installed client root (``.../GMZZLauncher/Game/C7``): the input
                 to ``gmzz.kscache``, and the fallback build stamp for ``version.json``
  GMZZ_PATCHED   where ``gmzz.kscache`` assembles the hot-patched client view for
                 uex to mount; when set, every stage refuses an export that did
                 not come from it (see :func:`excel_dir`)
  GMZZ_AES_KEY   the client pak index key, as in uex's profile
  GMZZ_DATA_OUT  data-gmzz repo (dataset the frontend fetches)
  GMZZ_RES_OUT   resource-gmzz repo (WebP icons and art)
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# tools/.env — anchored to the repo layout so the CWD doesn't matter.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

#: The marker ``gmzz.kscache`` plants in its patch pak, under the ScriptOPCode
#: root uex exports, so the export itself says which build it came from.
BUILD_MARKER = "C7/Content/ScriptOPCode/arkive-kscache-build.txt"


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


def export_build(raw: Path) -> str | None:
    """The build a uex export came from, or ``None`` for an export of the bare install.

    Only an export of the assembled patched view carries the marker; the install
    has no such file, so ``None`` means "the base build, whatever that is".
    """
    try:
        text = (Path(raw) / BUILD_MARKER).read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return text or None


def assembled_build(patched: Path) -> str | None:
    """The build ``gmzz.kscache`` last assembled under ``patched``, or ``None``."""
    try:
        text = (Path(patched) / "C7" / "Content" / "package.txt").read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return text or None


def check_export_current(raw: Path) -> None:
    """Refuse an export that is behind the assembled patched view.

    With ``GMZZ_PATCHED`` set, the pipelines are meant to read the hot-patched
    build, and an export that predates the last ``gmzz.kscache`` run — or one
    taken from the bare install — would silently regress every patched table to
    its base-build content while still looking like a normal run. The marker
    in the export says which build it came from; it has to match.
    """
    patched = optional_dir("GMZZ_PATCHED")
    if patched is None:
        return
    wanted = assembled_build(patched)
    if wanted is None:
        return  # nothing assembled yet; the export can only be of the install
    got = export_build(raw)
    if got != wanted:
        have = f"build {got}" if got else "the bare install (no build marker)"
        raise RuntimeError(
            f"{raw} is an export of {have}, but {patched} holds build {wanted}: "
            f"re-run `uex export --profile gmzz` against the assembled view before this stage"
        )


def excel_dir() -> Path:
    """The exported ``Data/Excel`` directory inside ``GMZZ_RAW``, checked against the assembled build."""
    from .tables import EXCEL_DIR

    raw = require_dir("GMZZ_RAW")
    check_export_current(raw)
    return raw / EXCEL_DIR
