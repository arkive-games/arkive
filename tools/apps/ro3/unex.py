"""Drive ``unex`` from Python, over its JSON-lines ``serve`` protocol.

Ragnarok Online 3's assets are ordinary Unity objects once :mod:`.unpack` has run, and
unex already decodes them properly — type-tree-driven deserialization and real texture
decoding (BC1..BC7, ASTC, ETC). Reimplementing that here would be duplicated work with a
worse failure mode, so this module talks to it instead.

Two practical constraints shape the design:

* **One process, many queries.** ``unex <command>`` mounts the profile on every run, and
  mounting even a small profile is not free. ``unex serve`` mounts once and answers a
  request per line, which is the difference between minutes and hours for a few thousand
  sprites.
* **A small profile.** Mounting the full 188,361-bundle stage builds a virtual filesystem
  over every object in the game; measured, that runs for over half an hour and past 2 GB
  of resident memory before it is anywhere near done. So the pipeline copies the handful
  of bundles it actually needs into a selection directory and mounts *that*, in seconds.

The profile is written by this module into its own work directory and passed with
``--config``, so nothing here depends on — or edits — the machine's ``profiles.json``.
"""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path

PROFILE = "ro3-selection"
UNITY_VERSION = "2022.3.62f3"


def unex_exe() -> Path:
    """The unex binary. ``UNEX_EXE`` in the environment, or the usual publish location."""
    from . import env  # noqa: F401 - importing it loads tools/.env

    explicit = os.environ.get("UNEX_EXE")
    if explicit:
        return Path(explicit)
    return Path(os.environ.get("UNEX_HOME", "E:/arkive-games/unex")) / "publish" / "unex.exe"


def write_profile(work: Path, selection: Path, output: Path) -> Path:
    """A one-profile config for the selection directory. Returns its path."""
    work.mkdir(parents=True, exist_ok=True)
    config = work / "profiles.json"
    config.write_text(json.dumps({
        "profiles": {
            PROFILE: {
                "dataDir": str(selection).replace("\\", "/"),
                "bundleRoots": ["."],
                "bundleSuffixes": [".bundle"],
                "serializedFiles": [],
                "entityScenesDir": None,
                "unityVersion": UNITY_VERSION,
                "classDatabase": None,
                "prefabNames": None,
                "outputDir": str(output).replace("\\", "/"),
                "exportRoots": ["bundles"],
            }
        }
    }, indent=1), encoding="utf-8")
    return config


class UnexError(RuntimeError):
    """unex answered a request with ``ok: false``."""


@dataclass
class Serve:
    """A running ``unex serve``. Use as a context manager."""

    config: Path
    exe: Path | None = None
    _proc: subprocess.Popen | None = None
    _next_id: int = 0

    def __enter__(self) -> "Serve":
        exe = self.exe or unex_exe()
        if not Path(exe).is_file():
            raise UnexError(
                f"{exe} not found: build it with `dotnet publish src/Unex -c Release -o publish`"
                " in the unex checkout, or set UNEX_EXE"
            )
        self._proc = subprocess.Popen(
            [str(exe), "serve", "--config", str(self.config)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, encoding="utf-8", bufsize=1,
        )
        banner = json.loads(self._proc.stdout.readline())
        if not banner.get("ok"):
            raise UnexError(f"unex serve did not start: {banner}")
        return self

    def __exit__(self, *_exc) -> None:
        if self._proc is None:
            return
        try:
            self.call("shutdown")
        except Exception:  # noqa: BLE001 - shutting down a dead process is not an error
            pass
        try:
            self._proc.wait(timeout=30)
        except subprocess.TimeoutExpired:  # pragma: no cover
            self._proc.kill()
        self._proc = None

    def call(self, cmd: str, profile: str | None = PROFILE, **args):
        if self._proc is None or self._proc.stdin is None or self._proc.stdout is None:
            raise UnexError("serve is not running")
        self._next_id += 1
        request = {"id": self._next_id, "cmd": cmd}
        if profile:
            request["profile"] = profile
        if args:
            request["args"] = args
        self._proc.stdin.write(json.dumps(request) + "\n")
        self._proc.stdin.flush()
        line = self._proc.stdout.readline()
        if not line:
            raise UnexError(f"unex serve closed the connection during '{cmd}'")
        response = json.loads(line)
        if not response.get("ok"):
            raise UnexError(f"{cmd} {args}: {response.get('error')}")
        return response.get("result")

    # ------------------------------------------------------------------ conveniences
    def list_dir(self, path: str) -> list[str]:
        return self.call("list", path=path)

    def preview(self, asset: str, max_bytes: int = 64_000_000) -> dict:
        return json.loads(self.call("preview", asset=asset, maxBytes=max_bytes))

    def texture_png(self, asset: str, out: Path) -> dict:
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        return self.call("preview-texture", asset=asset, out=str(out))
