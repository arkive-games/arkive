"""EFTable_ArkGridCore -> core metadata, keyed by the id BattlePoint Type 29 uses.

``PrimaryKey`` here is the same id that BattlePoint Type 29 stores in ``ValueA``,
so this table supplies the names and grades for the values extracted there.
``CoreBookString`` and ``CoreBookCategoryString`` are GameMsg keys, resolved by
:mod:`lostark.locales`.
"""

from __future__ import annotations

from .db import Tables


def extract(tables: Tables) -> dict[str, dict]:
    """Core metadata as ``{core_id: {...}}``.

    ``option_points`` maps the option index BattlePoint Type 29 uses in ``ValueB``
    (1-6) to the activated-point threshold that unlocks it (typically 10, 14, 17,
    18, 19, 20). Without it a caller cannot turn "20 points" into a value lookup,
    because Type 29 is keyed by the index and not by the threshold.
    """
    out: dict[str, dict] = {}
    for row in tables.read("ArkGridCore"):
        points = {
            str(i): row[f"ReqOptionPoint{i}"]
            for i in range(1, 7)
            if row.get(f"ReqOptionPoint{i}")
        }
        out[str(row["PrimaryKey"])] = {
            "group_id": row["GroupId"],
            "grade": row["Grade"],
            "gem_slot_point": row["GemSlotPoint"],
            "category_key": row["CoreBookCategoryString"],
            "name_key": row["CoreBookString"],
            "icon": row["Icon"],
            "icon_index": row["IconIndex"],
            "option_points": points,
        }
    return dict(sorted(out.items(), key=lambda kv: int(kv[0])))


def localization_keys(cores: dict[str, dict]) -> list[str]:
    """Every GameMsg key referenced by ``cores``, deduplicated and sorted."""
    keys = {c["name_key"] for c in cores.values() if c["name_key"]}
    keys |= {c["category_key"] for c in cores.values() if c["category_key"]}
    return sorted(keys)


# The six ark grid slots, in the order the game lays them out.
SLOT_CATEGORIES = [
    "sys.arkgrid.core_order_sun",
    "sys.arkgrid.core_order_moon",
    "sys.arkgrid.core_order_star",
    "sys.arkgrid.core_chaos_sun",
    "sys.arkgrid.core_chaos_moon",
    "sys.arkgrid.core_chaos_star",
]

# Grades run 0-3; the game's own strings for them are offset by two.
GRADE_NAME_KEYS = {
    0: "sys.ability.spec_tooltip_grade_2",  # 英雄
    1: "sys.ability.spec_tooltip_grade_3",  # 传说
    2: "sys.ability.spec_tooltip_grade_4",  # 遗物
    3: "sys.ability.spec_tooltip_grade_5",  # 古代
}


def slots(
    tables: Tables, cores: dict[str, dict], values: dict[str, dict[str, float]]
) -> list[dict]:
    """The six slots, each listing the cores a class can equip there.

    Every ``(category, class, grade)`` holds exactly **six** cores — the six
    variants that class can slot. Order slots are class-specific (``PCClass`` is
    the class id); chaos slots are shared, stored under class ``"0"``.

    Combat power is decided by grade alone for the three order slots and chaos
    star: all six variants in a grade share one value set, and that set is the
    same for every class. The variants still differ in their *effects*, which is
    why they are all offered rather than collapsed.

    **All six are listed, including those that contribute no combat power.** The
    game lets a class equip any of the six, and some are utility options with no
    BattlePoint row; hiding them would show three choices where the game shows
    six. Their amp resolves to zero, and their effect text still explains what
    they do.
    """
    option_desc = {
        str(row["PrimaryKey"]): row["Desc"]
        for row in tables.read("ArkGridCoreOption")
        if row["Desc"]
    }
    option_of_core: dict[str, dict[str, str]] = {}
    class_of_core: dict[str, int] = {}
    for row in tables.read("ArkGridCore"):
        cid = str(row["PrimaryKey"])
        class_of_core[cid] = row["PCClass"] or 0
        mapped = {}
        for i in range(1, 7):
            oid = row[f"Option{i}"]
            if oid and str(oid) in option_desc:
                mapped[str(i)] = option_desc[str(oid)]
        option_of_core[cid] = mapped

    # category -> class -> variant name -> grade -> core
    tree: dict[str, dict[int, dict[str, dict[int, tuple[str, dict]]]]] = {}
    for cid, meta in cores.items():
        by_class = tree.setdefault(meta["category_key"], {})
        by_name = by_class.setdefault(class_of_core.get(cid, 0), {})
        by_name.setdefault(meta["name_key"], {})[meta["grade"]] = (cid, meta)

    out: list[dict] = []
    for category in SLOT_CATEGORIES:
        by_class = tree.get(category, {})
        classes: dict[str, list[dict]] = {}
        for class_id, by_name in sorted(by_class.items()):
            variants = []
            for name_key, by_grade in sorted(by_name.items()):
                grades = {}
                for grade, (cid, meta) in sorted(by_grade.items()):
                    grades[str(grade)] = {
                        "core_id": cid,
                        "name_key": GRADE_NAME_KEYS[grade],
                        "points": meta["option_points"],
                        "options": option_of_core.get(cid, {}),
                        # False for utility variants with no BattlePoint row.
                        "scores": cid in values,
                    }
                variants.append({"name_key": name_key, "grades": grades})
            # Strongest first, so the default pick is what someone optimising
            # combat power would choose.
            variants.sort(
                key=lambda v: -max(
                    (
                        max(values.get(g["core_id"], {}).values(), default=0.0)
                        for g in v["grades"].values()
                    ),
                    default=0.0,
                )
            )
            classes[str(class_id)] = variants

        any_class = next(iter(classes.values()), [])
        out.append(
            {
                "key": category.rsplit(".", 1)[-1].removeprefix("core_"),
                "name_key": category,
                # Chaos slots are shared across classes; order slots are not.
                "class_agnostic": list(classes) == ["0"],
                "icon_index": next(
                    (
                        cores[g["core_id"]]["icon_index"]
                        for v in any_class
                        for g in v["grades"].values()
                    ),
                    None,
                ),
                "by_class": classes,
            }
        )
    return out


def partition_values(
    values: dict[str, dict[str, float]], cores: dict[str, dict]
) -> tuple[dict[str, dict[str, float]], list[str]]:
    """Split BattlePoint core values into those with a definition and orphans.

    BattlePoint Type 29 carries 72 core ids that exist in no other table in the
    extraction — a distinct ``…7xx`` suffix series alongside the shipped ``…0xx``
    one, most plausibly unreleased content. They have combat-power values but no
    name, grade or slot cost, so emitting them would attach real numbers to cores
    the UI cannot describe.

    They are dropped, and the caller records how many, because a silent drop reads
    as full coverage when it is not.
    """
    kept = {cid: points for cid, points in values.items() if cid in cores}
    orphans = sorted(set(values) - set(cores), key=int)
    return kept, [str(o) for o in orphans]
