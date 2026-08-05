"""EFTable_AbilityEngrave + EFTable_Ability -> the engraving roster and its icons.

``AbilityEngrave`` is the roster: 95 distinct ``PrimaryKey`` values, each also a
row in ``Ability`` that carries the name key and the icon reference. ``Type``
splits them the way the game's own UI does — 1 = a general engraving any class
can slot (five levels), 2 = a class engraving (four levels, ``Class`` naming the
class it belongs to).

**Do not filter on ``Ability.IsEngraveAbility``.** It is true for 163 ability ids,
68 of which have no ``AbilityEngrave`` row at all — retired engravings still
carried for old tooltips. Filtering on the flag would ship 68 engravings the game
no longer offers, so the join drives the roster and the flag is ignored.

Icon references follow the convention ``EFTable_ArkPassive`` uses, and it took
some pinning down, so the rule and its evidence are recorded here:

* ``Ability.Icon`` is an atlas **group** name, used verbatim (case-insensitively).
  Its pages are the textures ``<group>_0``, ``<group>_1``, … — note that a group
  name may itself end in digits, e.g. ``Ark_Passive_01`` has pages
  ``ark_passive_01_0`` and ``ark_passive_01_1``. So the trailing number in a group
  name is *not* a page number and must not be stripped.
* ``IconIndex`` is a **flat, zero-based, row-major** cell index across those pages
  in numeric order, with 64x64 cells.
* Zero-based, not one-based. Several ``Ark_Passive_*`` groups have a maximum
  ``IconIndex`` exactly equal to their exported cell count, which reads as
  one-based — but those groups are missing a page from the extraction (``Acc``
  overshoots its single exported page threefold, so gaps are common). The
  semantics settle it: cross-checking ``SkillBuff`` names against the ``buff_0``
  grid, cell 40 is a green "ZZZ" and is named 睡眠 (sleep), cell 53 is a gagged
  mouth and is named 沉默 (silence), cell 50 an insect for 寄生 (parasite), cell
  51 lightning for 触电, cell 43 a ball-and-chain for 减少移速, cell 49 cracked
  ground for 地震, cell 52 a snare for 陷阱, cell 58 an eye for 视线, cell 122 a
  flask for 增加法力. All nine land on the zero-based cell and on a thematically
  unrelated one otherwise.

**How far that is verified.** Those nine matches all sit on ``buff_0``, the first
page of its group, and 34 of the 35 ``Buff``-group engravings have an index inside
it (<= 245). Everything beyond a group's first page is arithmetically consistent —
every crop is grid-aligned, centred and a complete single icon, and the ``Ability``
group's 288 cells bound its highest reference of 278 tightly — but two spot checks
elsewhere in these same groups do **not** line up semantically: ``SkillBuff`` names
five consecutive raid body parts at ``Buff`` 575-579 where ``buff_2`` holds pet
buffs, and names life-skill abilities at ``Ability`` 100-114 where ``ability_0``
holds combat art. One extracted icon shows the symptom directly: ``sweetsong`` (a
Bard engraving, ``Ability`` 275) lands on a cell carrying an 活动 event badge. So
treat the ``buff_0`` region as verified and the rest as the client's own reference
followed faithfully but uncorroborated.

There is a second, older engraving icon set worth knowing about if the above ever
needs re-deriving: the buff each engraving applies is a ``SkillBuff`` row named
"<engraving name> <level>", and those rows point at ``Ability`` 24-90 — a uniform
block of silhouette-and-energy icons, the pre-redesign art. Joining by name covers
76 of the 95, in mixed groups, so it is not a drop-in replacement and is recorded
rather than used.

Two groups the roster references have **no exported pages at all**:
``achieve_03/04/06/07/08`` and ``GL_Skill_01``. All 22 ``EFUI_ICONATLAS_*``
packages were searched; the similarly named ``achieve_0``…``achieve_27`` textures
are the achievement illustration sheets on a 128px grid (the Achievement table's
own ``achieve_04`` indices run 0..63, i.e. 64 cells on a 1024x1024 page), and the
cells those seven engravings would land on are unrelated art — ``achieve_08`` 49 is
the 战锤大师 achievement, which is at least on-theme for 愤怒之锤, but the crop is
a 128px illustration, not an icon. So those seven get ``icon_slug = None`` rather
than a wrong picture; see :data:`ICONLESS`. Five of them do have a ``SkillBuff``
icon (``Ability`` 51/56/26/79 and ``Buff`` 234), which is a different column and
therefore not silently substituted here.
"""

from __future__ import annotations

import re
from pathlib import Path

from .db import Tables

# Engraving Type as the client stores it in ``AbilityEngrave.Type``.
GENERAL = 1
CLASS = 2

NAME_KEY_PREFIX = "tip.name.ability_"

# 64x64 is the cell size of every icon group the engraving roster uses.
CELL = 64

# The seven engravings whose atlas group has no exported texture. Listed so the
# gap is asserted rather than discovered as a missing file in the frontend.
ICONLESS = {
    "ruthless",
    "super_charge",
    "matt_critical",
    "ki_master",
    "free_bombardment",
    "angryhammer",
    "first_critical",
}

# The engraving grade ladder, in the order the tooltip presents it. Both the label
# and the colour come from GameMsg: ``sys.tooltip.engrave_grade_<tier>`` is the
# name and ``sys.engrave.name_color_grade_<n>`` wraps a name in that tier's colour,
# so nothing here is a hand-picked hex value.
GRADES: list[dict[str, object]] = [
    {"grade": 1, "key": "basic", "name_key": "sys.tooltip.engrave_grade_rare"},
    {"grade": 2, "key": "epic", "name_key": "sys.tooltip.engrave_grade_epic"},
    {"grade": 3, "key": "legend", "name_key": "sys.tooltip.engrave_grade_legend"},
    {"grade": 4, "key": "relic", "name_key": "sys.tooltip.engrave_grade_relic"},
]

# ``sys.engrave.name_color_grade_<n>`` -> the colour of grade n.
GRADE_COLOUR_KEYS = {g["grade"]: f"sys.engrave.name_color_grade_{g['grade']}" for g in GRADES}

# Strings the engraving panel renders. Kept as keys so the UI reads like the
# client: a grade is "<n> 阶段刻印", a stone level is "<n>级", and the stone's own
# label is the ``spec_tooltip_grade_0`` entry rather than the word "stone".
UI_KEYS: dict[str, str] = {
    "panel_title": "sys.ability.engrave_spec_title",
    "empty": "sys.ability.engrave_spec_empty",
    # "{0} 阶段刻印" — the stage within a grade.
    "stage": "sys.tooltip.engrave_grade",
    "stage_negative": "sys.tooltip.engrave_grade_negative",
    "grade_and_stage": "sys.tooltip.engrave_option_next_grade",
    # Ability stone: the label, then its two level readouts.
    "stone": "sys.ability.spec_tooltip_grade_0",
    "stone_level": "sys.ability.engrave_spec_stone_success_level",
    "stone_penalty_level": "sys.ability.engrave_spec_stone_penalty_level",
    "stone_empty": "sys.ability.stone_empty_tooltip",
    "stone_mismatch": "sys.ability.stone_unselect_tooltip",
}


def slug(name_key: str) -> str:
    """A stable file-name slug for an engraving, from its GameMsg name key.

    ``tip.name.ability_RUTHLESS1`` -> ``ruthless``. The trailing digit is the
    ability *level* baked into the level-1 row's key, not part of the identity, so
    it is dropped. All 95 slugs are distinct; :func:`extract` asserts that, since a
    collision would silently overwrite an icon file.
    """
    stem = name_key.rsplit(NAME_KEY_PREFIX, 1)[-1]
    return re.sub(r"[^a-z0-9]+", "_", re.sub(r"\d+$", "", stem).lower()).strip("_")


def extract(tables: Tables, locale_names: dict[str, str] | None = None) -> dict[str, dict]:
    """The engraving roster as ``{engraving_id: {...}}``, in client id order.

    ``levels`` maps each level the game offers to the engraving points it costs —
    ``AbilityEngrave.SecondaryKey`` -> ``AbilityPoint``. General engravings have
    five levels and class engravings four, which is why the count is read per
    engraving instead of assumed.

    ``locale_names`` maps GameMsg keys to resolved text and is used only to mark
    the support class engravings, the same way :mod:`lostark.classes` does it —
    the client marks no engraving as damage or support, so the decision is made by
    name against ``classes.SUPPORT_SUBCLASS_NAMES``.
    """
    from .classes import SUPPORT_SUBCLASS_NAMES

    ability: dict[int, dict] = {}
    for row in tables.read("Ability"):
        # SecondaryKey is the engraving level; level 1 carries the shared name and
        # icon, and every level of an engraving repeats them.
        if row["PrimaryKey"] not in ability or row["SecondaryKey"] == 1:
            ability[row["PrimaryKey"]] = row

    grouped: dict[int, list[dict]] = {}
    for row in tables.read("AbilityEngrave"):
        grouped.setdefault(row["PrimaryKey"], []).append(row)

    out: dict[str, dict] = {}
    for engraving_id, rows in sorted(grouped.items()):
        rows.sort(key=lambda r: r["SecondaryKey"])
        first = rows[0]
        a = ability[engraving_id]
        name_key = a["Name"]
        key = slug(name_key)
        label = (locale_names or {}).get(name_key)
        out[str(engraving_id)] = {
            "slug": key,
            "type": first["Type"],
            "class_id": first["Class"] or None,
            "name_key": name_key,
            "desc_key": a["Desc"] or None,
            "icon": a["Icon"],
            "icon_index": a["IconIndex"],
            # None for the seven with no exported atlas, so the frontend can fall
            # back instead of requesting a file that was never written.
            "icon_slug": None if key in ICONLESS else key,
            "levels": {str(r["SecondaryKey"]): r["AbilityPoint"] for r in rows},
            # Support only where the class engraving is the support sub-class;
            # general engravings are not marked either way by the client.
            "role": (
                "support"
                if first["Type"] == CLASS and label in SUPPORT_SUBCLASS_NAMES
                else "dps"
                if first["Type"] == CLASS
                else None
            ),
        }

    slugs = [e["slug"] for e in out.values()]
    if len(set(slugs)) != len(slugs):
        raise ValueError("engraving slugs collide; icon files would overwrite each other")
    return out


def localization_keys(engravings: dict[str, dict]) -> list[str]:
    """Every GameMsg key the engraving panel renders, deduplicated and sorted."""
    keys = set(UI_KEYS.values())
    keys |= {str(g["name_key"]) for g in GRADES}
    keys |= set(GRADE_COLOUR_KEYS.values())
    keys |= {e["name_key"] for e in engravings.values() if e["name_key"]}
    keys |= {e["desc_key"] for e in engravings.values() if e["desc_key"]}
    return sorted(keys)


def atlas_pages(atlas_root: Path, group: str) -> list[Path]:
    """The texture pages of ``group``, in the order ``IconIndex`` runs through them.

    ``atlas_root`` is a directory of per-package directories of PNGs, as produced
    by ``laex textures``. Page order is the numeric suffix, and the group name is
    matched whole — ``buff`` must not pick up ``buff_icon_0``.
    """
    pattern = re.compile(rf"^{re.escape(group.lower())}_(\d+)$")
    found: list[tuple[int, Path]] = []
    for path in Path(atlas_root).rglob("*.png"):
        match = pattern.match(path.stem.lower())
        if match:
            found.append((int(match.group(1)), path))
    return [path for _, path in sorted(found)]


def cell_box(page_size: tuple[int, int], index: int) -> tuple[int, int, int, int] | None:
    """The crop box of flat cell ``index`` on a page of ``page_size``, or None.

    None when the page holds fewer than ``index + 1`` cells, which is how a caller
    walks the pages of a group: subtract each page's cell count until the index
    lands inside one.
    """
    width, height = page_size
    columns, rows = width // CELL, height // CELL
    if index >= columns * rows:
        return None
    x, y = (index % columns) * CELL, (index // columns) * CELL
    return x, y, x + CELL, y + CELL


def locate(atlas_root: Path, group: str, index: int) -> tuple[Path, tuple[int, int, int, int]] | None:
    """Resolve ``(group, index)`` to a page and a crop box, or None when absent.

    Absent means either the group has no exported pages or the index runs past the
    last one. Both happen in this extraction and neither is an error here — the
    caller decides whether a missing icon is fatal.
    """
    from PIL import Image

    remaining = index
    for page in atlas_pages(atlas_root, group):
        with Image.open(page) as image:
            box = cell_box(image.size, remaining)
            if box is not None:
                return page, box
            remaining -= (image.width // CELL) * (image.height // CELL)
    return None


def write_icons(
    engravings: dict[str, dict], atlas_root: Path, out_dir: Path
) -> tuple[list[str], list[str]]:
    """Write one ``<slug>.png`` per engraving at the atlas's native 64x64.

    Returns ``(written, missing)`` slugs. Nothing is upscaled: the frontend gets
    the game's own pixels and sizes them with CSS.
    """
    from PIL import Image

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[str] = []
    missing: list[str] = []
    for engraving in sorted(engravings.values(), key=lambda e: e["slug"]):
        found = locate(atlas_root, engraving["icon"], engraving["icon_index"])
        if found is None:
            missing.append(engraving["slug"])
            continue
        page, box = found
        with Image.open(page) as image:
            image.convert("RGBA").crop(box).save(out_dir / f"{engraving['slug']}.png")
        written.append(engraving["slug"])
    return written, missing
