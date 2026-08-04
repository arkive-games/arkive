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
    """The six slots, each with the variants that actually affect combat power.

    Combat power is determined by **grade alone** for the three order slots and
    for chaos star: every core in a given (category, grade) shares one value set,
    across all 29 classes. Chaos sun and moon are the exception — at grades 1-3
    their three variants carry two distinct value sets, so those slots need a
    variant choice and the others do not.

    Only cores with a non-zero value are considered: the rest are utility options
    that never move the score, and offering them would imply otherwise.
    """
    option_desc = {
        str(row["PrimaryKey"]): row["Desc"]
        for row in tables.read("ArkGridCoreOption")
        if row["Desc"]
    }
    option_of_core: dict[str, dict[str, str]] = {}
    for row in tables.read("ArkGridCore"):
        cid = str(row["PrimaryKey"])
        mapped = {}
        for i in range(1, 7):
            oid = row[f"Option{i}"]
            if oid and str(oid) in option_desc:
                mapped[str(i)] = option_desc[str(oid)]
        option_of_core[cid] = mapped

    by_category: dict[str, list[tuple[str, dict]]] = {}
    for cid, meta in cores.items():
        if cid not in values:
            continue
        by_category.setdefault(meta["category_key"], []).append((cid, meta))

    out: list[dict] = []
    for category in SLOT_CATEGORIES:
        entries = sorted(by_category.get(category, []), key=lambda kv: int(kv[0]))
        # Group by the variant's own name; a variant spans grades.
        variants: dict[str, dict[int, tuple[str, dict]]] = {}
        for cid, meta in entries:
            variants.setdefault(meta["name_key"], {})[meta["grade"]] = (cid, meta)

        # Collapse by VALUE PROFILE, not by name. An order slot has 162
        # value-carrying cores (six variants across 29 classes) that all share one
        # profile per grade, so naming them separately would offer 162 choices that
        # compute the same score. Cores whose profiles are identical are
        # interchangeable here; their names are merged onto one row.
        by_profile: dict[tuple, dict] = {}
        for name_key, by_grade in variants.items():
            profile = tuple(
                (grade, tuple(sorted(values[cid].items())))
                for grade, (cid, _) in sorted(by_grade.items())
            )
            row = by_profile.get(profile)
            if row is None:
                grades = {}
                for grade, (cid, meta) in sorted(by_grade.items()):
                    grades[str(grade)] = {
                        "core_id": cid,
                        "name_key": GRADE_NAME_KEYS[grade],
                        "points": meta["option_points"],
                        "options": option_of_core.get(cid, {}),
                    }
                by_profile[profile] = {"name_keys": [name_key], "grades": grades}
            else:
                row["name_keys"].append(name_key)

        variant_rows = list(by_profile.values())
        for row in variant_rows:
            row["name_keys"] = sorted(row["name_keys"])
        # Strongest first, so the default pick is what someone optimising combat
        # power would choose.
        variant_rows.sort(
            key=lambda v: -max(
                (max(values[g["core_id"]].values(), default=0.0) for g in v["grades"].values()),
                default=0.0,
            )
        )
        out.append(
            {
                "key": category.rsplit(".", 1)[-1].removeprefix("core_"),
                "name_key": category,
                "icon_index": next(
                    (m["icon_index"] for _, m in entries if "icon_index" in m), None
                ),
                "variants": variant_rows,
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
