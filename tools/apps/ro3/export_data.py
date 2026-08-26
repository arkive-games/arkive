"""Emit the ro3 dataset from the unencrypted data containers.

What this can and cannot produce today is decided by RO3's obfuscation, not by taste:

* the ``.bytes`` containers are in the clear, so the class/job table, the scene manifest and
  the protobuf table catalogue come straight out (see :mod:`.containers`)
* the skill / dungeon *tables* live in Lua chunks whose string constants are separately
  obfuscated, so they are not emitted yet
* icons and other art live in Unity bundles whose first block is encrypted, so
  ``resource-ro3`` stays empty for now

Everything written here is derived, never hand-authored, and every field records where it
came from so a later run can be diffed against this one.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from .common import write_json
from .containers import data_containers, iter_payloads
from .env import require_dir
from .version import stamp_version

IDENT = re.compile(rb"[A-Za-z_][A-Za-z0-9_]{2,}")
ASSET_TABLE = re.compile(rb"Asset_[A-Za-z0-9_]{2,}")
# Class names look like Assassin_Male / Crusader_Peco_Male; animation states extend them.
CLASS_NAME = re.compile(r"^(?P<job>[A-Z][A-Za-z]+)(?:_(?P<mount>Peco))?_(?P<sex>Male|Female)$")


def collect(vfs_root: Path) -> dict[str, list]:
    proto_tables: set[str] = set()
    class_names: set[str] = set()
    scenes: list[dict] = []
    placements = 0

    for container in data_containers(vfs_root):
        for payload in iter_payloads(container):
            if payload.kind == "protobuf-schema":
                proto_tables |= {m.decode() for m in ASSET_TABLE.findall(payload.data)}
            elif payload.kind in ("text", "protobuf"):
                for raw in IDENT.findall(payload.data):
                    name = raw.decode()
                    if CLASS_NAME.match(name):
                        class_names.add(name)
            elif payload.kind == "json":
                try:
                    doc = json.loads(payload.data.decode("utf-8-sig"))
                except (UnicodeDecodeError, ValueError):
                    continue
                if isinstance(doc, list) and doc and isinstance(doc[0], dict):
                    if "sceneName" in doc[0]:
                        scenes.extend(
                            {
                                "name": e.get("sceneName"),
                                "guid": e.get("sceneGuid"),
                                "exported": bool(e.get("exported")),
                            }
                            for e in doc
                            if e.get("sceneName")
                        )
                    elif "assetName" in doc[0]:
                        placements += len(doc)

    jobs: dict[str, dict] = {}
    for name in sorted(class_names):
        m = CLASS_NAME.match(name)
        assert m  # guarded by the filter above
        job = m.group("job")
        entry = jobs.setdefault(job, {"id": job, "sexes": [], "mounted": False})
        if m.group("sex") not in entry["sexes"]:
            entry["sexes"].append(m.group("sex"))
        if m.group("mount"):
            entry["mounted"] = True

    return {
        "assetTables": sorted(proto_tables),
        "classes": [jobs[k] for k in sorted(jobs)],
        "classVariants": sorted(class_names),
        "scenes": sorted(scenes, key=lambda s: s["name"]),
        "placements": placements,
    }


def main() -> None:
    vfs = require_dir("RO3_GAME") / "StreamingAssets" / "VFS"
    out = require_dir("RO3_DATA_OUT")
    data = collect(vfs)

    write_json(out / "classes.json", {
        "source": "StreamingAssets/VFS/*.bytes (unencrypted RO3V containers)",
        "classes": data["classes"],
        "variants": data["classVariants"],
    })
    write_json(out / "scenes.json", {
        "source": "scene export manifest in the .bytes containers",
        "note": "candidate dungeon/map list; not yet split into dungeons vs open world",
        "scenes": data["scenes"],
    })
    write_json(out / "schema.json", {
        "source": "MG_Define.proto (package romsg)",
        "note": "config-table message types; their row data is not in the client yet",
        "assetTables": data["assetTables"],
    })
    stamp_version(out)

    print(f"classes      : {len(data['classes'])} jobs, {len(data['classVariants'])} variants")
    print(f"scenes       : {len(data['scenes'])}")
    print(f"asset tables : {len(data['assetTables'])}")
    print(f"placements   : {data['placements']} (not emitted)")


if __name__ == "__main__":
    main()
