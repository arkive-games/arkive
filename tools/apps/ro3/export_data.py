"""Emit the ro3 dataset.

Two sources, because the game splits its content two ways:

* the ``.bytes`` RO3V containers, which ship **unobfuscated** and hold the class/job table,
  the scene manifest and the protobuf table catalogue (see :mod:`.containers`)
* the Unity bundles, readable since :mod:`.keygen` undid their block-0 obfuscation and
  :mod:`.catalog` indexed all 188,361 of them. That is where the skill icons, boss models
  and monster portraits are (see :mod:`.assets_index`).

Every row this module emits is keyed by an identifier the game itself uses -- an icon name,
a class name, a scene name -- because that is all the asset side carries.

The **tables** -- skills, NPCs, the language tables and the rest -- come from the client's
Lua instead, and :mod:`.export_config` and its sibling export stages emit them. They were
unreadable while the four layers of Lua obfuscation stood, which is why this module's earlier
notes said skill text and skill numbers were not in the client at all; :mod:`.lua` undid those
layers, and that claim is retired. What remains true is that no *bundle* holds a config table
and that ``global-metadata.dat`` is still encrypted -- neither turned out to be where the
tables live.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from . import assets_index
from .catalog import CATALOG
from .common import write_json
from .containers import data_containers, iter_payloads
from .env import optional_dir, require_dir
from .unpack import stage_dir
from .version import stamp_version

IDENT = re.compile(rb"[A-Za-z_][A-Za-z0-9_]{2,}")
ASSET_TABLE = re.compile(rb"Asset_[A-Za-z0-9_]{2,}")
# Class names look like Assassin_Male / Crusader_Peco_Male; animation states extend them.
CLASS_NAME = re.compile(r"^(?P<job>[A-Z][A-Za-z]+)(?:_(?P<mount>Peco))?_(?P<sex>Male|Female)$")
# Animation clip names: Model_Boss_DragonFine_Walking, Model_Monster_X_Idle, Monster_Heihu_Move.
CREATURE = re.compile(
    rb"(?:[Mm]odel_)?(?P<kind>Boss|MonsterSenior|Monster|NPC|Pet)_"
    rb"(?P<entity>[A-Za-z0-9]+)_(?P<state>[A-Za-z0-9_]+)",
)

# Ragnarok map-name conventions. `sc_gef_dun00_001` is Geffen Dungeon, `sc_cmd_fild01_001`
# a Comodo field. Anything else is left unclassified rather than guessed into a bucket.
DUNGEON_TOKENS = ("dun", "anthell", "cave", "hole", "tower", "prison", "maze")
FIELD_TOKENS = ("fild", "field")


def classify_scene(name: str) -> str:
    low = name.lower()
    if any(t in low for t in DUNGEON_TOKENS):
        return "dungeon"
    if any(t in low for t in FIELD_TOKENS):
        return "field"
    return "other"


def collect(vfs_root: Path) -> dict[str, list]:
    proto_tables: set[str] = set()
    class_names: set[str] = set()
    scenes: list[dict] = []
    placements = 0
    creatures: dict[tuple[str, str], set[str]] = {}

    for container in data_containers(vfs_root):
        for payload in iter_payloads(container):
            if payload.kind == "protobuf-schema":
                proto_tables |= {m.decode() for m in ASSET_TABLE.findall(payload.data)}
            if payload.kind in ("text", "protobuf", "binary"):
                for m in CREATURE.finditer(payload.data):
                    kind = m.group("kind").decode()
                    entity = m.group("entity").decode()
                    state = m.group("state").decode().removesuffix(".anim")
                    creatures.setdefault((kind, entity), set()).add(state)
            if payload.kind in ("text", "protobuf"):
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

    seen: set[str] = set()
    unique_scenes = []
    for s in sorted(scenes, key=lambda s: s["name"]):
        if s["name"] in seen:
            continue
        seen.add(s["name"])
        unique_scenes.append({**s, "kind": classify_scene(s["name"])})

    return {
        "assetTables": sorted(proto_tables),
        "classes": [jobs[k] for k in sorted(jobs)],
        "classVariants": sorted(class_names),
        "scenes": unique_scenes,
        "placements": placements,
        "creatures": [
            {"kind": k, "id": e, "states": sorted(v)}
            for (k, e), v in sorted(creatures.items())
        ],
    }


def find_catalog() -> Path | None:
    """The bundle catalogue, if :mod:`.catalog` has been run. ``None`` skips the art rows."""
    for candidate in (optional_dir("RO3_STAGE"), optional_dir("RO3_RAW")):
        if candidate is None:
            continue
        for path in (candidate / CATALOG, candidate / "decrypted" / CATALOG):
            if path.is_file():
                return path
    path = stage_dir() / CATALOG
    return path if path.is_file() else None


def main() -> None:
    vfs = require_dir("RO3_GAME") / "StreamingAssets" / "VFS"
    out = require_dir("RO3_DATA_OUT")
    data = collect(vfs)
    catalog = find_catalog()
    index = assets_index.read(catalog) if catalog else None

    job_icons = assets_index.job_icons(index) if index else {}
    write_json(out / "classes.json", {
        "source": "StreamingAssets/VFS/*.bytes (unencrypted RO3V containers)",
        "iconSource": ("icon_job_* sprites in the decrypted Unity bundles"
                       if index else "not indexed"),
        "classes": [
            {**c, "icons": job_icons.get(c["id"].lower(), [])} for c in data["classes"]
        ],
        "variants": data["classVariants"],
        "unmatchedJobIcons": sorted(
            job for job in job_icons
            if job not in {c["id"].lower() for c in data["classes"]}
        ),
    })
    dungeons = [s for s in data["scenes"] if s["kind"] == "dungeon"]
    write_json(out / "scenes.json", {
        "source": "scene export manifest in the .bytes containers",
        "note": (
            "kind is derived from Ragnarok map-name conventions (_dun/anthell/cave/... = "
            "dungeon, _fild = field); anything unrecognised is left as 'other' rather than "
            "guessed"
        ),
        "counts": {
            k: sum(1 for s in data["scenes"] if s["kind"] == k)
            for k in ("dungeon", "field", "other")
        },
        "scenes": data["scenes"],
    })
    write_json(out / "dungeons.json", {
        "source": "scenes.json filtered to kind == dungeon",
        "artSource": ("dungeon-named sprites in the decrypted Unity bundles"
                      if index else "not indexed"),
        "note": (
            "the dungeon *table* - names, level ranges, rewards - is not in the client; "
            "Asset_MultiDungeon is declared in the protobuf schema but ships no rows. What "
            "is here is the scene manifest and the art that exists for it."
        ),
        "dungeons": dungeons,
        "art": assets_index.dungeon_art(index) if index else [],
    })

    boss_rows = assets_index.bosses(index) if index else []
    monster_rows = assets_index.monsters(index) if index else []
    write_json(out / "bosses.json", {
        "source": "animation clip names in the .bytes containers, plus the bundle catalogue",
        "note": (
            "entity ids and their animation states, harvested from clip names, alongside the "
            "boss models and portraits that ship as Unity assets. Display names and stats are "
            "not in the client at all - see schema.json."
        ),
        "counts": {
            k: sum(1 for c in data["creatures"] if c["kind"] == k)
            for k in sorted({c["kind"] for c in data["creatures"]})
        },
        "creatures": data["creatures"],
        "models": boss_rows,
        "monsters": monster_rows,
    })

    skill_rows = assets_index.skills(index) if index else []
    talent_rows = assets_index.talents(index) if index else []
    write_json(out / "skill-icons.json", {
        "source": "icon_skill_* / icon_talent_* sprites in the decrypted Unity bundles",
        "note": (
            "the skill icon inventory, not a skill table -- each row is an icon the client "
            "ships and a family taken from the icon's own name. The skill table itself is "
            "skills.json, which joins to these icons on its kIcon column; an icon here "
            "with no skill row is art the tables do not reference."
        ),
        "counts": {
            "skills": len(skill_rows),
            "talents": len(talent_rows),
            "families": len({r["family"] for r in skill_rows if r["family"]}),
        },
        "families": sorted({r["family"] for r in skill_rows if r["family"]}),
        "skills": skill_rows,
        "talents": talent_rows,
    })

    write_json(out / "schema.json", {
        "source": "MG_Define.proto (package romsg)",
        "note": (
            "the config-table message types the network schema declares. No bundle among "
            "188,361 ships rows for them - the client's tables are Lua, under "
            "Config/DataConfig, and the ones this dataset carries are named in each table "
            "file's own source field. An Asset_* below with no corresponding table here is "
            "a table nobody has looked for yet, not a table proven absent."
        ),
        "assetTables": data["assetTables"],
    })
    stamp_version(out)

    print(f"classes      : {len(data['classes'])} jobs, {len(data['classVariants'])} variants")
    print(f"scenes       : {len(data['scenes'])} ({len(dungeons)} dungeons)")
    print(f"creatures    : {len(data['creatures'])}")
    print(f"asset tables : {len(data['assetTables'])}")
    if index is None:
        print("catalogue    : not found - run `python -m ro3.unpack` then `python -m ro3.catalog`")
    else:
        print(f"skill icons  : {len(skill_rows)} icons, {len(talent_rows)} talents")
        print(f"boss models  : {len(boss_rows)}")
        print(f"monsters     : {len(monster_rows)} portraits")
    print(f"placements   : {data['placements']} (not emitted)")


if __name__ == "__main__":
    main()
