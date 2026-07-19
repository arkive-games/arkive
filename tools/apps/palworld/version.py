"""Content-version stamp for the data artifact (browser cache busting).

The frontend fetches ``version.json`` first (served ``max-age=0,
must-revalidate``) and appends ``?v=<version>`` to every other data URL
(served long-cache), so a data-only deploy reaches browsers immediately.
The version is a digest of the artifact's contents: byte-identical re-runs
keep the same version and don't bust caches for nothing.

Every pipeline entrypoint that writes into ``PALWORLD_DATA_OUT`` re-stamps on
exit; the digest always covers the whole directory, so whichever stage runs
last leaves a correct stamp.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

from .env import optional_dir
from .maps.common import write_json

VERSION_FILE = "version.json"


def read_game_version(raw: Path) -> str | None:
    """``ProjectVersion`` from the export's ``Pal/Config/DefaultGame.ini``.

    ``raw`` is ``PALWORLD_RAW`` (…/Pal/Content/Pal); the config sits beside
    ``Content`` at …/Pal/Config. FModel saves the ini with a ``.json``
    extension (raw ini text inside), so accept either name. ``None`` when the
    file wasn't exported or has no version line."""
    config = Path(raw).parents[1] / "Config"
    for name in ("DefaultGame.json", "DefaultGame.ini"):
        path = config / name
        if not path.is_file():
            continue
        m = re.search(r"^ProjectVersion=(\S+)", path.read_text(encoding="utf-8-sig"), re.MULTILINE)
        if m:
            return m.group(1)
    return None


def stamp_version(data_out: Path) -> str:
    """Digest the artifact directory and (re)write ``version.json``.

    Excludes ``version.json`` itself (so re-stamping is stable) and any
    dot-path (``.git``, ``.gitignore`` — the artifact dirs are git repos).
    Also records the game client version (``gameVersion``) read from the raw
    export when ``PALWORLD_RAW`` is available."""
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
    raw = optional_dir("PALWORLD_RAW")
    game_version = read_game_version(raw) if raw else None
    if game_version:
        payload["gameVersion"] = game_version
    write_json(data_out / VERSION_FILE, payload)
    print(f"version: {version}" + (f" (game {game_version})" if game_version else ""))
    return version
