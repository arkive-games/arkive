"""Emit the 封印物 side of the 非凡评分 calculator into ``data-gmzz``.

Run from ``tools/``::

    uv run python -m gmzz.relics

The rating panel's 封印物 group is three of its fourteen items, and each has its
own table:

===================  =========================  ==================================
panel item           source                     shape
===================  =========================  ==================================
封印物装配            ``SealedPromoteData``      grade ladder, ``Mark`` 500/2500/4500/6500
非凡共鸣              ``SealedInfoAttrData``     ``[season][group][affixCount]`` -> ``Mark``
封印物词条            ``XtraMatRandomWordData``  per-affix ``Mark``
===================  =========================  ==================================

**This group's score is fully derivable, unlike the rest of the rating.** It is
still a server property — ``alias.xml``'s ``XTRA_MAT_PROP_INFO`` declares
``mark ... Flags="OWN_CLIENT"`` — but the arithmetic is entirely in the tables,
and it reproduces the game to the digit. For one 攻击物质 the client shows
``评分 1269`` over 攻击 +156 / 破防 +98 / 暴击 +116, and:

- ``Mark = round(statValue * XMatPropWorthData[season][prop].Value)``. The rates
  are per stat (攻击 2.62, 破防 4.15, 暴击 3.83) and are what make Mark a single
  currency across stats.
- The **displayed** stat is ``floor(tableValue * k2)`` and the **item score** is
  ``floor(k2 * sum(Mark))``, where ``k2 = 0.1 + 0.02 * knowledgeLevel`` from
  ``SealedKnowledgeLevelData``. At level 11 (``k2 = 0.32``):
  ``floor(0.32 * (1284 + 1284 + 1400)) = floor(1269.76) = 1269``.

Note the **order**: sum the Marks, then floor once. Flooring each affix and then
summing gives 1268 or 1270. That is emitted as ``scoreRule`` so the page cannot
quietly reimplement it the other way round.

Three naming traps, each of which cost time:

- **Lower grade is better.** ``SealWorstGrade: 3``, ``SealBestGrade: 1``, and
  rows exist down to grade 0. An artifact starts at ``InitialGrade: 3`` and is
  promoted *downward*, so the ladder is emitted with an explicit ``mark`` per
  grade rather than by position.
- **公证书 is an artifact name, not a category.** 攻击封印物 / 防御封印物 /
  特化封印物 are the three *slot* headers, and they correspond to
  ``SealedInfoData.GroupId`` 1 / 2 / 3. The name in the screenshot's attack slot
  happened to be 公证书 (id 2085029).
- **A material's name is computed, not stored.** ``XtraMatNameRuleData`` is an
  ordered rule list (``HasWordType(4,1)``, ``SameWordTypeCount(2,4)``,
  ``Quality(5)``, ``LowQuality()``) evaluated against the roll, so 攻击物质 is
  merely the quality-5 fallback. The rules ship as-is; this pipeline does not
  evaluate them, because doing so needs the roll a player actually has.

Two gaps kept rather than papered over:

- The module keys ``Relics_Basic`` / ``Relics_Main`` / ``Relics_Word`` appear in
  no table and no string. The mapping in the table above is inferred from the
  three ``Mark`` columns' semantics plus the panel labels; it is not backed by a
  join row.
- ``MaxHp_N`` and ``BeSkilledDivi_N``/``SkillMulti_N`` do not obey
  ``Mark = value * worth`` (observed 0.3853 against a worth of 0.32, and 152800
  against 48078.81). Each has a single word row, so a stale worth cannot be told
  from a special case. They are emitted with the worth as shipped.
"""

from __future__ import annotations

import argparse
import collections
import re
from pathlib import Path

from .common import write_json
from .env import excel_dir, require_dir
from .tables import load_strings, load_table, resolve_text, unresolved_ids
from .version import stamp_version

OUT_FILE = "relics/relics.json"

SEALED_TABLE = "SealedInfoData"
ITEM_TABLE = "ItemNewData"
PROMOTE_TABLE = "SealedPromoteData"
RISK_TABLE = "SealedRisk"
RESONANCE_TABLE = "SealedInfoAttrData"
KNOWLEDGE_TABLE = "SealedKnowledgeLevelData"
EXTRA_SLOT_TABLE = "SealedExtraSlotData"
CONST_TABLE = "RelicsConstData"
MAT_TABLE = "XtraMatInfoData"
MAT_TC_TABLE = "XtraMatTCData"
MAT_WORD_TABLE = "XtraMatRandomWordData"
MAT_GROUP_TABLE = "XtraMatRandomGroupData"
WORTH_TABLE = "XMatPropWorthData"

#: `GroupId` on an artifact, and the slot header it sits under.
GROUP_NAMES = {1: "攻击", 2: "防御", 3: "特化"}

#: Sum the Marks, then floor once. Flooring per affix first is off by one.
SCORE_RULE = "floor(k2 * sum(affixMark))"

_TAG = re.compile(r"<[^>]+>")


def _rows(payload) -> list:
    return list(payload.values()) if isinstance(payload, dict) else list(payload)


def _plain(text) -> str:
    return _TAG.sub("", text or "").strip() if isinstance(text, str) else ""


def artifacts(excel: Path, strings: dict) -> list[dict]:
    """The 18 封印物, with their group, starting grade and risk band."""
    # An artifact has no quality of its own; the client shows it through the
    # `ItemNewData` row `DisplayItemID` names, and that row's `quality` picks
    # the rarity plate behind the icon (4, purple, for every one shipped).
    items = load_table(excel, ITEM_TABLE)
    out = []
    for row in _rows(resolve_text(load_table(excel, SEALED_TABLE), strings)):
        group = row.get("GroupId")
        shown = items.get(str(row.get("DisplayItemID"))) or {}
        out.append({
            "id": row["ID"],
            "name": row["Name"],
            "groupId": group,
            "groupName": GROUP_NAMES.get(group),
            # `Tag` is the usage bucket: 1 副本, 2 竞技, 3 通用.
            "tag": row.get("Tag"),
            "initialGrade": row.get("InitialGrade"),
            "quality": shown.get("quality"),
            "icon": row.get("Icon"),
            "description": _plain(row.get("ItemDes")),
            "seasons": list(row.get("SeasonIdList") or []),
        })
    out.sort(key=lambda a: (a["groupId"] or 0, a["id"]))
    return out


def promotion(excel: Path, strings: dict) -> dict:
    """The grade ladder — the 封印物装配 score.

    Uniform across artifacts in every row sampled, so it is emitted once as a
    grade -> mark ladder plus the per-artifact rows it was derived from, and the
    build fails if an artifact ever disagrees.
    """
    by_grade: dict[int, set[int]] = collections.defaultdict(set)
    caps: dict[int, set[str]] = collections.defaultdict(set)
    # Nested: artifact id -> grade -> row.
    for per_artifact in _rows(resolve_text(load_table(excel, PROMOTE_TABLE), strings)):
        for row in _rows(per_artifact):
            grade = row.get("Grade")
            if grade is None:
                continue
            by_grade[grade].add(row.get("Mark"))
            title = _plain(row.get("AttributeImproveTitle"))
            if title:
                caps[grade].add(title)

    ladder = []
    for grade in sorted(by_grade, reverse=True):
        marks = by_grade[grade]
        if len(marks) != 1:
            raise RuntimeError(
                f"{PROMOTE_TABLE} grade {grade} has several Mark values {sorted(marks)} — "
                f"the ladder is per-artifact after all, emit it that way"
            )
        ladder.append({
            "grade": grade,
            "mark": marks.pop(),
            "note": sorted(caps[grade])[0] if caps[grade] else "",
        })
    # Lower grade is better; say so in the data rather than only in the docs.
    return {"ladder": ladder, "bestGrade": min(by_grade), "worstGrade": max(by_grade)}


def risks(excel: Path, strings: dict) -> list[dict]:
    return sorted(
        (
            {
                "id": r.get("RiskID"),
                "level": r.get("RiskLevel"),
                "name": _plain(r.get("RiskLevel")) or _plain(r.get("RiskDescription")),
                "description": _plain(r.get("RiskDescription")),
            }
            for r in _rows(resolve_text(load_table(excel, RISK_TABLE), strings))
        ),
        key=lambda r: r["id"] or 0,
    )


def resonance(excel: Path, strings: dict) -> dict:
    """非凡共鸣 — score by (season, group tier, affix count).

    ``Group`` is ``SealedPromoteData.AttributeImproveType``, i.e. group id and
    grade tier concatenated (101/102/103 = attack at tier 1/2/3). ``Level`` is
    the number of effective affixes, and the ladder plateaus once a grade's cap
    is reached — a 3级 artifact stops paying past 4 affixes.
    """
    out: dict[str, dict[str, list]] = collections.defaultdict(lambda: collections.defaultdict(list))
    # Nested: season -> group -> list of per-affix-count rows.
    for per_season in _rows(resolve_text(load_table(excel, RESONANCE_TABLE), strings)):
        for ladder in _rows(per_season):
            for row in _rows(ladder) if not isinstance(ladder, dict) else [ladder]:
                season = row.get("SeasonID")
                group = row.get("Group")
                if season is None or group is None:
                    continue
                out[str(season)][str(group)].append({
                    "affixCount": row.get("Level"),
                    "mark": row.get("Mark"),
                    # Sorted: a Lua hash's order differs between runs and would
                    # churn the dataset digest for nothing.
                    "stats": [[k, v[0] if isinstance(v, list) else v]
                              for k, v in sorted((row.get("FightProp") or {}).items())],
                })
    for season in out.values():
        for ladder in season.values():
            ladder.sort(key=lambda r: r["affixCount"] or 0)
    return {k: dict(v) for k, v in sorted(out.items())}


def knowledge(excel: Path, strings: dict) -> dict:
    """非凡知识 levels -> the ``k2`` coefficient every relic number scales by."""
    out: dict[str, list] = collections.defaultdict(list)
    # Nested: season -> level -> row.
    for per_season in _rows(resolve_text(load_table(excel, KNOWLEDGE_TABLE), strings)):
        for row in _rows(per_season):
            season = row.get("SeasonID")
            if season is None:
                continue
            out[str(season)].append({
                "level": row.get("Level"),
                "k1": row.get("k1"),
                "k2": row.get("k2"),
                "roleLevelRequired": row.get("RoleLevelConditions"),
            })
    for ladder in out.values():
        ladder.sort(key=lambda r: r["level"] or 0)
    return dict(sorted(out.items()))


def worths(excel: Path, strings: dict) -> dict:
    """Stat -> Mark per point, per season. The exchange rate behind every Mark."""
    raw = load_table(excel, WORTH_TABLE)
    out: dict[str, dict[str, float]] = collections.defaultdict(dict)
    for season_row in _rows(raw):
        if not isinstance(season_row, dict):
            continue
        for entry in season_row.values():
            if not isinstance(entry, dict) or "Prop" not in entry:
                continue
            out[str(entry.get("SeasonID"))][entry["Prop"]] = entry.get("Value")
    return {k: dict(sorted(v.items())) for k, v in sorted(out.items())}


def materials(excel: Path, strings: dict) -> dict:
    """非凡物质 items, their affix-count distribution, and the affix pool."""
    tc = {r["TC"]: r for r in _rows(resolve_text(load_table(excel, MAT_TC_TABLE), strings))}

    items = []
    for row in _rows(resolve_text(load_table(excel, MAT_TABLE), strings)):
        bucket = tc.get(row.get("TC")) or {}
        items.append({
            "id": row["ID"],
            "name": row["Name"],
            # 1 fills 攻击/特化 artifacts, 2 fills 防御/特化.
            "type": row.get("Type"),
            "tc": row.get("TC"),
            "quality": row.get("quality"),
            "icon": row.get("icon"),
            "description": _plain(row.get("itemDes")),
            # Percentage chance of rolling exactly N affixes; each row sums to 100.
            "affixCountWeights": [bucket.get(f"Entry_{n}", 0) for n in range(1, 7)],
            # Selects the affix pool; NOT always equal to `tc`.
            "poolSet": bucket.get("Set"),
        })
    items.sort(key=lambda i: i["id"])

    groups = {
        r["ID"]: {
            "id": r["ID"],
            "name": _plain(r.get("GroupNmae")),
            "types": list(r.get("GroupType") or []),
            "rarity": r.get("Rarity"),
            "maxRepeat": r.get("MaxRepeatTimes"),
            "effect": _plain(r.get("EntryDescription")),
        }
        for r in _rows(resolve_text(load_table(excel, MAT_GROUP_TABLE), strings))
    }

    # pool set -> tag -> [{mark, stat, value}], the ladder a roll draws from
    pool: dict[str, dict[str, list]] = collections.defaultdict(lambda: collections.defaultdict(list))
    for row in _rows(resolve_text(load_table(excel, MAT_WORD_TABLE), strings)):
        prop = row.get("FightProp") or {}
        if not isinstance(prop, dict) or len(prop) != 1:
            continue
        (stat, amount), = prop.items()
        # `[[0, 490], "k2"]` — the value, and the coefficient it scales by.
        value = None
        if isinstance(amount, list) and amount and isinstance(amount[0], list) and len(amount[0]) == 2:
            value = amount[0][1]
        elif isinstance(amount, list) and amount and isinstance(amount[0], (int, float)):
            value = amount[0]
        if value is None:
            continue
        tags = row.get("Tag") or []
        for group_id in row.get("Groups") or []:
            for pool_set in row.get("Set") or []:
                pool[str(pool_set)][str(tags[0] if tags else 0)].append({
                    "id": row["ID"],
                    "mark": row["Mark"],
                    "stat": stat,
                    "value": value,
                    "groupId": group_id,
                    "saturation": row.get("Saturation"),
                })
    for sets in pool.values():
        for ladder in sets.values():
            ladder.sort(key=lambda r: (r["stat"], -(r["mark"] or 0)))

    return {
        "items": items,
        "groups": dict(sorted(groups.items())),
        "affixPool": {k: dict(v) for k, v in sorted(pool.items())},
    }


def constants(excel: Path, strings: dict) -> dict:
    """The handful of ``RelicsConstData`` values the page needs."""
    flat = resolve_text(load_table(excel, CONST_TABLE), strings)
    if not isinstance(flat, dict):
        raise RuntimeError(f"{CONST_TABLE} is a {type(flat).__name__}, expected a flat dict of constants")
    wanted = (
        "XMatMinWordNum", "XMatMaxWordNum", "SealWorstGrade", "SealBestGrade",
        "EffectedMaxXMatPropNum", "MainAttributeTipsEntryNumber",
        "SealEffectBestGradeAtLocalServer", "SealEffectBestGradeAtCrossServer",
    )
    return {k: flat[k] for k in wanted if k in flat}


def build(excel: Path, data_out: Path) -> dict[str, int]:
    strings = load_strings(excel)

    payload = {
        "artifacts": artifacts(excel, strings),
        "promotion": promotion(excel, strings),
        "risks": risks(excel, strings),
        "resonance": resonance(excel, strings),
        "knowledge": knowledge(excel, strings),
        "worths": worths(excel, strings),
        "materials": materials(excel, strings),
        "constants": constants(excel, strings),
        "groupNames": {str(k): v for k, v in GROUP_NAMES.items()},
        # Emitted so the page cannot reimplement the rounding the other way.
        "scoreRule": SCORE_RULE,
    }
    missing = unresolved_ids(payload)
    if missing:
        raise RuntimeError(f"{len(missing)} text id(s) unresolved, e.g. {sorted(missing)[:3]}")

    write_json(Path(data_out) / OUT_FILE, payload)
    counts = {
        "artifacts": len(payload["artifacts"]),
        "gradeLadder": len(payload["promotion"]["ladder"]),
        "risks": len(payload["risks"]),
        "resonanceSeasons": len(payload["resonance"]),
        "knowledgeSeasons": len(payload["knowledge"]),
        "worthSeasons": len(payload["worths"]),
        "materials": len(payload["materials"]["items"]),
        "affixPools": len(payload["materials"]["affixPool"]),
    }
    print(f"relics: {counts} -> {OUT_FILE}")
    return counts


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--excel", type=Path, default=None)
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args(argv)

    data_out = args.out or require_dir("GMZZ_DATA_OUT")
    build(args.excel or excel_dir(), data_out)
    stamp_version(data_out)


if __name__ == "__main__":
    main()
