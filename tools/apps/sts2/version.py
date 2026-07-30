"""Content-version stamp for the data artifact (browser cache busting).

The frontend fetches ``version.json`` first (served ``max-age=0,
must-revalidate``) and appends ``?v=<version>`` to every other data URL
(served long-cache), so a data-only deploy reaches browsers immediately.
The version is a digest of the artifact's contents: byte-identical re-runs
keep the same version and don't bust caches for nothing.

Every pipeline entrypoint that writes into ``STS2_DATA_OUT`` re-stamps on exit;
the digest always covers the whole directory, so whichever stage runs last
leaves a correct stamp.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from .common import read_json, write_json
from .env import optional_dir

VERSION_FILE = "version.json"


def read_game_version(raw: Path) -> str | None:
    """The game build the export came from, out of gdex's ``meta.json``.

    gdex copies the game's own ``release_info.json`` into ``meta.json`` under
    ``game``; STS2 is in early access and repacks constantly, so a dataset built
    from a stale export must be detectable. ``None`` when the export predates
    version stamping or the file is unreadable.
    """
    meta_path = Path(raw) / "meta.json"
    if not meta_path.is_file():
        return None
    try:
        meta = read_json(meta_path)
    except (ValueError, OSError):
        return None
    game = meta.get("game")
    if isinstance(game, dict):
        version = game.get("version")
        if isinstance(version, str) and version:
            return version
    return None


def stamp_version(data_out: Path) -> str:
    """Digest the artifact directory and (re)write ``version.json``.

    Excludes ``version.json`` itself (so re-stamping is stable) and any
    dot-path (``.git``, ``.gitignore`` — the artifact dirs are git repos).
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
    raw = optional_dir("STS2_RAW")
    game_version = read_game_version(raw) if raw else None
    if game_version:
        payload["gameVersion"] = game_version
    write_json(data_out / VERSION_FILE, payload)
    print(f"version: {version}" + (f" (game {game_version})" if game_version else ""))
    return version
