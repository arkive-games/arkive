"""Turn the bundle catalogue into dataset rows: skills, jobs, dungeons, bosses.

The game's *tables* are not in the client (see :mod:`.export_data` for the evidence), so
what can be derived here is the **asset inventory**: which skill icons exist and how they
group, which job icons exist, which boss models and portraits ship. Those are facts about
the shipped build, read out of :mod:`.catalog`, and they are what ``resource-ro3`` holds
art for — so a row here always has a file behind it.

Nothing is guessed. A skill's family is the token its icon name carries, not a lookup; a
boss's portrait is recorded only when the two names normalise to the same string; and no
row ever invents a display name, a description or a number.
"""

from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path

from .catalog import load

VARIANTS = (".bundle.hd.bundle", ".bundle.ld.bundle")

SKILL_ICON = re.compile(r"^icon_skill_(?P<id>.+)$", re.IGNORECASE)
TALENT_ICON = re.compile(r"^icon_talent_(?P<id>.+)$", re.IGNORECASE)
JOB_ICON = re.compile(r"^icon_job_(?P<job>[a-z0-9]+)(?P<suffix>_[a-z0-9_]+)?$")
BOSS_MESH = re.compile(r"^Model_Boss_(?P<id>.+?)(?:_LOD(?P<lod>\d))?$")
MONSTER_MESH = re.compile(r"^Model_Monster(?:Junior|Senior)?_(?P<id>.+?)(?:_LOD(?P<lod>\d))?$")
MONSTER_PORTRAIT = re.compile(r"^headicon_monster_(?P<id>.+)$")
BOSS_PORTRAIT = re.compile(r"^headicon_(?:boss|explicit)_(?P<id>.+)$")
DUNGEON_ART = re.compile(r"dungeon", re.IGNORECASE)

#: Model names carry an art-quality suffix that the portrait names do not.
QUALITY = re.compile(r"(High|Low|Middle|Fine|Small|Big)$")


def _normalise(name: str) -> str:
    return QUALITY.sub("", name).lower().replace("_", "")


def read(catalog: Path) -> dict[str, dict[str, set[str]]]:
    """``{class: {name: {bundle, ...}}}`` for the base bundles only."""
    out: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    for bundle, obj in load(catalog):
        if bundle.endswith(VARIANTS):
            continue
        out[obj["class"]][obj["name"]].add(bundle)
    return {k: dict(v) for k, v in out.items()}


def _family(ident: str) -> str | None:
    """The leading token of an icon id — ``acolyte`` in ``acolyte_blessing``.

    This is the naming convention the artists used, not a table the game ships, so it is
    reported as-is and is ``None`` for the 25 single-token ids (``middleheal``, ``judex``)
    rather than being guessed at from somewhere else.
    """
    head, sep, _rest = ident.partition("_")
    return head if sep else None


def _icon_rows(index, pattern: re.Pattern[str], prefix: str, out_dir: str) -> list[dict]:
    rows = []
    for name in sorted(index.get("Sprite", {})):
        if not pattern.match(name):
            continue
        ident = name[len(prefix):]
        rows.append({
            "id": ident,
            "family": _family(ident),
            "icon": f"{out_dir}/{name}.webp",
        })
    return rows


def skills(index) -> list[dict]:
    """One row per skill icon: its id, the family its name carries, and its icon file."""
    return _icon_rows(index, SKILL_ICON, "icon_skill_", "icons/skills")


def talents(index) -> list[dict]:
    return _icon_rows(index, TALENT_ICON, "icon_talent_", "icons/talents")


def job_icons(index) -> dict[str, list[str]]:
    """``job -> [icon paths]``. ``_s`` and friends are size variants of the same job."""
    out: dict[str, list[str]] = defaultdict(list)
    for name in sorted(index.get("Sprite", {})):
        m = JOB_ICON.match(name)
        if m:
            out[m.group("job")].append(f"icons/jobs/{name}.webp")
    return dict(out)


def dungeon_art(index) -> list[str]:
    return sorted(
        f"icons/dungeons/{n}.webp"
        for n in index.get("Sprite", {})
        if DUNGEON_ART.search(n)
    )


def bosses(index) -> list[dict]:
    """Boss models, with the LODs that ship and the portrait that matches, if any."""
    meshes = index.get("Mesh", {})
    textures = index.get("Texture2D", {})
    sprites = index.get("Sprite", {})

    portraits = {}
    for name in sprites:
        for pattern, out_dir in ((MONSTER_PORTRAIT, "icons/monsters"),
                                 (BOSS_PORTRAIT, "bosses/portraits")):
            m = pattern.match(name)
            if m:
                portraits.setdefault(_normalise(m.group("id")), f"{out_dir}/{name}.webp")

    by_id: dict[str, set[int]] = defaultdict(set)
    for name in meshes:
        m = BOSS_MESH.match(name)
        if not m:
            continue
        lod = m.group("lod")
        by_id[m.group("id")].add(int(lod) if lod is not None else -1)

    rows = []
    for ident in sorted(by_id):
        lods = sorted(lod for lod in by_id[ident] if lod >= 0)
        base_map = f"Model_Boss_{ident}_LOD0"
        rows.append({
            "id": ident,
            "lods": lods,
            "portrait": portraits.get(_normalise(ident)),
            "baseColorMap": (f"bosses/models/{base_map}.webp"
                             if base_map in textures else None),
        })
    return rows


def monsters(index) -> list[dict]:
    """Monster portraits, and the model ids that normalise to the same name."""
    meshes = {
        MONSTER_MESH.match(n).group("id")
        for n in index.get("Mesh", {})
        if MONSTER_MESH.match(n)
    }
    by_norm: dict[str, list[str]] = defaultdict(list)
    for ident in meshes:
        by_norm[_normalise(ident)].append(ident)

    rows = []
    for name in sorted(index.get("Sprite", {})):
        m = MONSTER_PORTRAIT.match(name)
        if not m:
            continue
        ident = m.group("id")
        rows.append({
            "id": ident,
            "portrait": f"icons/monsters/{name}.webp",
            "models": sorted(by_norm.get(_normalise(ident), [])),
        })
    return rows
