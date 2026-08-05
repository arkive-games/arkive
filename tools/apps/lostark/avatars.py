"""Avatar (时装 / 아바타) slots and the main-stat percentage each grade grants.

The avatar bonus is the one system the calculator modelled from the fan site that
turned out **not** to be a combat-power amp at all, which is why looking for it in
``EFTable_BattlePoint`` failed: the 35-member ``tip.name.enum_battlepointtype_*``
enum has no avatar entry. An avatar raises the character's **main stat**, and that
lives on the item, in ``EFTable_ItemGradeOptionStatic``.

**The chain.** ``Item.Type = 9`` is the avatar type (36,995 rows). Every avatar
that carries a bonus points at one ``StaticOptionId0``, and that row of
``ItemGradeOptionStatic`` holds a single addon slot::

    AddonType00 = 2, AddonStat00 in {7, 8, 9}, AddonValue00 in {50, 100, 200}

``ItemGradeOptionStatic.SecondaryKey`` **is** the item's ``Grade``, and the value
depends on nothing else: grade 2 -> 50, grade 3 -> 100, grade 4 -> 200, uniform
across every avatar category and every stat variant (asserted in
:func:`options`). Grades 2/3/4 are ``rare``/``epic``/``legend``, i.e. the fan
site's 稀有 / 英雄 / 传说.

**Stats 7/8/9 are the *percentage* variants of Str/Agi/Int**, and the divisor is
1e4. Three independent checks:

* The flat main stats are ids **3/4/5** (Str/Agi/Int) and Con is 6 — read off
  ``SkillBuff`` rows whose description says 力量/敏捷/智力/体力增加 with the value
  printed as a plain number.
* ``SkillBuff`` 120000 grants stat **7** with value ``5000`` and reads
  "力量增加50%"; 6110/6111/6112 grant stat **8** with ``-3000``/``-5000``/``-7000``
  and read 敏捷减少 30% / 50% / 70%. So ``value / 1e4`` is the fraction — the same
  divisor every rate in this dataset uses.
* Which of 7/8/9 is which follows from the items' own class restriction: the three
  ``StaticOptionId0`` variants of one category differ only in ``AddonStat00``, and
  ``Item.For<Class>`` splits them into the Str classes (7: Berserker, Destroyer,
  Warlord, HolyKnight, …), the Agi classes (8: Blade, Demonic, Reaper, SoulEater,
  …) and the Int classes (9: Arcana, Bard, Summoner, ElementalMaster, …).

50/100/200 over 1e4 is 0.5% / 1% / 2% — **exactly** the fan site's
``{0.005, 0.01, 0.02}``, in the same grade order, so the calculator's shape
(``mainStat *= 1 + sum(amp)``) was right and only its provenance was wrong.

**Which slots carry a bonus.** Four, and they are the fan site's four:
head, upper body, lower body and weapon. Face 1, face 2, the instrument and the
footstep effect all have ``StaticOptionId0 = 0`` and grant nothing.

``Item.Category`` -> equip slot is **not** carried by any single table, so
:data:`SLOT_CATEGORIES` is declared here. It is read off four agreeing signals
rather than guessed:

1. ``ItemDictionaryCategoryInfo`` groups the categories: 301 -> 90101,
   305 -> 90102, 306 -> 90103, 308 -> every ``902xx``, and 302/303 -> 90104/90105
   (the two face slots, which score nothing).
2. Item id prefixes run in the same families: ``311…`` head, ``321…`` upper,
   ``331…`` lower, ``341…`` face, ``361…`` instrument, ``30x…`` weapon.
3. Each category's resolved zh-CN item names end in the very word the
   ``tip.name.enum_equipslot_avatar_*`` label begins with (头部 / 上装 / 下装 /
   上下装 / 武器). :func:`slot_name_suffixes` exposes that check to the tests.
4. Category **90107** grants 200 at grade 3 where upper and lower each grant 100,
   which is only consistent with it being the *combined* upper+lower garment.

That last one is why 90107 is not offered as a fifth slot: a 上下装 is **exactly**
equivalent to an epic upper plus an epic lower, so offering it would only let a
user double-count. It is reported by :func:`combined_slot` so the equivalence is
recorded rather than silently dropped, and because it is the one thing the fan
site's four-slot model cannot express at all.

The weapon slot spans 29 per-class categories (``902xx``); they are folded into
one slot because a character has exactly one weapon avatar and all 29 carry the
same value ladder.
"""

from __future__ import annotations

from collections import defaultdict

from .db import Tables

# Item.Type for an avatar.
AVATAR_ITEM_TYPE = 9

# ItemGradeOptionStatic.AddonType for an addon that adds to a stat.
ADDON_TYPE_STAT = 2

# Addon stat ids that are the *percentage* variants of the three main stats.
# See the module docstring for the three checks behind this.
MAIN_STAT_PERCENT_STATS: dict[int, str] = {7: "str", 8: "agi", 9: "int"}

# The divisor that turns a rate-like value into a fraction, as everywhere else in
# this dataset (Ability 11061 reads "+3%" and carries 300).
_RATE_DIVISOR = 10_000

# Slot key -> (Item.Category values, equip-slot GameMsg key), in the order the
# client's own avatar panel lists them.
SLOT_CATEGORIES: list[dict[str, object]] = [
    {"key": "head", "categories": [90101], "name_key": "tip.name.enum_equipslot_avatar_head"},
    {
        "key": "upper_body",
        "categories": [90102],
        "name_key": "tip.name.enum_equipslot_avatar_upper_body",
    },
    {
        "key": "lower_body",
        "categories": [90103],
        "name_key": "tip.name.enum_equipslot_avatar_lower_body",
    },
    # The 29 per-class weapon-avatar categories. Listed as a range rather than
    # spelled out: a new class ships a new 902xx category, and hard-coding the 29
    # would silently drop it.
    {
        "key": "weapon",
        "category_range": (90200, 90299),
        "name_key": "tip.name.enum_equipslot_avatar_weapon",
    },
]

# The combined upper+lower garment. Not a slot -- see the module docstring.
COMBINED_CATEGORY = 90107

# Item.Grade -> the client's own grade name. Only these three grades exist on a
# stat-bearing avatar; there is no relic or ancient one.
GRADES: list[dict[str, object]] = [
    {"grade": 2, "key": "rare", "name_key": "tip.name.enum_itemgrade_rare"},
    {"grade": 3, "key": "epic", "name_key": "tip.name.enum_itemgrade_epic"},
    {"grade": 4, "key": "legend", "name_key": "tip.name.enum_itemgrade_legend"},
]

# Strings the panel renders: the client's own avatar tab title, and its word for an
# empty slot. ``none`` is owned here rather than borrowed from another module's key
# set, so the avatar panel resolves on its own.
UI_KEYS: dict[str, str] = {
    "title": "sys.characterinfo.avatar_tab_title",
    "none": "sys.common.none",
}


def slot_name_suffixes() -> dict[str, str]:
    """Slot key -> the word its items' zh-CN names end with.

    Signal 3 of the four behind :data:`SLOT_CATEGORIES`, exposed so a test can
    re-check it against the extraction instead of trusting the constant. The
    equip-slot label is this word plus 外观 ("appearance"), so a head avatar is
    named "…头部" and its slot "头部外观".
    """
    return {
        "head": "头部",
        "upper_body": "上装",
        "lower_body": "下装",
        "weapon": "武器",
    }


def _slot_of(category: int) -> str | None:
    """The slot key a ``Item.Category`` belongs to, or None when it carries none."""
    for slot in SLOT_CATEGORIES:
        if category in (slot.get("categories") or []):
            return str(slot["key"])
        span = slot.get("category_range")
        if span and span[0] <= category <= span[1]:
            return str(slot["key"])
    return None


def _addons(tables: Tables) -> dict[int, tuple[int, int, int, int]]:
    """``ItemGradeOptionStatic`` addon slot 00 by id, as ``(grade, type, stat, value)``.

    ``SecondaryKey`` is the grade the row applies to; it is carried through so
    :func:`options` can assert it matches the item's own ``Grade`` rather than
    assuming the two agree.
    """
    out: dict[int, tuple[int, int, int, int]] = {}
    with tables.connect("ItemGradeOptionStatic") as con:
        rows = con.execute(
            "SELECT PrimaryKey, SecondaryKey, AddonType00, AddonStat00, AddonValue00"
            " FROM ItemGradeOptionStatic"
        )
        for key, grade, addon_type, stat, value in rows:
            out[key] = (grade, addon_type, stat, value)
    return out


def _avatar_rows(tables: Tables) -> list[tuple[int, int, int, int]]:
    """``(item id, category, grade, static option id)`` for every avatar with a bonus.

    Read with an explicit column list and a ``WHERE``: ``EFTable_Item`` is 129,910
    rows over 250-odd columns, and ``SELECT *`` over all of it costs a minute.
    """
    with tables.connect("Item") as con:
        return [
            (row[0], row[1], row[2], row[3])
            for row in con.execute(
                "SELECT PrimaryKey, Category, Grade, StaticOptionId0 FROM Item"
                " WHERE Type = ? AND StaticOptionId0 <> 0",
                (AVATAR_ITEM_TYPE,),
            )
        ]


def _by_slot_grade(tables: Tables) -> dict[tuple[str, int], dict[str, object]]:
    """``(slot_key, grade)`` -> the addon it grants, with the ids behind it.

    Raises when a group is not uniform. That is the check that makes the decode a
    reading rather than a sample: every (category, grade) group over all 36,995
    avatar items resolves to one value.
    """
    addons = _addons(tables)
    groups: dict[tuple[str, int], dict[str, object]] = {}
    for item_id, category, item_grade, option_id in _avatar_rows(tables):
        slot = _slot_of(category)
        if slot is None:
            continue
        addon = addons.get(option_id)
        if addon is None:
            raise ValueError(f"avatar {item_id} points at missing option {option_id}")
        grade_of_option, addon_type, stat, value = addon
        if addon_type != ADDON_TYPE_STAT or stat not in MAIN_STAT_PERCENT_STATS:
            raise ValueError(
                f"avatar option {option_id} is not a main-stat percentage: "
                f"type={addon_type} stat={stat}"
            )
        if grade_of_option != item_grade:
            raise ValueError(
                f"avatar {item_id} is grade {item_grade} but its option "
                f"{option_id} is keyed to {grade_of_option}"
            )
        entry = groups.setdefault(
            (slot, item_grade),
            {"value": value, "items": 0, "option_ids": set(), "stats": set()},
        )
        if entry["value"] != value:
            raise ValueError(
                f"{slot} grade {item_grade} grants both {entry['value']} and {value}"
            )
        entry["items"] = int(entry["items"]) + 1
        entry["option_ids"].add(option_id)  # type: ignore[union-attr]
        entry["stats"].add(stat)  # type: ignore[union-attr]
    return groups


def slots() -> list[dict[str, object]]:
    """The four stat-bearing avatar slots, in the client's panel order."""
    return [
        {"key": slot["key"], "name_key": slot["name_key"]}
        for slot in SLOT_CATEGORIES
    ]


def options(tables: Tables) -> list[dict[str, object]]:
    """Every ``(slot, grade)`` a player can pick, with its main-stat amp.

    ``amp`` is a fraction of the main stat, not combat power: the calculator
    multiplies the summed amps into ``mainStat`` before the attack formula, which
    is what the client does with a ``stat 7/8/9`` addon.

    ``items`` is how many avatar items land in the group. It is emitted because it
    is the only cheap way for a reader to see that the group is a real population
    and not a single stray row -- the smallest is 4 items and the largest 8,502.
    """
    groups = _by_slot_grade(tables)
    order = {str(s["key"]): i for i, s in enumerate(SLOT_CATEGORIES)}
    grade_keys = {int(g["grade"]): str(g["key"]) for g in GRADES}
    out: list[dict[str, object]] = []
    for (slot, grade), entry in groups.items():
        if grade not in grade_keys:
            raise ValueError(f"avatar grade {grade} has no name in GRADES")
        out.append(
            {
                "id": f"{slot}-{grade}",
                "slot_key": slot,
                "grade": grade,
                "grade_key": grade_keys[grade],
                "amp": int(entry["value"]) / _RATE_DIVISOR,
                "items": entry["items"],
                "stats": sorted(entry["stats"]),  # type: ignore[arg-type]
            }
        )
    out.sort(key=lambda o: (order[str(o["slot_key"])], int(o["grade"])))
    return out


def combined_slot(tables: Tables) -> dict[str, object]:
    """The 上下装 garment, and the proof it needs no slot of its own.

    Category :data:`COMBINED_CATEGORY` occupies the upper *and* lower slots at
    once. ``equivalent_to`` names the two options whose amps it equals, and
    ``amp`` is its own; the two are asserted equal here, because that equality is
    the whole reason the slot list has four entries instead of five.
    """
    addons = _addons(tables)
    values: set[int] = set()
    grades: set[int] = set()
    items = 0
    for _, category, item_grade, option_id in _avatar_rows(tables):
        if category != COMBINED_CATEGORY:
            continue
        _, addon_type, stat, value = addons[option_id]
        if addon_type != ADDON_TYPE_STAT or stat not in MAIN_STAT_PERCENT_STATS:
            raise ValueError(f"combined avatar option {option_id} is not a main stat")
        values.add(value)
        grades.add(item_grade)
        items += 1
    if len(values) != 1 or len(grades) != 1:
        raise ValueError(f"combined avatar slot is not uniform: {values}, {grades}")

    amp = values.pop() / _RATE_DIVISOR
    grade = grades.pop()
    by_id = {str(o["id"]): o for o in options(tables)}
    parts = [f"upper_body-{grade}", f"lower_body-{grade}"]
    total = sum(float(by_id[p]["amp"]) for p in parts)
    if round(total, 6) != round(amp, 6):
        raise ValueError(f"combined avatar amp {amp} is not upper+lower {total}")
    return {
        "category": COMBINED_CATEGORY,
        "grade": grade,
        "amp": amp,
        "items": items,
        "equivalent_to": parts,
    }


def localization_keys() -> list[str]:
    """Every GameMsg key the avatar panel renders, deduplicated and sorted."""
    keys = {str(s["name_key"]) for s in SLOT_CATEGORIES}
    keys |= {str(g["name_key"]) for g in GRADES}
    keys |= set(UI_KEYS.values())
    return sorted(keys)


def stat_variants(tables: Tables) -> dict[int, list[str]]:
    """Addon stat id -> the internal class names its avatars are restricted to.

    The evidence for ``7/8/9 = Str/Agi/Int``, recomputed rather than asserted in
    prose: an avatar names exactly one ``For<Class>`` column, and grouping those
    by the addon stat splits the roster into the three main-stat families.
    """
    out: dict[int, set[str]] = defaultdict(set)
    addons = _addons(tables)
    with tables.connect("Item") as con:
        columns = [r[1] for r in con.execute("PRAGMA table_info(Item)") if r[1].startswith("For")]
        selected = ["Category", "StaticOptionId0", *columns]
        quoted = ", ".join(f'"{c}"' for c in selected)
        for row in con.execute(
            f"SELECT {quoted} FROM Item WHERE Type = ? AND StaticOptionId0 <> 0",
            (AVATAR_ITEM_TYPE,),
        ):
            if _slot_of(row["Category"]) is None:
                continue
            _, _, stat, _ = addons[row["StaticOptionId0"]]
            for column in columns:
                if row[column]:
                    out[stat].add(column[len("For") :])
    return {stat: sorted(names) for stat, names in sorted(out.items())}
