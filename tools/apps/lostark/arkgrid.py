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
            "option_points": points,
        }
    return dict(sorted(out.items(), key=lambda kv: int(kv[0])))


def localization_keys(cores: dict[str, dict]) -> list[str]:
    """Every GameMsg key referenced by ``cores``, deduplicated and sorted."""
    keys = {c["name_key"] for c in cores.values() if c["name_key"]}
    keys |= {c["category_key"] for c in cores.values() if c["category_key"]}
    return sorted(keys)


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
