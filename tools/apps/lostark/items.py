"""EFTable_Item -> names, grades and set labels for the gear the calculator picks.

The gear selectors are keyed by ``EFTable_ItemLevelOption.PrimaryKey``, which is
**not** an item id: it is a stat template that many items share. The join back to
a name is ``Item.LevelOptionId == ItemLevelOption.PrimaryKey`` (68 templates, all
68 referenced by 1682 items), and the name is ``Item.Name`` — a GameMsg key of
the form ``tip.name.item_<item id>``.

One template spans every class. The same armour piece is listed once per main
stat (``Str``/``Agi``/``Int``) and a weapon template covers all 29 class weapon
types, so a template on its own has no single name: the name is only determined
once a class is chosen. Everything here is therefore keyed by class id, matching
``classes.extract`` and the app's class selector.

**The client does not name armour sets.** ``Item.SetIndex`` is 0 for all 1682 of
these items, so ``EFTable_ItemSet`` — which does name sets, for avatars and
legacy gear — holds no row for any of them. Two things are emitted instead:

``set_key``
    ``ItemAssembly.TypeName``, the crafting UI's own category name for the
    series ('命运业火装备'). Present for 3 of the 4 armour families and 3 of the
    8 weapon templates; the relic family and the Esther weapons are not
    craftable, so the client gives them no category name at all.

``series``
    the five piece name keys of one series, per class. The set label the app
    shows is their **common prefix** ('命运业火' out of 命运业火头盔 / 上装 /
    下装 / 手套 / 肩甲), which is DERIVED from piece names rather than a set name
    the client ships. Verified non-empty for every series in both zh-CN and
    ko-KR before shipping.
"""

from __future__ import annotations

from collections import Counter, defaultdict

from .classes import NAME_ALIASES, _normalise
from .db import Tables

# ``Item.Grade`` is an enum. 3..6 are pinned by the client's own crafting
# categories: every item under a ``sys.itemassembly.category_equip_*_epic`` key
# is Grade 3, ``*_legend`` 4, ``*_relic`` 5 and ``*_ancient`` 6 — 168/168/168/684
# rows with no exception. 7 is Esther: the four Grade-7 weapon templates are the
# named Esther weapons (페일 노트, 엘루미나르, 투쟁의 산맥 …). Grades 0-2 follow
# the enum's own order and are unverified — no gear we emit uses them.
GRADE_NAME_KEYS = {
    0: "tip.name.enum_itemgrade_common",
    1: "tip.name.enum_itemgrade_uncommon",
    2: "tip.name.enum_itemgrade_rare",
    3: "tip.name.enum_itemgrade_epic",
    4: "tip.name.enum_itemgrade_legend",
    5: "tip.name.enum_itemgrade_relic",
    6: "tip.name.enum_itemgrade_ancient",
    7: "tip.name.enum_itemgrade_esther",
}

# The template id's 8th digit is the slot; "0" is the weapon and 1..5 the five
# armour slots, which is also how the frontend groups a set (the leading 7).
WEAPON_SLOT = "0"
ARMOUR_SLOTS = 5


def _class_columns(tables: Tables) -> dict[str, int]:
    """``Item.For<Class>`` column name -> ``PC.PrimaryKey``.

    The two legacy mismatches are the inverse of ``classes.NAME_ALIASES``:
    ``Item`` calls the Gunlancer *Warlord* and the Force Master *Kimaster*'s
    other name, while ``PC.Name`` uses the internal one.
    """
    aliases = {_normalise(msg): _normalise(pc) for pc, msg in NAME_ALIASES.items()}

    with tables.connect("PC") as con:
        by_name = {
            _normalise(row["Name"]): row["PrimaryKey"]
            for row in con.execute("SELECT PrimaryKey, Name FROM PC")
        }

    with tables.connect("Item") as con:
        columns = [row[1] for row in con.execute("PRAGMA table_info(Item)")]

    out: dict[str, int] = {}
    for column in columns:
        if not column.startswith("For"):
            continue
        name = _normalise(column[3:])
        class_id = by_name.get(aliases.get(name, name))
        if class_id is not None:
            out[column] = class_id
    return out


def _assembly_categories(tables: Tables) -> dict[int, str]:
    """``Item`` id -> the GameMsg key naming its crafting category."""
    out: dict[int, str] = {}
    with tables.connect("ItemAssembly") as con:
        for item_id, type_name in con.execute(
            "SELECT ItemId, TypeName FROM ItemAssembly WHERE TypeName <> ''"
        ):
            out.setdefault(item_id, type_name)
    return out


def _single_grade(template: str, grades: Counter) -> int:
    """The one grade a template's items share.

    Every one of the 68 templates is single-grade; a template that ever mixed
    grades would make the option's colour a lie, so this refuses to guess.
    """
    if len(grades) != 1:
        raise ValueError(f"template {template} spans grades {sorted(grades)}")
    return next(iter(grades))


def extract(tables: Tables) -> dict[str, object]:
    """Names, grades and set labels for every gear template, keyed by class id."""
    templates = {row["PrimaryKey"] for row in tables.read("ItemLevelOption")}
    columns = _class_columns(tables)
    assembly = _assembly_categories(tables)

    # item rows per template, cheaply: Item has 300 columns and 129,910 rows.
    selected = ["PrimaryKey", "Name", "Grade", "LevelOptionId", *columns]
    by_template: dict[int, list[dict]] = defaultdict(list)
    with tables.connect("Item") as con:
        sql = f"SELECT {', '.join(selected)} FROM Item WHERE LevelOptionId <> 0"
        for row in con.execute(sql):
            if row["LevelOptionId"] in templates:
                by_template[row["LevelOptionId"]].append(dict(row))

    weapons: dict[str, dict] = {}
    # set group -> class id -> series id -> slot digit -> name key
    armour: dict[str, dict[int, dict[str, dict[str, str]]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(dict))
    )
    armour_grades: dict[str, Counter] = defaultdict(Counter)
    armour_sets: dict[str, Counter] = defaultdict(Counter)
    grades_used: set[int] = set()
    unnamed: list[str] = []

    for template in sorted(templates):
        key = str(template)
        rows = by_template.get(template, [])
        if not rows:
            unnamed.append(key)
            continue

        slot = key[7]
        grades = Counter(row["Grade"] for row in rows)
        categories = Counter(
            assembly[row["PrimaryKey"]] for row in rows if row["PrimaryKey"] in assembly
        )
        set_key = categories.most_common(1)[0][0] if categories else None

        if slot == WEAPON_SLOT:
            names: dict[int, list[str]] = defaultdict(list)
            for row in sorted(rows, key=lambda r: r["PrimaryKey"]):
                for column, class_id in columns.items():
                    if row[column]:
                        names[class_id].append(row["Name"])
            grade = _single_grade(key, grades)
            grades_used.add(grade)
            weapons[key] = {
                "grade": grade,
                "set_key": set_key,
                # Same duplicate-copy problem as armour: dedupe by key.
                "names": {str(c): list(dict.fromkeys(names[c])) for c in sorted(names)},
            }
            continue

        group = key[:7]
        armour_grades[group].update(grades)
        if set_key:
            armour_sets[group].update(categories)
        for row in sorted(rows, key=lambda r: r["PrimaryKey"]):
            # An armour item id is <series><slot>, the same shape as the
            # template id, so the series is the id minus its last digit.
            series = str(row["PrimaryKey"])[:-1]
            for column, class_id in columns.items():
                if row[column]:
                    armour[group][class_id][series][slot] = row["Name"]

    sets: dict[str, dict] = {}
    for group in sorted(armour):
        grade = _single_grade(group, armour_grades[group])
        grades_used.add(grade)
        series_by_class: dict[str, list[list[str]]] = {}
        for class_id in sorted(armour[group]):
            # Item ids alone over-count: a family ships bound and tradable
            # copies of the same gear (13451111xx and 13451311xx) which reuse
            # one set of name keys, so the same label would appear twice.
            # Deduplicate by the keys, keeping the first (lowest id) series.
            seen: set[tuple[str, ...]] = set()
            complete: list[list[str]] = []
            for _, slots in sorted(armour[group][class_id].items()):
                if len(slots) != ARMOUR_SLOTS:
                    continue
                keys = [slots[str(i)] for i in range(1, ARMOUR_SLOTS + 1)]
                if tuple(keys) in seen:
                    continue
                seen.add(tuple(keys))
                complete.append(keys)
            if complete:
                series_by_class[str(class_id)] = complete
        sets[group] = {
            "grade": grade,
            "set_key": armour_sets[group].most_common(1)[0][0] if armour_sets[group] else None,
            "series": series_by_class,
        }

    return {
        "grades": {str(g): GRADE_NAME_KEYS[g] for g in sorted(grades_used)},
        "weapons": weapons,
        "sets": sets,
        # Templates no item references: none today, but shipped rather than
        # hidden so the frontend can fall back to the bare id if that changes.
        "unnamed": unnamed,
    }


def localization_keys(data: dict[str, object]) -> list[str]:
    """Every GameMsg key the emitted gear names reference."""
    keys: set[str] = set(data["grades"].values())  # type: ignore[union-attr]
    for weapon in data["weapons"].values():  # type: ignore[union-attr]
        if weapon["set_key"]:
            keys.add(weapon["set_key"])
        for names in weapon["names"].values():
            keys.update(names)
    for group in data["sets"].values():  # type: ignore[union-attr]
        if group["set_key"]:
            keys.add(group["set_key"])
        for series in group["series"].values():
            for piece_keys in series:
                keys.update(piece_keys)
    return sorted(keys)
