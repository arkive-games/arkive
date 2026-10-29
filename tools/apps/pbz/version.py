"""Content-version stamp for the data artifact (browser cache busting).

The frontend fetches ``version.json`` first (served ``max-age=0,
must-revalidate``) and appends ``?v=<version>`` to every other data URL
(served long-cache), so a data-only deploy reaches browsers immediately.
The version is a digest of the artifact's contents: byte-identical re-runs
keep the same version and don't bust caches for nothing.
"""

from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path

from .common import write_json

VERSION_FILE = "version.json"
STEAM_APP_ID = "4115450"


def read_game_version(game_root: Path) -> str | None:
    """The Steam build the install is at, from the library's appmanifest.

    ``game_root`` is the install directory (``.../steamapps/common/PBZ``); the
    manifest sits two levels up. ``None`` when it cannot be read: an unknown
    build must read as unknown, never as a guess.
    """
    manifest = Path(game_root).parent.parent / f"appmanifest_{STEAM_APP_ID}.acf"
    try:
        text = manifest.read_text(encoding="utf-8")
    except OSError:
        return None
    match = re.search(r'"buildid"\s+"(\d+)"', text)
    return f"Steam build {match.group(1)}" if match else None


def stamp_version(data_out: Path) -> str:
    """Digest the artifact directory and (re)write ``version.json``.

    Excludes ``version.json`` itself (so re-stamping is stable) and any
    dot-path (``.git``: the artifact dirs are git repos).
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
    game = os.environ.get("PBZ_GAME")
    game_version = read_game_version(Path(game)) if game else None
    if game_version:
        payload["gameVersion"] = game_version
    write_json(data_out / VERSION_FILE, payload)
    print(f"version: {version}" + (f" ({game_version})" if game_version else ""))
    return version
