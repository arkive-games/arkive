"""Scan stage: every placed pickup and enemy spawner in the game's levels.

The in-game map legend (``DT_MapItemData``, read by ``emit``) covers only what the
map UI tracks. Everything else a player picks up -- readings, materials, consumables,
Consciousness Dust, story items -- and every boss is placed directly in the levels,
which are World Partition worlds split into ~81,000 generated cell packages.

Exporting those cells to JSON costs ~70 GB of disk, nearly all of it meshes and
navigation data, so this stage streams them through ``uex serve`` instead and keeps
only the handful of actors the site needs, written to ``<PBZ_RAW>/placements.json``
for ``emit`` to read. Several serve processes run side by side: a cell takes ~11 ms
to deserialize, and the pak reads parallelize well.

Kept per cell:

* **Loot actors**: any export carrying a ``LootItemID`` (or the blueprint-variable
  spelling ``Loot Item ID``) -- breakables (``BP_Rubbish_C``), chests, hanging
  gifts, interactables, and the after-combat scripts of mob groups. The id is
  resolved against ``DT_LevelLootDataTable`` in ``emit``; the actor's own
  ``Pickups`` overrides are not needed.
* Both the generated cells and each level's own persistent package, which holds
  its always-loaded actors.
* **Spawners**: ``BP_AISpawner_C`` with the enemy class it spawns, so ``emit`` can
  pick the bosses out with ``DT_CodexEnemyDataTable``.
* **Features**: blockers, doors, gates and NPC spawners (``FEATURE_TYPE_RE``) with
  their plain-valued properties. A cooked actor stores only what it overrides, so
  their blueprints' class defaults -- merged down each inheritance chain -- go to
  ``<PBZ_RAW>/blueprint_defaults.json`` beside ``placements.json``.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from ..common import read_json, write_json

PROFILE = "pbz"
CELLS = "/_Generated_/"
WORKERS = 6
LOOT_FIELDS = ("LootItemID", "Loot Item ID")
SPAWNER_TYPES = {"BP_AISpawner_C"}
FEATURE_TYPE_RE = re.compile(r"Blocker|Door|Gate|NPCSpawner")
_ACTOR_RE = re.compile(r":PersistentLevel\.([^.']+)")
_CLASS_RE = re.compile(r"^\w+'(/[^']+)'$")


def plain_props(props: dict) -> dict:
    """The properties that carry data rather than component or asset references:
    scalars, text keys, string lists, tag containers and item maps."""
    out = {}
    for key, value in props.items():
        if isinstance(value, (str, bool, int, float)):
            out[key] = value
        elif isinstance(value, dict) and "Key" in value and "Namespace" in value:
            out[key] = {"Key": value["Key"]}  # FText: keep only its locres key
        elif isinstance(value, dict) and value.get("AssetPathName"):
            out[key] = value["AssetPathName"]  # a soft class/object reference
        elif isinstance(value, list) and all(
                isinstance(v, (str, int, float)) or (isinstance(v, dict) and "ObjectName" not in v
                                                     and "AssetPathName" not in v) for v in value):
            out[key] = value
        elif isinstance(value, dict) and "GameplayTags" in value:
            out[key] = [t.get("TagName") for t in value["GameplayTags"]]
    return out


def class_path(export: dict) -> str | None:
    """``/Game/Dir/BP_X.BP_X_C`` from an export's ``Class`` reference, for blueprints."""
    m = _CLASS_RE.match(export.get("Class") or "")
    return m.group(1) if m and export["Class"].startswith("BlueprintGeneratedClass") else None


def uex_exe() -> Path:
    """The uex binary: ``UEX_EXE``, or ``publish/uex.exe`` under ``UEX_HOME``."""
    explicit = os.environ.get("UEX_EXE")
    if explicit:
        return Path(explicit)
    return Path(os.environ.get("UEX_HOME", "E:/arkive-games/uex")) / "publish" / "uex.exe"


class Serve:
    """One ``uex serve`` process. Its working directory is the uex checkout, where the
    machine's ``profiles.json`` (with the pbz AES key and usmap) lives."""

    def __init__(self, exe: Path):
        self._proc = subprocess.Popen(
            [str(exe), "serve"], cwd=exe.parent.parent,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, encoding="utf-8", bufsize=1,
        )
        self._id = 0
        banner = json.loads(self._proc.stdout.readline())
        if not banner.get("ok"):
            raise RuntimeError(f"uex serve did not start: {banner}")

    def call(self, cmd: str, **args):
        self._id += 1
        self._proc.stdin.write(json.dumps({"id": self._id, "cmd": cmd, "profile": PROFILE, "args": args}) + "\n")
        self._proc.stdin.flush()
        line = self._proc.stdout.readline()
        if not line:
            raise RuntimeError(f"uex serve closed the connection during {cmd} {args}")
        response = json.loads(line)
        if not response.get("ok"):
            raise RuntimeError(f"{cmd} {args}: {response.get('error')}")
        return response["result"]

    def close(self) -> None:
        try:
            self.call("shutdown")
        except Exception:  # noqa: BLE001 - a dead process is already closed
            pass
        self._proc.wait(timeout=30)


def _outer_name(export: dict) -> str:
    outer = export.get("Outer")
    return outer if isinstance(outer, str) else (outer or {}).get("ObjectName", "")


def _ref_name(ref) -> str | None:
    """The last path segment of an object reference: ``...Actor.DefaultSceneRoot'``."""
    if not isinstance(ref, dict) or not ref.get("ObjectName"):
        return None
    return ref["ObjectName"].rstrip("'").rsplit(".", 1)[-1].rsplit(":", 1)[-1]


def _location(actor: dict, by_owner: dict[tuple[str, str], dict], depth: int = 0) -> list[float] | None:
    """World location of ``actor``'s root component, following attach parents.

    Rotation and scale of a parent are ignored: attached pickups sit on props a few
    metres across, well inside what the painted maps can resolve.
    """
    root = _ref_name(actor["Properties"].get("RootComponent"))
    comp = by_owner.get((actor["Name"], root or ""))
    if comp is None:
        return None
    rel = comp["Properties"].get("RelativeLocation") or {"X": 0.0, "Y": 0.0, "Z": 0.0}
    loc = [rel["X"], rel["Y"], rel["Z"]]
    parent = comp["Properties"].get("AttachParent")
    if parent and depth < 4:
        m = _ACTOR_RE.search(parent.get("ObjectName", ""))
        parent_actor = by_owner.get(("", m.group(1))) if m else None
        if parent_actor is not None:
            base = _location(parent_actor, by_owner, depth + 1)
            if base is not None:
                loc = [a + b for a, b in zip(loc, base)]
    return [round(v, 1) for v in loc]


def scan_cell(exports: list[dict]) -> list[dict]:
    """The loot actors and spawners of one cell package."""
    # (owning actor, component name) -> component; ("", actor name) -> actor.
    by_owner: dict[tuple[str, str], dict] = {}
    for x in exports:
        outer = _outer_name(x)
        if outer.endswith(":PersistentLevel'"):
            by_owner[("", x["Name"])] = x
        else:
            m = _ACTOR_RE.search(outer)
            if m:
                by_owner[(m.group(1), x["Name"])] = x

    out: list[dict] = []
    seen: set[str] = set()
    for x in exports:
        props = x.get("Properties") or {}
        if FEATURE_TYPE_RE.search(x["Type"]) and _outer_name(x).endswith(":PersistentLevel'"):
            loc = _location(x, by_owner)
            if loc is not None:
                out.append({"actor": x["Name"], "type": x["Type"], "loc": loc,
                            "cls": class_path(x), "props": plain_props(props)})
            continue
        loot = next((props[f] for f in LOOT_FIELDS if isinstance(props.get(f), str) and props[f]), None)
        if loot is None and x["Type"] not in SPAWNER_TYPES:
            continue
        if _outer_name(x).endswith(":PersistentLevel'"):
            actor = x
        else:  # a script or component owned by an actor
            m = _ACTOR_RE.search(_outer_name(x))
            actor = by_owner.get(("", m.group(1))) if m else None
        if actor is None or actor["Name"] in seen and loot is None:
            continue
        loc = _location(actor, by_owner)
        if loc is None:
            continue
        rec = {"actor": actor["Name"], "type": actor["Type"], "loc": loc}
        if loot is not None:
            rec["loot"] = loot
            if x is not actor:
                rec["via"] = x["Type"]
        else:
            cls = (props.get("Class") or {}).get("AssetPathName", "")
            if not cls:
                continue
            rec["spawns"] = cls.rsplit(".", 1)[-1]
        seen.add(actor["Name"])
        out.append(rec)
    return out


def package_vpath(serve: "Serve", object_path: str) -> str | None:
    """The pak path of the package holding ``/Mount/Dir/Name.Name_C``. ``/Game`` is
    the project's Content; any other mount is a plugin, found by its tail."""
    package = object_path.split(".", 1)[0]
    mount, _, rest = package.lstrip("/").partition("/")
    if mount == "Game":
        return f"ProjectPBZ/Content/{rest}.uasset"
    tail = f"/{mount}/Content/{rest}.uasset"
    matches = serve.call("search", pattern=tail, limit=5)["matches"]
    return next((m for m in matches if m.endswith(tail)), None)


def class_defaults(serve: "Serve", object_path: str, cache: dict[str, dict]) -> dict:
    """A blueprint class's plain default properties, its parents' merged underneath."""
    if object_path in cache:
        return cache[object_path]
    cache[object_path] = {}  # cycle guard
    vpath = package_vpath(serve, object_path)
    if vpath is None:
        return {}
    exports = json.loads(serve.call("preview", asset=vpath, maxBytes=200_000_000))
    class_name = object_path.rsplit(".", 1)[-1]
    merged: dict = {}
    cls = next((x for x in exports if x.get("Name") == class_name), None)
    parent = (cls or {}).get("Super") or {}
    parent_path = parent.get("ObjectPath", "")
    m = re.match(r"\w+'([^']+)'", parent.get("ObjectName", ""))
    if parent_path and not parent_path.startswith("/Script/") and m:
        merged.update(class_defaults(serve, f"{parent_path.rsplit('.', 1)[0]}.{m.group(1)}", cache))
    cdo = next((x for x in exports if x.get("Name") == f"Default__{class_name}"), None)
    merged.update(plain_props((cdo or {}).get("Properties") or {}))
    cache[object_path] = merged
    return merged


def _level_of(cell: str) -> str:
    """The level a package belongs to: a cell's parent world, or the world itself."""
    return cell.split(CELLS, 1)[0].rsplit("/", 1)[-1].removesuffix(".umap")


def run_scan(raw: Path, workers: int = WORKERS) -> dict:
    exe = uex_exe()
    if not exe.is_file():
        raise RuntimeError(f"{exe} not found: set UEX_EXE or UEX_HOME")
    lead = Serve(exe)
    cells = lead.call("search", pattern=CELLS, limit=1_000_000)["matches"]
    cells = [c for c in cells if c.endswith(".umap")]
    # Always-loaded actors (most bosses among them) stay in the persistent level
    # itself rather than any generated cell. Those packages run to hundreds of MB
    # of JSON, past what one serve response can carry, so they go through
    # `export` into the raw root (the pbz profile's outputDir) and are read back.
    worlds = sorted({c.split(CELLS, 1)[0] + ".umap" for c in cells})
    print(f"scan: {len(cells)} cells and {len(worlds)} persistent levels")

    pool = [lead] + [Serve(exe) for _ in range(workers - 1)]
    free = list(pool)
    lock = threading.Lock()
    done = [0]

    def work(cell: str) -> tuple[str, list[dict]]:
        with lock:
            serve = free.pop()
        try:
            if cell in worlds:
                serve.call("export", only=[cell])
                exports = read_json(Path(raw) / cell.replace(".umap", ".json"))
            else:
                exports = json.loads(serve.call("preview", asset=cell, maxBytes=1_000_000_000))
        finally:
            with lock:
                free.append(serve)
                done[0] += 1
                if done[0] % 5000 == 0:
                    print(f"scan: {done[0]}/{len(cells)}")
        return cell, scan_cell(exports)

    levels: dict[str, dict[str, dict]] = {}
    try:
        with ThreadPoolExecutor(workers) as ex:
            for cell, records in ex.map(work, worlds + cells):
                level = levels.setdefault(_level_of(cell), {})
                for rec in records:
                    # An actor streamed into two cells (or two variants of one level)
                    # is still one placement.
                    level.setdefault(f"{rec['actor']}|{rec.get('loot', '')}", rec)
        out = {lvl: sorted(recs.values(), key=lambda r: r["actor"]) for lvl, recs in sorted(levels.items())}
        cache: dict[str, dict] = {}
        classes = sorted({r["cls"] for recs in out.values() for r in recs if r.get("cls")})
        defaults = {c: class_defaults(lead, c, cache) for c in classes}
    finally:
        for s in pool:
            s.close()

    write_json(Path(raw) / "placements.json", out)
    write_json(Path(raw) / "blueprint_defaults.json", defaults)
    for lvl, recs in out.items():
        kinds = {k: sum(1 for r in recs if k in r) for k in ("loot", "spawns", "cls")}
        print(f"scan: {lvl}: {kinds['loot']} loot, {kinds['spawns']} spawners, {kinds['cls']} features")
    print(f"scan: {len(defaults)} blueprint classes resolved")
    return out
