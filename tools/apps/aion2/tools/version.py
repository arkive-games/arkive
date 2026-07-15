"""Content-version stamp for the data artifact (browser cache busting).

The frontend fetches ``version.json`` first (served ``max-age=0,
must-revalidate``) and appends ``?v=<version>`` to every other data URL
(served long-cache), so a data-only deploy reaches browsers immediately.
The version is a digest of the artifact's contents: byte-identical re-runs
keep the same version and don't bust caches for nothing.

Every emit entrypoint that writes into ``AION2_DATA_OUT`` re-stamps on exit;
the digest always covers the whole directory, so whichever stage runs last
leaves a correct stamp.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

VERSION_FILE = "version.json"


def stamp_version(data_out: Path) -> str:
    """Digest the artifact directory and (re)write ``version.json``.

    Excludes ``version.json`` itself (so re-stamping is stable) and any
    dot-path (``.git``, ``.gitignore`` — the artifact dirs are git repos)."""
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
    (data_out / VERSION_FILE).write_text(
        json.dumps({"version": version}, separators=(",", ":")), encoding="utf-8"
    )
    print(f"version: {version}")
    return version
