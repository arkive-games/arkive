"""Emit the equipment-reforge graces (装备重塑 / 恩赐) into ``data-gmzz``.

Run from ``tools/``::

    uv run python -m gmzz.reforge

Reforging (``重塑``) rerolls an equipment's random affixes (``词条``). Affixes
come in three kinds — normal, extraordinary (``非凡``) and contaminated
(``污染``) — and once a piece carries two or more *extraordinary* ones, their
stat groups combine into a **named grace** (``恩赐``): 征服宣言, 血谋共舞的旗帜,
铁火铸就的盟约, and so on. The grace is what a player actually reforges for, so
it is the thing worth cataloguing.

The client table is ``EquipmentSpiritualityConvergenceData`` — the feature is
``灵性汇聚`` / "spirituality convergence" internally, which is why searching the
export for ``Reforge`` or ``Grace`` finds nothing. The grace names are not in
that table either: it stores text ids, and the strings live in the shards
alongside the buffs that apply them (``BuffDataNew`` carries 征服宣言 as a buff
name). ``EquipmentSlotData.ConvergenceDefaultIcon`` is the giveaway that
"convergence" is the right table.

Two fields carry the whole mechanic:

``GroupCondition1`` / ``GroupCondition2``
    ``{affixCount: [affixGroupId, ...]}`` — the two stat families the grace is
    built from, and how many extraordinary affixes of each it needs. Both must
    hold, so the grace's extraordinary-affix requirement is the **sum** of the
    two counts. A count of ``0`` is real and means "none of that family".

    The group id pairs are always ``(399172x, 399102x)`` — the same stat's entry
    in ``EquipmentWordInitRandomGroupData`` and in
    ``EquipmentWordRandomGroupData`` — so both tables are read for the name.

That reading is confirmed by the client's own editor labels, which the string
shards still contain: ``恩赐词条-武器-4-3（2+2）`` is exactly the row whose two
conditions are 2 and 2, and every ``<slot>-<n>-<i>`` label has a row summing to
``n``. Nothing here is inferred from the numbers alone.

Field names stay the client's own, per the other gmzz pipelines. In particular
``Brief1``/``Brief2`` are emitted as ``brief1``/``brief2`` rather than as
``effect``/``effectHealing``: for most rows ``Brief2`` is the same effect worded
for a healing build, but on the 指环 2-affix rows it describes something the
row's own ``Prop`` values do not do, so naming it would assert more than the
data supports.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from .common import write_json
from .env import excel_dir, require_dir
from .tables import load_strings, load_table, resolve_text, unresolved_ids
from .version import stamp_version

GRACE_TABLE = "EquipmentSpiritualityConvergenceData"
SLOT_TABLE = "EquipmentSlotData"
#: Affix groups. The same stat appears in both tables under different ids, and a
#: GroupCondition lists both, so a name lookup has to span the pair.
GROUP_TABLES = ("EquipmentWordRandomGroupData", "EquipmentWordInitRandomGroupData")

OUT_SUBDIR = "reforge"
GRACES_FILE = "graces.json"
SLOTS_FILE = "slots.json"

#: ``ShowCondition.RawInput`` — the season day a slot's graces unlock on.
_SEASON_DAY = re.compile(r"^SEASON_DAY\((?P<season>\d+)\)>=(?P<day>\d+)$")
#: ``ShowCondition.RawInput`` — "own one of these equipment ids". Only the
#: five-affix weapon graces use it: the myth equipment those ids name raises the
#: reforge affix cap by one, which is the only way a fifth affix appears.
_EQUIP_GROUP = re.compile(r"^GET_EQUIP_NUM_IN_GROUP\(\{(?P<ids>[\d,]+)\}\)>=(?P<count>\d+)$")


def group_names(excel: Path, strings: dict[str, str]) -> dict[int, str]:
    """Affix-group id -> stat name (``攻击``, ``技能增强``, …)."""
    names: dict[int, str] = {}
    for table in GROUP_TABLES:
        for row in resolve_text(load_table(excel, table), strings).values():
            names[int(row["ID"])] = row["Des"]
    return names


def conditions(value, names: dict[int, str]) -> list[dict]:
    """A ``GroupCondition`` column as ``[{count, groupIds, stat}]``.

    The client writes ``{count: [ids]}``. Lua tables keyed ``1..n`` arrive from
    :func:`gmzz.tables.load_table` as a *list*, so ``[[ids]]`` means count 1 —
    losing that would silently turn every one-affix condition into a zero.
    """
    items = (
        [(index + 1, ids) for index, ids in enumerate(value)]
        if isinstance(value, list)
        else [(int(count), ids) for count, ids in sorted(value.items(), key=lambda kv: int(kv[0]))]
    )
    out = []
    for count, ids in items:
        stats = {names[int(i)] for i in ids if int(i) in names}
        if len(stats) != 1:
            raise RuntimeError(
                f"condition {ids} spans {sorted(stats)} affix stats, expected exactly one — "
                f"has the client started mixing stat families in one group?"
            )
        out.append({"count": count, "groupIds": [int(i) for i in ids], "stat": stats.pop()})
    return out


def unlock(show_condition) -> dict | None:
    """``ShowCondition`` as a small tagged record, or ``None`` when unconditional.

    Both forms in the table are recognised explicitly and anything else raises:
    a condition rendered as "no requirement" because the pipeline did not
    understand it is worse on a wiki than a failed build.
    """
    raw = show_condition.get("RawInput") if isinstance(show_condition, dict) else None
    if not raw:
        return None
    if match := _SEASON_DAY.match(raw):
        return {
            "kind": "seasonDay",
            "seasonId": int(match.group("season")),
            "day": int(match.group("day")),
            "raw": raw,
        }
    if match := _EQUIP_GROUP.match(raw):
        return {
            "kind": "equipment",
            "equipIds": [int(i) for i in match.group("ids").split(",")],
            "count": int(match.group("count")),
            "raw": raw,
        }
    raise RuntimeError(f"unrecognised ShowCondition {raw!r} — add a branch for it rather than dropping it")


def _icon_name(icon: str) -> str:
    """The asset name out of a ``/Game/<dir>/<Name>.<Name>`` object path."""
    return icon.rsplit(".", 1)[-1] if icon else ""


def _props(value) -> list[list]:
    """``Prop1``/``Prop2`` as ``[[statKey, amount]]``; the client uses ``{}`` for none."""
    return [list(pair) for pair in value] if isinstance(value, list) else []


def build(excel: Path, data_out: Path) -> tuple[int, int]:
    strings = load_strings(excel)
    names = group_names(excel, strings)
    rows = resolve_text(load_table(excel, GRACE_TABLE), strings)

    graces = []
    for key in sorted(rows, key=int):
        row = rows[key]
        condition_groups = [
            conditions(row["GroupCondition1"], names),
            conditions(row["GroupCondition2"], names),
        ]
        graces.append({
            "id": row["ID"],
            "slot": row["Slot"],
            "name": row["Name"],
            # Derived, not a column: the sum of both conditions' counts. The
            # client's own editor labels (恩赐词条-<slot>-<n>-<i>) agree with it.
            "extraordinaryCount": sum(c["count"] for group in condition_groups for c in group),
            "conditions": [c for group in condition_groups for c in group],
            "score": row["Score"],
            "tags": list(row["Tag"]),
            "prop1": _props(row.get("Prop1")),
            "prop2": _props(row.get("Prop2")),
            "brief1": row["Brief1"],
            "brief2": row["Brief2"],
            "passiveSkillIds": [int(i) for i in row.get("PassiveSkill1") or []],
            "unlock": unlock(row.get("ShowCondition")),
            "seasonIds": list(row["SeasonID"]),
            "icon": _icon_name(row.get("Icon") or ""),
        })

    missing = unresolved_ids(graces)
    if missing:
        raise RuntimeError(
            f"{GRACE_TABLE}: {len(missing)} text id(s) had no zh-CN string, "
            f"e.g. {sorted(missing)[:3]} — is a StringDB shard missing from the export?"
        )

    # Only the slots that actually have graces, in the reforge screen's own
    # order (`OrderRandom`, the random-affix ordering — `OrderEnhance` is the
    # upgrade screen's and puts 帽子 in a different place).
    used = {grace["slot"] for grace in graces}
    slot_rows = resolve_text(load_table(excel, SLOT_TABLE), strings)
    slot_rows = slot_rows.values() if isinstance(slot_rows, dict) else slot_rows
    slots = sorted(
        (
            {"id": row["ID"], "name": row["Name"], "order": row["OrderRandom"]}
            for row in slot_rows
            if row["ID"] in used
        ),
        key=lambda slot: slot["order"],
    )
    if len(slots) != len(used):
        raise RuntimeError(f"{SLOT_TABLE} has no row for slot(s) {sorted(used - {s['id'] for s in slots})}")

    write_json(Path(data_out) / OUT_SUBDIR / GRACES_FILE, graces)
    write_json(Path(data_out) / OUT_SUBDIR / SLOTS_FILE, slots)
    print(f"reforge: {len(graces)} graces over {len(slots)} slots -> {OUT_SUBDIR}/")
    return len(graces), len(slots)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--excel", type=Path, default=None, help="override the exported Data/Excel dir")
    parser.add_argument("--out", type=Path, default=None, help="override GMZZ_DATA_OUT")
    args = parser.parse_args(argv)

    data_out = args.out or require_dir("GMZZ_DATA_OUT")
    build(args.excel or excel_dir(), data_out)
    stamp_version(data_out)


if __name__ == "__main__":
    main()
