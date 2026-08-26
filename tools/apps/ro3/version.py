"""Content-version stamp for the data artifact (browser cache busting).

The frontend fetches ``version.json`` first (served ``max-age=0, must-revalidate``) and
appends ``?v=<version>`` to every other data URL (served long-cache), so a data-only deploy
reaches browsers immediately. The version is a digest of the artifact's contents:
byte-identical re-runs keep the same version and don't bust caches for nothing.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from .common import write_json

VERSION_FILE = "version.json"


def read_game_version() -> str | None:
    """The shipped client build, from the game's own package info.

    ``None`` when it can't be read - an unknown build must read as unknown, never invented.
    """
    from .env import optional_dir

    game = optional_dir("RO3_GAME")
    if game is None:
        return None
    info = game.parent / "pc_package_info.txt"
    if not info.is_file():
        return None
    try:
        import json

        return json.loads(info.read_text(encoding="utf-8")).get("game_version") or None
    except (ValueError, OSError):
        return None


def stamp_version(data_out: Path) -> str:
    """Digest the artifact directory and (re)write ``version.json``.

    Excludes ``version.json`` itself (so re-stamping is stable) and any dot-path
    (``.git``, ``.gitignore`` - the artifact dirs are git repos).
    """
    data_out = Path(data_out)
    h = hashlib.sha256()
    for p in sorted(data_out.rglob("*"), key=lambda p: p.relative_to(data_out).as_posix()):
        if not p.is_file():
            continue
        rel = p.relative_to(data_out).as_posix()
        if rel == VERSION_FILE or any(part.startswith(".") for part in rel.split("/")):
            continue
        h.update(rel.encode("utf-8"))
        h.update(b"\0")
        h.update(p.read_bytes())
    version = h.hexdigest()[:12]
    payload: dict[str, str] = {"version": version}
    game_version = read_game_version()
    if game_version:
        payload["gameVersion"] = game_version
    write_json(data_out / VERSION_FILE, payload)
    print(f"version: {version}" + (f" (game {game_version})" if game_version else ""))
    return version
