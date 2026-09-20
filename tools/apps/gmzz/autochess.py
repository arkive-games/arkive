"""Emit the Fool's Gambit (愚者棋局) auto-battler dataset.

Run from ``tools/``::

    uex export --profile gmzz --only C7/Content/Arts/UI_2/Resource/ConfigIcon/AutoChess/Property
    uv run python -m gmzz.autochess

The mode is ``AutoChess`` internally — 自走棋 — so nothing in the export answers
to 愚者棋局 or its English name. The client's own in-game help calls it
「8位棋手同台博弈的自走棋玩法」, and the string shards carry no 愚者棋盘 at all:
the player-facing name is 棋局, not 棋盘.

Three things here are load-bearing and were each wrong in an earlier draft:

**The mode has its own attribute id space.** ``AutoChessChessAttributeData`` is
the table that names 2010/2028/2297; the global ``FightPropData`` also has rows
under those ids, and joining against it "succeeds" for every one of them while
turning a 5-cost's 146 攻击 into 「获得护盾增幅 146」 and its 33 防御 into
「最大物理攻击 33」. Nothing errors. Only the values look wrong, and only if you
know what they should be. Join against the mode's own table.

**A value is not renderable without its format.** ``DataFormat`` carries the
client's own rendering — ``*100|%d%%`` means 暴击伤害 1.5 is shown as 150%. The
format ships with the attribute so the page never has to guess which numbers are
ratios.

**Summons and pickups are not pieces.** ``ChessBaseData`` holds 68 rows, and 15
of them carry ``SummonMonster = 1``: the five trial bosses, five summons, and
five equipment caskets. The client states their status itself, in their own
``PositionDesc`` — 「不参与商店、掉落、选秀与共鸣统计」 — so this is the game's
classification rather than a guess of ours. Dropping them leaves exactly the 53
the in-game help claims, every one with a star list and a bond, which is why
:data:`PIECE_COUNT` is asserted: a silent 52 or 54 after a patch means this rule
stopped matching the game, and a wiki quietly missing a piece is worse than a
build that stops.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from PIL import Image

from .common import write_json
from .env import excel_dir, require_dir
from .tables import load_strings, load_table, resolve_text, unresolved_ids
from .version import stamp_version

#: The live mode. Every table carries it, and `TurnData` also holds a 99999
#: variant that is not the shipped ladder.
GAMEPLAY_ID = 1

#: Asserted, not assumed — see the module docstring.
PIECE_COUNT = 53
BOND_COUNT = 28

#: The three bond families, keyed by the ``Priority`` band that carries them.
#:
#: The split is **not** in ``Type``: that field is 1 on twenty-seven of the
#: twenty-eight rows (only 非凡世界 is 2), so grouping by it yields 27/1 and a
#: page that claims one 组织共鸣 exists. ``Priority`` is what separates them —
#: 100 for the ten 职业, 200–201 for the ten 组织 (荒野怪物 sits at 201), 206 for
#: the eight 特殊 — and the resulting 10/10/8 is exactly what the client's own
#: in-game help text enumerates, name for name. :data:`BOND_GROUP_COUNTS` holds
#: that claim so a patch that moves a bond between bands fails the build.
BOND_GROUPS = ((100, 100, "role"), (200, 205, "faction"), (206, 206, "special"))
BOND_GROUP_COUNTS = {"role": 10, "faction": 10, "special": 8}

OUT_DIR = "autochess"
ICON_SUBDIR = "autochess"
PROPERTY_ICON_DIR = "C7/Content/Arts/UI_2/Resource/ConfigIcon/AutoChess/Property"
WEBP_QUALITY = 90

_OBJECT_PATH = re.compile(r"^/Game/(?P<path>.+?)\.(?P<name>[^.]+)$")


def _rows(table) -> list:
    """The rows of a table, whether the client keyed it or listed it."""
    return list(table.values()) if isinstance(table, dict) else list(table)


def _of_this_mode(rows: list) -> list:
    """Only the live mode's rows; rows with no mode field belong to it too."""
    return [r for r in rows if r.get("ACGameplayId", GAMEPLAY_ID) == GAMEPLAY_ID]


def _list(value) -> list:
    """A client list field, normalised.

    LuaJIT writes an empty table for "none", which arrives as ``{}`` rather than
    ``[]`` — read as a list it is falsy either way, but the type would leak into
    the JSON and the page's type would be a lie.
    """
    return list(value) if isinstance(value, list) else []


def _pairs(value) -> list[dict]:
    """``[[attrId, amount], ...]`` as records, for the attribute join."""
    out = []
    for pair in _list(value):
        if not isinstance(pair, list) or len(pair) != 2:
            raise ValueError(f"expected an [attributeId, value] pair, got {pair!r}")
        out.append({"attributeId": int(pair[0]), "value": pair[1]})
    return out


def build_attributes(tables: dict) -> list[dict]:
    rows = tables["ChessAttribute"]
    return sorted(
        (
            {
                "id": int(row["Id"]),
                "prop": row["Prop"],
                "name": row["Desc"],
                # The client's own rendering. `*100|%d%%` means the stored 1.5
                # is shown as 150%; without it the page would have to guess
                # which attributes are ratios.
                "format": row["DataFormat"],
                "onDetail": bool(row.get("IsOnDetail")),
                "onExtraPanel": bool(row.get("IsOnExtraPanel")),
                "icon": _icon_name(row.get("IconPath")),
            }
            for row in _rows(rows)
        ),
        key=lambda row: row["id"],
    )


def _icon_name(object_path: str | None) -> str:
    match = _OBJECT_PATH.match(object_path or "")
    return match.group("name") if match else ""


def build_pieces(tables: dict) -> list[dict]:
    base = _of_this_mode(_rows(tables["ChessBase"]))
    chess = {int(row["Id"]): row for row in _rows(tables["Chess"])}
    props = tables["ChessStaticProp"]

    pieces = []
    for row in base:
        # The client's own marker for "not a piece" — see the module docstring.
        if row.get("SummonMonster") == 1:
            continue
        stars = []
        for chess_id in _list(row["StarChessIdList"]):
            star = chess.get(int(chess_id))
            if star is None:
                raise RuntimeError(
                    f"piece {row['BaseId']} ({row['ChessName']}): "
                    f"StarChessIdList names {chess_id}, absent from AutoChessChessData"
                )
            prop = props.get(str(int(chess_id)))
            if prop is None:
                raise RuntimeError(
                    f"piece {row['BaseId']} ({row['ChessName']}): "
                    f"no AutoChessChessStaticPropData row for star {chess_id}"
                )
            stars.append({
                "chessId": int(star["Id"]),
                "starLevel": star["StarLevel"],
                "attackRange": star["AttackRange"],
                "maxMp": star["MaxMp"],
                "initialMp": star["InitalMp"],  # client's spelling
                "recoverMp": star["RecoverMp"],
                "normalAttackRecoverMp": star["NormalAttackRecoverMp"],
                "lostHpRecoverMp": star["LostHpRecoverMp"],
                "skill": {
                    "name": star["MpSkillName"],
                    "description": star["MpSkillDesc"],
                    "valueDescription": star.get("MpSkillValueDesc", ""),
                },
                "attributes": _pairs(prop["AttributeList"]),
            })
        stars.sort(key=lambda star: star["starLevel"])
        pieces.append({
            "baseId": int(row["BaseId"]),
            "name": row["ChessName"],
            "cost": row["Cost"],
            # `Tag` is the combat role (近战战士, 远程法师, …); `TagColor` is the
            # swatch the client pairs with it.
            "role": row["Tag"],
            "roleColor": row["TagColor"],
            "bondIds": [int(b) for b in _list(row["BondList"])],
            "positionDescription": row["PositionDesc"],
            "positionSuggestion": row.get("PosSuggest", ""),
            # One icon per piece, not per star. Blanked later for the 44 that
            # name a file under Skill/AutoChess, which does not mount.
            "skillIcon": _icon_name(row.get("SkillIcon")),
            "stars": stars,
        })

    if len(pieces) != PIECE_COUNT:
        raise RuntimeError(
            f"expected {PIECE_COUNT} pieces after dropping SummonMonster rows, got {len(pieces)}: "
            "the client's classification changed — re-read AutoChessChessBaseData before shipping"
        )
    return sorted(pieces, key=lambda piece: (piece["cost"], piece["baseId"]))


def build_bonds(tables: dict) -> list[dict]:
    effects = tables["BondEffect"]
    bonds = []
    for row in _of_this_mode(_rows(tables["Bond"])):
        bond_id = int(row["Id"])
        tiers = sorted(
            (
                {
                    "activateNum": tier["ActivateNum"],
                    "rarity": tier["Rarity"],
                    "description": tier["EffectDesc"],
                }
                for tier in _rows(effects.get(str(bond_id), []))
            ),
            key=lambda tier: tier["activateNum"],
        )
        if not tiers:
            raise RuntimeError(f"bond {bond_id} ({row['BondName']}) has no tier in AutoChessBondEffectData")
        bonds.append({
            "id": bond_id,
            "name": row["BondName"],
            "description": row["BondDesc"],
            "group": _bond_group(row["Priority"], row["BondName"]),
            # Emitted as the client's own field, unlabelled: it is 1 everywhere
            # except 非凡世界, and nothing in the export says what it selects.
            "type": row["Type"],
            "priority": row["Priority"],
            "tiers": tiers,
        })

    if len(bonds) != BOND_COUNT:
        raise RuntimeError(
            f"expected {BOND_COUNT} bonds, got {len(bonds)}: the in-game help says 28 共鸣, "
            "so a different number means the aggregation or the game changed"
        )
    counts = {group: 0 for group in BOND_GROUP_COUNTS}
    for bond in bonds:
        counts[bond["group"]] += 1
    if counts != BOND_GROUP_COUNTS:
        raise RuntimeError(
            f"bond families are {counts}, expected {BOND_GROUP_COUNTS} — the in-game help "
            "enumerates 10 职业, 10 组织 and 8 特殊 by name, so the Priority bands moved"
        )
    return sorted(bonds, key=lambda bond: (bond["priority"], bond["id"]))


def _bond_group(priority: int, name: str) -> str:
    for low, high, group in BOND_GROUPS:
        if low <= priority <= high:
            return group
    raise RuntimeError(
        f"bond {name}: Priority {priority} is in no known band {BOND_GROUPS} — "
        "a new bond family would need its own group before the page can show it"
    )


#: ``UseType`` 2 is a casket (随机基础装备, 精良装备宝匣, …): a consumable that opens
#: into a choice, not a thing a piece wears. Its ``EquipTagDesc`` is the one that
#: is *not* a list of attributes — every casket carries the same ``[[1, 20]]``,
#: and 1 is no attribute id. What that pair means is not recoverable from the
#: tables, so it is dropped rather than published under an invented name, and
#: :func:`build_items` asserts the exception covers exactly these rows.
CASKET_USE_TYPE = 2


def build_items(tables: dict) -> list[dict]:
    types = {int(row["Id"]): row["Desc"] for row in _rows(tables["EquipType"])}
    known = {int(row["Id"]) for row in _rows(tables["ChessAttribute"])}
    items = []
    for row in _of_this_mode(_rows(tables["Item"])):
        type_id = row.get("EquipType")
        casket = row["UseType"] == CASKET_USE_TYPE
        attributes = [] if casket else _pairs(row.get("EquipTagDesc"))
        tags = _pairs(row.get("EquipTagDesc")) if casket else []
        if tags and all(pair["attributeId"] in known for pair in tags):
            raise RuntimeError(
                f"item {row['Id']} ({row['EquipName']}): a casket whose EquipTagDesc now reads as "
                "attributes — re-check CASKET_USE_TYPE before dropping it"
            )
        items.append({
            "id": int(row["Id"]),
            "name": row["EquipName"],
            "rarity": row["Rarity"],
            "typeId": type_id,
            "typeName": types.get(int(type_id), "") if type_id is not None else "",
            # 1 = 装备, 2 = 宝匣, 3 = 共鸣徽章, 4 = 道具. The page groups by this;
            # the group names are its own, the split is the client's.
            "useType": row["UseType"],
            "brief": row.get("BriefDescription", ""),
            "description": row["EquipDesc"],
            "attributes": attributes,
            "icon": _icon_name(row.get("Icon")),
        })
    return sorted(items, key=lambda item: (item["useType"], -item["rarity"], item["id"]))


def build_talents(tables: dict) -> list[dict]:
    talents = []
    for row in _of_this_mode(_rows(tables["Insight"])):
        talents.append({
            "id": int(row["Id"]),
            "name": row["InsightName"],
            "description": row["InsightDesc"],
            "handbookDescription": row.get("InsightHandbookDesc", ""),
            "rarity": row["InsightRarity"],
            "type": row["InsightType"],
            # The client hides some rows from its own handbook; the page
            # defaults to the same set rather than showing internal entries.
            "inHandbook": bool(row.get("IsShowInHandbook")),
        })
    return sorted(talents, key=lambda talent: (talent["type"], -talent["rarity"], talent["id"]))


def build_rules(tables: dict) -> dict:
    # A turn's kind is resolved by which detail table its TurnDetailID lands in,
    # rather than by reading TurnType as a code of our own invention.
    pve = {int(row["TurnId"]) for row in _rows(tables["PVETurn"])}
    show = {int(row["TurnId"]) for row in _rows(tables["ShowTurn"])}
    pvp = {int(row["TurnId"]): row for row in _rows(tables["PVPTurn"])}

    turns = []
    for row in _of_this_mode(_rows(tables["Turn"].get(str(GAMEPLAY_ID), []))):
        detail = int(row["TurnDetailID"])
        if detail in pvp:
            kind = "insight" if pvp[detail].get("HasInsight") else "pvp"
        elif detail in pve:
            kind = "pve"
        elif detail in show:
            kind = "carousel"
        else:
            raise RuntimeError(
                f"turn {row['TurnDesc']}: TurnDetailID {detail} is in none of "
                "AutoChessPVPTurnData / AutoChessPVETurnData / AutoChessShowTurnData"
            )
        turns.append({
            "id": int(row["Id"]),
            "round": row["Round"],
            "label": row["TurnDesc"],
            "kind": kind,
        })

    levels = [
        {
            "level": index,
            "exp": row["Exp"],
            "population": row["Population"],
            # Odds of each cost tier appearing in the shop, in percent.
            "shopOdds": [row[f"Pool_{cost}"] for cost in range(1, 6)],
        }
        for index, row in enumerate(_rows(tables["PlayerLevel"]), start=1)
    ]

    costs = [
        {
            "cost": row["Cost"],
            "buyPriceByStar": _list(row["BuyStar"]),
            "sellPriceByStar": _list(row["SellStar"]),
        }
        for row in sorted(_rows(tables["Cost"]), key=lambda row: row["Cost"])
    ]

    shop = _of_this_mode(_rows(tables["Shop"]))
    return {
        "turns": sorted(turns, key=lambda turn: turn["id"]),
        "levels": levels,
        "costs": costs,
        # How many copies of each cost tier the shared pool holds.
        "poolSizeByCost": _list(shop[0]["NumberLimit"]) if shop else [],
        "economy": build_economy(tables["Const"]),
        "damage": build_damage(tables["Const"], rounds={turn["round"] for turn in turns}),
    }


def build_damage(consts: dict, rounds: set[int]) -> dict:
    """What a lost duel costs the player.

    `BASE_PLAYER_DAMAGE_PER_TURN` holds one value per stage and
    `BASE_PLAYER_DAMAGE_PER_CHESS` one per (cost, star) — the names say so, and
    the first lines up exactly with the eight stages the turn ladder has, which
    is asserted here: a patch that adds a stage without extending the table
    would otherwise index off the end and silently under-report the damage of
    the last one.

    `PLAYER_DAMAGE_RULE` is `[5, 4]` and is **not** emitted. Nothing in the
    export says what those two numbers select, and a field on the page needs a
    label — which would have to be invented.
    """
    by_round = [int(value) for value in _list(consts.get("BASE_PLAYER_DAMAGE_PER_TURN"))]
    per_piece = [
        [int(value) for value in _list(row)]
        for row in _list(consts.get("BASE_PLAYER_DAMAGE_PER_CHESS"))
    ]
    if not by_round or not per_piece:
        raise RuntimeError("BASE_PLAYER_DAMAGE_PER_TURN / _PER_CHESS are missing or not lists")
    if len(by_round) != len(rounds):
        raise RuntimeError(
            f"BASE_PLAYER_DAMAGE_PER_TURN has {len(by_round)} entries but the turn ladder "
            f"has {len(rounds)} stages — one of the two moved"
        )
    return {"baseByRound": by_round, "perSurvivingPieceByCostAndStar": per_piece}


def build_economy(consts: dict) -> dict:
    """Gold income per turn.

    Only part of this is data. `TURN_BASE_MONEY`, `MAX_INTEREST_MONEY`, the two
    streak ladders and the experience price are constants; **the 10% interest
    rate and the +1 for winning a duel are not**. Those two numbers exist
    nowhere but inside `SHOP_INCOME_TIPS_DESC`, the client's own explanation, so
    that text is shipped verbatim and they are not re-published as fields we
    derived — a structured `interestRate: 0.1` would read as something the
    tables said, and the tables do not say it.

    `BASE_MONEY` is 0 and nothing names what it counts, so it is left out
    rather than labelled "starting gold" on the strength of its name.

    **Rounding.** The blurb says "10% of your gold" and stops there, which
    leaves 45 gold ambiguous. Two pieces of evidence settle it as *floor*, and
    the page states it:

    - ``Data/NetDefs/AvatarAutoChessComponent.xml`` defines the server's own
      ``AUTO_CHESS_TURN_MONEY_DETAIL`` — ``totalMoney`` / ``baseMoney`` /
      ``interestMoney`` / ``winBaseMoney`` / ``streakMoney``, every one a
      ``UINT``. The award is an integer, not a rounded display of a fraction.
    - The interest widget,
      ``Gameplay/LogicSystem/AutoChess/HUD/AutoChess_HUD_Talent.luac``, carries
      ``InterestMoneyUnit``, ``maxInterest`` and ``floor`` together.

    What is *not* recoverable: the 10% itself and the value of
    ``InterestMoneyUnit`` are in no table, and that same NetDefs file shows the
    breakdown arriving from the server — so the real sum is computed there, as
    with 非凡评分. This module publishes the constants and the client's wording,
    and does not reimplement the formula.
    """
    def ladder(key: str) -> list[dict]:
        # `[[fromStreak, bonus], ...]`, e.g. [[0,0],[3,1],[5,2],[6,3]].
        return [
            {"fromStreak": int(step[0]), "bonus": int(step[1])}
            for step in _list(consts.get(key))
            if isinstance(step, list) and len(step) == 2
        ]

    win, lose = ladder("STREAK_WIN_MONEY"), ladder("STREAK_LOSE_MONEY")
    if not win or not lose:
        raise RuntimeError(
            "STREAK_WIN_MONEY / STREAK_LOSE_MONEY are missing or not [threshold, bonus] pairs"
        )
    return {
        "baseIncomePerTurn": consts["TURN_BASE_MONEY"],
        "maxInterest": consts["MAX_INTEREST_MONEY"],
        "winStreak": win,
        "loseStreak": lose,
        "experience": {"price": consts["BUY_EXP_PRICE"], "gain": consts["BUY_EXP_GAIN"]},
        # The client's own wording, which is the only place the interest rate
        # and the duel-win bonus are stated at all.
        "incomeDescription": consts["SHOP_INCOME_TIPS_DESC"],
    }


def _load_tables(excel: Path, strings: dict) -> dict:
    names = [
        "ChessAttribute", "ChessBase", "Chess", "ChessStaticProp",
        "Bond", "BondEffect", "Item", "EquipType", "Insight",
        "Turn", "PVETurn", "PVPTurn", "ShowTurn", "PlayerLevel", "Cost", "Shop", "Const",
    ]
    return {
        name: resolve_text(load_table(excel, f"AutoChess{name}Data"), strings)
        for name in names
    }


def build(excel: Path, raw: Path, data_out: Path, res_out: Path) -> dict[str, int]:
    strings = load_strings(excel)
    tables = _load_tables(excel, strings)

    payloads = {
        "attributes": build_attributes(tables),
        "chess": build_pieces(tables),
        "bonds": build_bonds(tables),
        "items": build_items(tables),
        "talents": build_talents(tables),
        "rules": build_rules(tables),
    }

    missing = unresolved_ids(payloads)
    if missing:
        raise RuntimeError(
            f"{len(missing)} text id(s) had no zh-CN string, e.g. {sorted(missing)[:3]}"
        )

    # Every attribute a piece or an item cites must be one the attribute table
    # names, or the page renders a number with no label and no format.
    known = {row["id"] for row in payloads["attributes"]}
    cited = {
        entry["attributeId"]
        for piece in payloads["chess"] for star in piece["stars"] for entry in star["attributes"]
    } | {
        entry["attributeId"] for item in payloads["items"] for entry in item["attributes"]
    }
    unknown = sorted(cited - known)
    if unknown:
        raise RuntimeError(
            f"{len(unknown)} attribute id(s) are used but not in AutoChessChessAttributeData: {unknown[:5]}"
        )

    icons = _convert_property_icons(raw, res_out)
    item_icons, item_missing = _convert_item_icons(raw, res_out, payloads["items"])
    skill_icons, skill_missing = _convert_skill_icons(raw, res_out, payloads["chess"])
    for name, payload in payloads.items():
        write_json(Path(data_out) / OUT_DIR / f"{name}.json", payload)

    counts = {name: len(payload) for name, payload in payloads.items() if isinstance(payload, list)}
    print(
        f"autochess: {counts['chess']} pieces, {counts['bonds']} bonds, {counts['items']} items, "
        f"{counts['talents']} talents, {len(payloads['rules']['turns'])} turns "
        f"-> {OUT_DIR}/, {icons} attribute + {item_icons} item + {skill_icons} skill webp "
        f"-> {res_out}/{ICON_SUBDIR}"
    )
    if item_missing or skill_missing:
        # Named, not silently dropped: the page renders these without art, and a
        # reader of this output should know how many and why.
        print(
            f"autochess: {len(item_missing)} item and {skill_missing} skill icon(s) unavailable — "
            f"this mode's own art is not in any mountable container (see README)"
        )
    return counts


def _convert_property_icons(raw: Path, res_out: Path) -> int:
    """The attribute icons, the one part of this mode's art the export carries.

    The piece portraits and the bond icons are *not* recoverable here: the
    client's `Manifest_UFSFiles_Win64.txt` has no `AutoChess/Avatar` entry at
    all, and the `Fetter/` and `Talent/` icons it does list fall in the same
    `ConfigIcon` blind spot that leaves the reforge graces unillustrated. So the
    pages are typographic, and this stage ships what exists rather than failing
    on what does not.
    """
    source = Path(raw) / PROPERTY_ICON_DIR
    if not source.is_dir():
        raise FileNotFoundError(
            f"{source} is absent — run: uex export --profile gmzz --only {PROPERTY_ICON_DIR}"
        )
    target = Path(res_out) / ICON_SUBDIR
    target.mkdir(parents=True, exist_ok=True)
    count = 0
    for png in sorted(source.glob("*.png")):
        with Image.open(png) as img:
            img.save(target / f"{png.stem}.webp", "WEBP", quality=WEBP_QUALITY, method=6)
        count += 1
    if not count:
        raise FileNotFoundError(f"no PNG under {source} — the icon export produced nothing")
    return count


#: Where each item's art lives. The first two are ordinary game-wide item
#: directories and export normally; the third is this mode's own, and shares the
#: fate of its portraits and talent icons — see :func:`_convert_property_icons`.
ITEM_ICON_DIRS = (
    "C7/Content/Arts/UI_2/Resource/Item/Middle",
    "C7/Content/Arts/UI_2/Resource/Item/Large",
)


def _convert_item_icons(raw: Path, res_out: Path, items: list[dict]) -> tuple[int, list[int]]:
    """Equipment art, for the 77 of 107 rows whose icon is reachable.

    The split is not arbitrary and is worth stating. The 18 共鸣徽章 point at
    ``ConfigIcon/AutoChess/EquipMiddle``, which does not mount — art the *mode
    itself* added. The other 12 misses are ordinary 装备 rows pointing at
    ``Item/Middle``, a directory that does mount and serves the remaining 77:
    those twelve are items added in the same patch, so their files are not in
    the index either. So the rule is the patch, not the directory — everything
    this mode brought with it is unreachable, everything older is fine.

    Rows whose icon cannot be produced keep their ``icon`` value — the page
    checks for the file rather than trusting the field — and the count is
    reported by the caller instead of being swallowed.
    """
    target = Path(res_out) / ICON_SUBDIR / "items"
    target.mkdir(parents=True, exist_ok=True)
    converted, missing = 0, []
    for item in items:
        name = item["icon"]
        if not name:
            missing.append(item["id"])
            continue
        source = next(
            (png for directory in ITEM_ICON_DIRS
             if (png := Path(raw) / directory / f"{name}.png").is_file()),
            None,
        )
        if source is None:
            missing.append(item["id"])
            item["icon"] = ""  # nothing to point at; the page shows no frame
            continue
        with Image.open(source) as img:
            img.save(target / f"{name}.webp", "WEBP", quality=WEBP_QUALITY, method=6)
        converted += 1
    return converted, missing


#: Skill art the export reaches. `Skill/AutoChess`, where 44 of the 53 pieces
#: point, does not mount — the same boundary as the portraits.
SKILL_ICON_DIRS = (
    "C7/Content/Arts/UI_2/Resource/Skill/Rogue",
    "C7/Content/Arts/UI_2/Resource/Skill/Profession/Bard",
)


def _convert_skill_icons(raw: Path, res_out: Path, pieces: list[dict]) -> tuple[int, int]:
    """Skill art, for the 9 of 53 pieces that borrow an existing game icon.

    Deliberately partial. Nine cards out of fifty-three carrying an icon would
    look like a broken grid, so the page places it inline beside the skill's
    name, where its absence reads as ordinary text rather than a missing tile.
    """
    target = Path(res_out) / ICON_SUBDIR / "skills"
    target.mkdir(parents=True, exist_ok=True)
    converted, missing = 0, 0
    for piece in pieces:
        name = piece["skillIcon"]
        source = next(
            (png for directory in SKILL_ICON_DIRS
             if name and (png := Path(raw) / directory / f"{name}.png").is_file()),
            None,
        )
        if source is None:
            piece["skillIcon"] = ""
            missing += 1
            continue
        with Image.open(source) as img:
            img.save(target / f"{name}.webp", "WEBP", quality=WEBP_QUALITY, method=6)
        converted += 1
    return converted, missing


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--excel", type=Path, default=None)
    parser.add_argument("--raw", type=Path, default=None)
    parser.add_argument("--data-out", type=Path, default=None)
    parser.add_argument("--res-out", type=Path, default=None)
    args = parser.parse_args(argv)

    data_out = args.data_out or require_dir("GMZZ_DATA_OUT")
    build(
        args.excel or excel_dir(),
        args.raw or require_dir("GMZZ_RAW"),
        data_out,
        args.res_out or require_dir("GMZZ_RES_OUT"),
    )
    stamp_version(data_out)


if __name__ == "__main__":
    main()
