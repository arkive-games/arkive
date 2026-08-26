"""Content-version stamp for the data artifact (browser cache busting).

The frontend fetches ``version.json`` first (served ``max-age=0,
must-revalidate``) and appends ``?v=<version>`` to every other data URL (served
long-cache), so a data-only deploy reaches browsers immediately. The version is
a digest of the artifact's contents: byte-identical re-runs keep the same
version and don't bust caches for nothing.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from .common import write_json
from .env import optional_dir

VERSION_FILE = "version.json"


def read_game_version(game: Path) -> str | None:
    """The client build the export came from.

    ``Content/package.txt`` holds the bare build number; the same number is the
    middle field of ``Content/Paks/AssetsVersion.txt``. ``None`` when the client
    root isn't configured or the file is unreadable.
    """
    try:
        text = (Path(game) / "Content" / "package.txt").read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return text or None


def stamp_version(data_out: Path) -> str:
    """Digest the artifact directory and (re)write ``version.json``.

    Excludes ``version.json`` itself (so re-stamping is stable) and any
    dot-path (``.git``, ``.gitignore`` — the artifact dirs are git repos).
    """
    data_out = Path(data_out)
    digest = hashlib.sha256()
    for path in sorted(data_out.rglob("*"), key=lambda p: p.relative_to(data_out).as_posix()):
        if not path.is_file():
            continue
        rel = path.relative_to(data_out).as_posix()
        if rel == VERSION_FILE or any(part.startswith(".") for part in rel.split("/")):
            continue
        digest.update(rel.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
    version = digest.hexdigest()[:12]
    payload: dict[str, str] = {"version": version}
    game = optional_dir("GMZZ_GAME")
    game_version = read_game_version(game) if game else None
    if game_version:
        payload["gameVersion"] = game_version
    write_json(data_out / VERSION_FILE, payload)
    print(f"version: {version}" + (f" (game {game_version})" if game_version else ""))
    return version
