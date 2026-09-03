"""Emit the equipment side of the 非凡评分 calculator into ``data-gmzz``.

Run from ``tools/``::

    uv run python -m gmzz.equipment

The rating panel's 装备 group is four of its fourteen items — 装备基础, 装备词条,
装备强化, 套装效果 — and all four are properties of the same eight worn pieces.
This emits what the page needs to model a piece: the items themselves, the
enhancement ladder, the suit tiers, the reforge affix pool, and the 烙印.

**Unlike the rest of the rating data, three of these four parts have a score in
the client.** `非凡评分` itself is server-side (see `gmzz.score`), but the
per-part *contribution* turns out to be a plain sum of `Mark` columns, and that
is checkable against the game:

- `EquipmentGrowBodyEnhanceData` gives every stage `Mark: 80`, and a +3 weapon
  in game reads `评分 5915(+240)` — exactly 3 x 80.
- The same weapon's enhancement stats read `攻击 +60, 最大生命 +258`, and
  `EquipmentGrowEnhancePropData` gives its body `AtkMin/AtkMax +20, MaxHp +86`
  per stage — exactly 3 x each.
- `EquipmentWordRandomWordData.Mark` is a normalized cross-stat value score
  (1000 Mark buys 攻击 382 or 技能增强 80), negative on 污染 affixes.
- `ItemNewData` carries `Mark` per item, and the weapon 无形之编排's is 2430 —
  the exact 基础 figure on its card.

That agreement is why `Mark` is emitted as the score input it appears to be.
What is *not* claimed: that the item's total 评分 equals the sum of these. The
game decomposes that weapon as 基础 2430 + 强化 240 + 重塑 3485, and while the
first two reproduce exactly, the 重塑 3485 does **not** fall out of the affix
Marks plus the grace's own `Score` — three 非凡 攻击 affixes cannot sum below
1650 and the grace is 2000, which overshoots. So the reforge contribution is
shown as its parts (affix Mark total, grace score) and left editable rather than
asserted, and the boots' 基础 is 119 short of their card. Both gaps are real and
neither is papered over.

Joins worth writing down, because none are guessable:

- **`ItemNewData` is the equipment table.** `EquipmentData` loads with zero rows.
  An item's `subType` is an `EquipmentTypeData` **ID**, which carries the slot
  and that slot's base-stat keys — so `subType` is the only bridge from an item
  to its slot.
- **`EquipmentUniqueData` is the 烙印** (a named special effect: 好孩子,
  与我同行, 罗塞尔护符). An item's `UniqueID` is the brand it wears; the brand's
  own `productItemId` is **not** the reverse link but the item the brand's
  wearer upgrades into (烙印 10032 on the 35装等 温暖的皮靴 points at the 62装等
  one). The fields are named `Suit*` but have nothing to do with suits.
- **`ItemNewData` ships gear the game has not released.** Two shapes, both
  dropped: rows with an empty `ShowCondition` (`Order 999`, names like 武器橙75
  and 测试S4装备) are slot placeholders the client never lists; rows wearing a
  烙印 whose effect reads 该效果已被隐秘 are next season's copies of live items
  (TC 64–69 猩红之啸, `pvp烙印66`, 罗塞尔装备). Neither can be equipped, so
  neither belongs in a picker. Day-gated rows (`ShowCondition [101, 29]`) are
  scheduled season content and are kept.
- **Enhancement is keyed by "body", not slot.** `EquipmentGrowBodyConfigData`
  maps a body id to its slot and season; `EquipmentGrowEnhancePropData` and
  `EquipmentGrowBodyEnhanceData` are keyed by that same body id. One slot has
  several bodies, one per season, so the season has to be carried through or the
  page silently mixes ladders from different seasons.
- **Affix tier is the group id's tail**: 01–12 普通, 21–32 非凡, 41–52 污染,
  61–63 the 途径/怪物专攻 specials. The 400→550 Mark gap is the 普通/非凡 border.
  `Set 4` is the current gear tier; Sets 1–3 are legacy and cap at Mark 114.
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

OUT_FILE = "equipment/equipment.json"

SLOT_TABLE = "EquipmentSlotData"
TYPE_TABLE = "EquipmentTypeData"
ITEM_TABLE = "ItemNewData"
BRAND_TABLE = "EquipmentUniqueData"
BODY_TABLE = "EquipmentGrowBodyConfigData"
STAGE_TABLE = "EquipmentGrowBodyEnhanceData"
STAGE_PROP_TABLE = "EquipmentGrowEnhancePropData"
SUIT_TIER_TABLE = "EquipmentGrowBodySuitData"
SUIT_TABLE = "EquipmentSuitData"
FORMULA_TABLE = "FormulaData"
PROFESSION_TABLE = "TransferPathProfessionData"
WORD_TABLE = "EquipmentWordRandomWordData"
GROUP_TABLES = ("EquipmentWordRandomGroupData", "EquipmentWordInitRandomGroupData")

#: The score a suit's piece-count effect is worth, by the effect's level (1 = two
#: pieces, 2 = three) — ``FormulaData`` rows of the shape ``return 201*($1 -49)``,
#: where ``$1`` is the gear level the effect runs at.
SUIT_SCORE_FORMULAS = {1: "EQUIP_SUIT_LEVEL_SCORE_1", 2: "EQUIP_SUIT_LEVEL_SCORE_2"}
_LINEAR_FORMULA = re.compile(r"^\s*return\s+(?P<slope>\d+(?:\.\d+)?)\s*\*\s*\(\s*\$1\s*-\s*(?P<origin>\d+)\s*\)\s*$")

#: The gear tier the current season rolls. Sets 1-3 are legacy ladders.
CURRENT_SET = 4
#: Affix tier by the group id's last two digits.
TIER_BY_TAIL = [(1, 12, "normal"), (21, 32, "extraordinary"), (41, 52, "contaminated"), (61, 63, "special")]
#: Effect texts a 烙印 row carries before it is written: the designer's stand-in
#: (描述文本N) and the client's "hidden for now" notice on unreleased gear.
UNWRITTEN_EFFECTS = ("描述文本", "该效果已被隐秘")

_TAG = re.compile(r"<[^>]+>")


def _rows(payload) -> list:
    return list(payload.values()) if isinstance(payload, dict) else list(payload)


def _plain(text: str) -> str:
    """Client markup stripped — `<Mark>250</>` reads as 250."""
    return _TAG.sub("", text or "").strip()


def tier_of(group_id: int) -> str:
    tail = group_id % 100
    for low, high, name in TIER_BY_TAIL:
        if low <= tail <= high:
            return name
    raise RuntimeError(f"affix group {group_id} has tail {tail}, which is in no known tier band")


def slots(excel: Path, strings: dict) -> list[dict]:
    """The 12 slots, in the reforge screen's order."""
    return sorted(
        (
            {"id": r["ID"], "name": r["Name"], "order": r["OrderRandom"], "seasons": list(r["Season"])}
            for r in _rows(resolve_text(load_table(excel, SLOT_TABLE), strings))
        ),
        key=lambda s: s["order"],
    )


def types(excel: Path, strings: dict) -> list[dict]:
    """Equipment subtypes. An item's ``subType`` is one of these ids.

    ``BasicPropName`` names the stat keys that are this subtype's base stats and
    ``BasicPropAppear`` their display labels — but the two are **not** the same
    length: a weapon has 5 keys against 4 labels, because ``AtkMin_N`` and
    ``AtkMax_N`` share the label 攻击 and render as one ``min~max`` row. So they
    are emitted as they come and the page pairs them, rather than being zipped
    here into a mapping that would be wrong for every weapon.
    """
    return sorted(
        (
            {
                "id": r["ID"],
                "name": r.get("TypeName"),
                "slot": r["EquipSlot"],
                "baseStatKeys": list(r.get("BasicPropName") or []),
                "baseStatLabels": list(r.get("BasicPropAppear") or []),
                # Class ids this subtype is restricted to; empty means unrestricted.
                "classLimit": [int(c) for c in (r.get("ClassLimit") or [])],
            }
            for r in _rows(resolve_text(load_table(excel, TYPE_TABLE), strings))
        ),
        key=lambda t: t["id"],
    )


def professions(excel: Path, strings: dict, type_rows: list[dict]) -> list[dict]:
    """The seven playable pathways, and which weapon subtype each one uses.

    A weapon subtype is locked to exactly one class by
    ``EquipmentTypeData.ClassLimit``, so the weapon list a player can actually
    equip is a sixth of the whole — 462 items across the eight slots is
    unusable in one picker without this filter.

    ``ClassLimit`` is the only link, and it points the other way (subtype ->
    class), so the mapping is inverted here rather than left to the page.
    Subtype 300 (the generic 武器) has no ``ClassLimit`` and belongs to nobody;
    class 1200004 (审判者途径) has no weapon subtype at all in this build. Both
    are emitted as they are rather than smoothed over.
    """
    weapons: dict[int, list[int]] = collections.defaultdict(list)
    for subtype in type_rows:
        for class_id in subtype.get("classLimit") or []:
            weapons[int(class_id)].append(subtype["id"])

    out = []
    for row in _rows(resolve_text(load_table(excel, PROFESSION_TABLE), strings)):
        out.append({
            "id": row["ID"],
            # `Name` is the pathway (太阳途径); `SequenceName` is the class the
            # player picks at creation (歌颂者). Both are shown.
            "name": row.get("Name"),
            "sequenceName": row.get("SequenceName"),
            "description": _plain(row.get("ProfessionDesc")),
            "disabled": bool(row.get("Disabled")),
            "weaponTypeIds": sorted(weapons.get(row["ID"], [])),
        })
    out.sort(key=lambda p: p["id"])
    return out


def items(
    excel: Path, strings: dict, types_by_id: dict[int, dict], unwritten_brands: set[int],
) -> list[dict]:
    """Equipment items out of ``ItemNewData``, joined to their slot via subType.

    The base stat values are **stored on the item row itself**, under keys named
    exactly by its subtype's ``BasicPropName`` — so an item carries e.g.
    ``AtkMin_N: 327, AtkMax_N: 607, MaxHp_N: 1960``. Nothing is computed: a
    62装等 weapon's numbers are literals, and `EquipmentData` (the table one
    would reach for) has zero rows.

    ``Mark`` on the row is the item's 装备基础 score. Verified: the weapon
    无形之编排 carries ``Mark: 2430`` and its card reads ``评分 2430+3725``. It is
    emitted as ``baseScore`` and the page treats it as a default rather than a
    fact, because the boots 温暖的皮靴 carry 2685 against a card reading 2804 —
    a 119 gap this pipeline cannot yet explain.

    Two kinds of row are gear the game has not released and are dropped: an
    empty ``ShowCondition`` marks the slot placeholders the client never lists
    (武器橙75, 测试S4装备 — ``Order 999``), and a ``UniqueID`` in
    ``unwritten_brands`` marks an item wearing a 烙印 the client still hides,
    which is how next season's copies of live items ship (TC 64–69 猩红之啸,
    ``pvp烙印66``, 罗塞尔装备). A day-gated ``ShowCondition`` is kept: that is
    scheduled content, not a test row.
    """
    out = []
    for row in _rows(resolve_text(load_table(excel, ITEM_TABLE), strings)):
        sub = row.get("subType")
        subtype = types_by_id.get(sub)
        if subtype is None:
            continue
        if not row.get("ShowCondition"):
            continue
        brand_id = row.get("UniqueID") or None
        if brand_id in unwritten_brands:
            continue
        # Zero-valued base props exist on every row and the game hides them.
        stats = [[key, row[key]] for key in subtype["baseStatKeys"] if row.get(key)]
        out.append({
            "id": row["ID"],
            "name": row["itemName"],
            "typeId": sub,
            "slot": subtype["slot"],
            "quality": row["quality"],
            "icon": row["icon"],
            # `TC` is the 装等 shown on the card; `lvReq` is the character gate.
            "gearLevel": row.get("TC"),
            "levelRequirement": row.get("lvReq"),
            "baseStats": stats,
            "baseScore": row.get("Mark"),
            "suitId": row.get("SuitID") or None,
            "setId": row.get("SetId"),
            # The 烙印 this item wears, an `EquipmentUniqueData` id.
            "brandId": brand_id,
            "flavour": _plain(row.get("itemDes") or ""),
        })
    out.sort(key=lambda i: i["id"])
    return out


def _unwritten(effect: str) -> bool:
    return not effect or any(marker in effect for marker in UNWRITTEN_EFFECTS)


def unwritten_brands(excel: Path, strings: dict) -> set[int]:
    """Ids of 烙印 rows whose effect the client will not show.

    Both the designer's ``描述文本N`` stand-in and the 该效果已被隐秘 notice mean
    the brand — and so any item wearing it — is not live. Kept separate from
    :func:`brands` because ``items`` needs the *dropped* set, and the other
    reason a brand is dropped (a ``2`` second-state variant) says nothing about
    the item.
    """
    return {
        row["ID"]
        for row in _rows(resolve_text(load_table(excel, BRAND_TABLE), strings))
        if _unwritten(_plain(row.get("SuitBrief1") or ""))
    }


def brands(excel: Path, strings: dict) -> list[dict]:
    """烙印 — a named special effect. Items point at it via their ``brandId``.

    The columns are named ``Suit*`` and are not suits. Rows whose name ends in
    ``2`` are the client's second-state variants and rows whose effect is
    unwritten (see :func:`unwritten_brands`) are not live, so both are dropped
    rather than shipped as real effects.
    """
    out = []
    for row in _rows(resolve_text(load_table(excel, BRAND_TABLE), strings)):
        name = row.get("SuitName1") or ""
        effect = _plain(row.get("SuitBrief1") or "")
        if not name or name.endswith("2") or _unwritten(effect):
            continue
        out.append({
            "id": row["ID"],
            "name": name,
            "effect": effect,
            "story": row.get("SuitStory") or "",
            # The item this brand's wearer upgrades into (温暖的皮靴 35 -> 62装等),
            # present on the handful of craftable brands. Not the wearer itself.
            "productItemId": row.get("productItemId"),
        })
    out.sort(key=lambda b: b["id"])
    return out


def enhancement(excel: Path, strings: dict) -> dict:
    """The 强化 ladder, per body (a slot within one season).

    Keyed by body rather than slot on purpose: a slot has one body per season and
    they are not interchangeable.
    """
    bodies = {r["ID"]: r for r in _rows(resolve_text(load_table(excel, BODY_TABLE), strings))}
    stages = resolve_text(load_table(excel, STAGE_TABLE), strings)
    props = {r["ID"]: r for r in _rows(resolve_text(load_table(excel, STAGE_PROP_TABLE), strings))}

    out = []
    for key, ladder in stages.items():
        body_id = int(key)
        body = bodies.get(body_id)
        if body is None:
            raise RuntimeError(f"{STAGE_TABLE} has body {body_id}, absent from {BODY_TABLE}")
        prop = props.get(body_id) or {}
        rungs = []
        for stage in sorted(ladder, key=lambda s: s["StageID"]):
            n = stage["StageID"]
            rungs.append({
                "stage": n,
                # The score this stage contributes. Verified: 3 stages = 240 in game.
                "mark": stage["Mark"],
                # `[statKey, ?, amount]` — the middle field is 0 on every row.
                "stats": [[k, v] for k, _mid, v in (prop.get(f"Prop{n}") or [])],
                "consume": list(stage.get("Consume") or []),
                "firstConsume": list(stage.get("FirstConsume") or []),
            })
        out.append({
            "bodyId": body_id,
            "slot": (body.get("Slot") or [None])[0],
            "season": body.get("Season"),
            "year": body.get("Year"),
            "stages": rungs,
        })
    out.sort(key=lambda b: (b["slot"] or 0, b["season"] or 0))

    marks = {r["mark"] for b in out for r in b["stages"]}
    return {"bodies": out, "markPerStage": sorted(marks), "maxStage": max(len(b["stages"]) for b in out)}


def suits(excel: Path, strings: dict) -> dict:
    """The two suits, and the Mark ladder their tiers are worth."""
    named = [
        {
            "id": r["ID"],
            "name": r["SuitName"],
            "fullName": r["SuitNameAll"],
            "tag": r.get("SuitTag"),
            "pieceCounts": list(r.get("BeSuitNum") or []),
            "effect2": _plain(r.get("SuitDesc1") or ""),
            "effect3": _plain(r.get("SuitDesc2") or ""),
        }
        for r in _rows(resolve_text(load_table(excel, SUIT_TABLE), strings))
    ]
    named.sort(key=lambda s: s["id"])

    tiers = []
    seen = set()
    for r in _rows(resolve_text(load_table(excel, SUIT_TIER_TABLE), strings)):
        key = (r.get("Type"), r.get("Level"), r.get("Mark"))
        if key in seen:
            continue
        seen.add(key)
        tiers.append({
            "type": r.get("Type"),
            "level": r.get("Level"),
            "mark": r.get("Mark"),
            # Type 1 gates on every piece (RequirePromote of them) being at
            # RequireLevel or above — the "whole body +3" bonus; type 2 on the
            # average enhancement percentage across pieces.
            "requiredStage": r.get("RequireLevel") or None,
            "requiredPieces": r.get("RequirePromote") or None,
            "requiredAveragePercent": r.get("RequireAvgPercent"),
            "stats": [[k, v] for k, v in (r.get("SuitProp") or {}).items()],
            "effect": _plain(r.get("SuitAdditionDesc") or ""),
        })
    tiers.sort(key=lambda t: (t["type"] or 0, t["level"] or 0))
    return {"suits": named, "tiers": tiers, "levelScores": suit_level_scores(excel)}


def suit_level_scores(excel: Path) -> dict:
    """The score a suit effect earns at a gear level, per effect level.

    Read off ``FormulaData`` rather than typed in: the rows are one line each,
    ``return 201*($1 -49)``, and the two numbers are what the page needs. A
    formula of any other shape raises, so a redesign shows up as a failed build
    rather than a page quietly scoring suits by a stale line.
    """
    by_name = {r["Name"]: r["Formula"] for r in _rows(load_table(excel, FORMULA_TABLE))}
    out = {}
    for level, name in SUIT_SCORE_FORMULAS.items():
        body = by_name.get(name)
        if body is None:
            raise RuntimeError(f"{FORMULA_TABLE} has no row named {name}")
        match = _LINEAR_FORMULA.match(body.replace("\n", " "))
        if not match:
            raise RuntimeError(f"{name} is not of the shape 'return A*($1 -B)': {body!r}")
        out[str(level)] = {"perLevel": float(match.group("slope")), "origin": int(match.group("origin"))}
    return out


def affixes(excel: Path, strings: dict) -> dict:
    """The reforge affix pool, per slot, per tier, as a Mark ladder.

    A slot's pool is the groups whose ``Type<slot>_<subtype>`` flag is set. Only
    the current gear tier is emitted; every value is the stat a word grants at
    that Mark.
    """
    groups = {}
    for table in GROUP_TABLES:
        for row in _rows(resolve_text(load_table(excel, table), strings)):
            groups[row["ID"]] = row

    per_slot: dict[int, set[int]] = collections.defaultdict(set)
    for gid, group in groups.items():
        for field, on in group.items():
            match = re.match(r"^Type(\d+)_(\d+)$", field)
            if match and on:
                per_slot[int(match.group(1))].add(gid)

    words = _rows(resolve_text(load_table(excel, WORD_TABLE), strings))
    # slot -> tier -> family -> {mark: value}
    pool: dict = collections.defaultdict(lambda: collections.defaultdict(lambda: collections.defaultdict(dict)))
    stat_keys: dict[str, str] = {}
    for word in words:
        if CURRENT_SET not in (word.get("Set") or []):
            continue
        prop = word.get("FightProp") or {}
        if not isinstance(prop, dict) or len(prop) != 1:
            continue
        (stat, amount), = prop.items()
        if not (isinstance(amount, list) and amount and isinstance(amount[0], (int, float))):
            continue
        for gid in word.get("Groups") or []:
            group = groups.get(gid)
            if group is None:
                continue
            family = group["Des"]
            stat_keys[family] = stat
            for slot, gids in per_slot.items():
                if gid in gids:
                    pool[slot][tier_of(gid)][family][word["Mark"]] = amount[0]

    # Each ladder is a LIST of [mark, value], richest first — not a mark-keyed
    # object. `write_json` sorts keys, and sorted stringified numbers put "1000"
    # before "550", which would hand the page a ladder in nonsense order.
    return {
        "statKeyByFamily": dict(sorted(stat_keys.items())),
        "set": CURRENT_SET,
        "bySlot": {
            str(slot): {
                tier: {family: [[m, v] for m, v in sorted(ladder.items(), reverse=True)]
                       for family, ladder in sorted(fams.items())}
                for tier, fams in sorted(tiers.items())
            }
            for slot, tiers in sorted(pool.items())
        },
    }


def build(excel: Path, data_out: Path) -> dict[str, int]:
    strings = load_strings(excel)

    slot_rows = slots(excel, strings)
    type_rows = types(excel, strings)
    types_by_id = {t["id"]: t for t in type_rows}
    profession_rows = professions(excel, strings, type_rows)
    item_rows = items(excel, strings, types_by_id, unwritten_brands(excel, strings))
    brand_rows = brands(excel, strings)
    enhance = enhancement(excel, strings)
    suit = suits(excel, strings)
    affix = affixes(excel, strings)

    payload = {
        "slots": slot_rows,
        "types": type_rows,
        "professions": profession_rows,
        "items": item_rows,
        "brands": brand_rows,
        "enhancement": enhance,
        "suits": suit,
        "affixes": affix,
    }
    missing = unresolved_ids(payload)
    if missing:
        raise RuntimeError(
            f"{len(missing)} text id(s) had no zh-CN string, e.g. {sorted(missing)[:3]}"
        )

    write_json(Path(data_out) / OUT_FILE, payload)
    counts = {
        "slots": len(slot_rows), "types": len(type_rows), "items": len(item_rows),
        "professions": len(profession_rows),
        "brands": len(brand_rows), "bodies": len(enhance["bodies"]),
        "suits": len(suit["suits"]), "suitTiers": len(suit["tiers"]),
        "affixSlots": len(affix["bySlot"]),
    }
    print(f"equipment: {counts} -> {OUT_FILE}")
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
