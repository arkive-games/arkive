"""The 愚者棋局 stage: the three joins that fail silently when they are wrong.

Each test here stands for a mistake an earlier draft actually made — dropping
the wrong rows, grouping bonds by the wrong field, and reading a casket's tag
list as attributes. None of them raised; all of them produced a plausible page.
"""

from __future__ import annotations

import pytest

from gmzz import autochess


def test_bond_group_reads_the_priority_band():
    # Not `Type`: that is 1 on 27 of the 28 rows, which would put every 组织共鸣
    # but one in the wrong family.
    assert autochess._bond_group(100, "铁血") == "role"
    assert autochess._bond_group(200, "塔罗会") == "faction"
    assert autochess._bond_group(201, "荒野怪物") == "faction", "荒野怪物 sits one above the band's floor"
    assert autochess._bond_group(206, "伟大的主宰") == "special"


def test_bond_group_refuses_an_unknown_band():
    with pytest.raises(RuntimeError, match="is in no known band"):
        autochess._bond_group(300, "新共鸣")


def test_list_normalises_the_clients_empty_table():
    # LuaJIT writes `{}` for "none", which arrives as a dict and would otherwise
    # reach the JSON as an object where the page's type says list.
    assert autochess._list({}) == []
    assert autochess._list([1, 2]) == [1, 2]


def test_pairs_rejects_anything_that_is_not_an_id_value_pair():
    assert autochess._pairs([[2010, 6718]]) == [{"attributeId": 2010, "value": 6718}]
    with pytest.raises(ValueError, match="expected an .attributeId, value. pair"):
        autochess._pairs([[2010]])


ATTRIBUTES = {
    "2010": {"Id": 2010, "Prop": "maxHp", "Desc": "生命值", "DataFormat": "%d",
             "IsOnDetail": False, "IsOnExtraPanel": True, "IconPath": ""},
    "2037": {"Id": 2037, "Prop": "critDamage", "Desc": "暴击伤害", "DataFormat": "*100|%d%%",
             "IsOnDetail": True, "IsOnExtraPanel": True, "IconPath": ""},
}

BASE = {
    "101": {
        "BaseId": 101, "ChessName": "棋子甲", "Cost": 1, "Tag": "近战战士", "TagColor": 1,
        "BondList": [101], "PosSuggest": "1", "PositionDesc": "前排。",
        "StarChessIdList": [1011],
    },
    # The client's own marker for a trial boss / summon / casket. Its
    # PositionDesc says 「不参与商店、掉落、选秀与共鸣统计」.
    "602": {
        "BaseId": 602, "ChessName": "月之污染", "Cost": 4, "Tag": "野怪BOSS", "TagColor": 4,
        "BondList": {}, "PosSuggest": "1", "PositionDesc": "试炼首领。",
        "StarChessIdList": [6021], "SummonMonster": 1,
    },
}

CHESS = {
    "1011": {
        "Id": 1011, "StarLevel": 1, "AttackRange": 1, "MaxMp": 75, "InitalMp": 0,
        "RecoverMp": 4, "NormalAttackRecoverMp": 0, "LostHpRecoverMp": 0,
        "MpSkillName": "斩击", "MpSkillDesc": "造成伤害。", "MpSkillValueDesc": "",
    },
    "6021": {
        "Id": 6021, "StarLevel": 1, "AttackRange": 1, "MaxMp": 0, "InitalMp": 0,
        "RecoverMp": 0, "NormalAttackRecoverMp": 0, "LostHpRecoverMp": 0,
        "MpSkillName": "", "MpSkillDesc": "", "MpSkillValueDesc": "",
    },
}

PROPS = {
    "1011": {"AttributeList": [[2010, 600], [2037, 1.5]]},
    "6021": {"AttributeList": [[2010, 9000]]},
}


def test_summon_rows_are_not_pieces(monkeypatch):
    monkeypatch.setattr(autochess, "PIECE_COUNT", 1)
    pieces = autochess.build_pieces({"ChessBase": BASE, "Chess": CHESS, "ChessStaticProp": PROPS})
    assert [piece["name"] for piece in pieces] == ["棋子甲"]
    assert pieces[0]["stars"][0]["attributes"] == [
        {"attributeId": 2010, "value": 600},
        {"attributeId": 2037, "value": 1.5},
    ], "the raw value ships; 1.5 becomes 150% only through the attribute's DataFormat"


def test_the_piece_count_is_asserted_against_the_games_own_claim():
    # The in-game help says 53. A rule that silently yields 52 would drop a
    # piece from the wiki with nothing to notice it by.
    with pytest.raises(RuntimeError, match="expected 53 pieces"):
        autochess.build_pieces({"ChessBase": BASE, "Chess": CHESS, "ChessStaticProp": PROPS})


ITEMS = {
    "1357": {"Id": 1357, "EquipName": "秘术扉页", "Rarity": 4, "EquipType": 1, "UseType": 1,
             "BriefDescription": "", "EquipDesc": "强化普攻。", "EquipTagDesc": [[2010, 35]], "Icon": ""},
    # A casket: consumable, and its EquipTagDesc is not an attribute list.
    "2": {"Id": 2, "EquipName": "精良装备宝匣", "Rarity": 2, "EquipType": 1, "UseType": 2,
          "BriefDescription": "", "EquipDesc": "开启后三选一。", "EquipTagDesc": [[1, 20]], "Icon": ""},
}


def test_a_caskets_tag_list_is_not_published_as_attributes():
    items = autochess.build_items({
        "Item": ITEMS,
        "EquipType": [{"Id": 1, "Desc": "攻击", "Type": "Atk"}],
        "ChessAttribute": ATTRIBUTES,
    })
    by_id = {item["id"]: item for item in items}
    assert by_id[1357]["attributes"] == [{"attributeId": 2010, "value": 35}]
    assert by_id[2]["attributes"] == [], "[[1, 20]] is no attribute pair, and 1 is no attribute id"


def test_turn_kind_comes_from_the_table_the_detail_id_lands_in():
    rules = autochess.build_rules({
        "Turn": {"1": [
            {"Id": 1, "Round": 1, "TurnDesc": "1-1", "TurnDetailID": 201},
            {"Id": 2, "Round": 2, "TurnDesc": "2-1", "TurnDetailID": 102},
            {"Id": 3, "Round": 2, "TurnDesc": "2-2", "TurnDetailID": 101},
            {"Id": 4, "Round": 2, "TurnDesc": "2-4", "TurnDetailID": 301},
        ]},
        "PVETurn": [{"TurnId": 201}],
        "PVPTurn": [{"TurnId": 101}, {"TurnId": 102, "HasInsight": 1}],
        "ShowTurn": [{"TurnId": 301}],
        "PlayerLevel": [{"Exp": 2, "Population": 1, **{f"Pool_{n}": 0 for n in range(1, 7)}}],
        "Cost": [{"Cost": 1, "BuyStar": [1, 3, 9], "SellStar": [1, 3, 9]}],
        "Shop": [{"Id": 1, "NumberLimit": [30]}],
        "Const": CONSTS,
    })
    assert [turn["kind"] for turn in rules["turns"]] == ["pve", "insight", "pvp", "carousel"]
    assert rules["levels"][0]["level"] == 1, "levels are 1-based, as the client's own UI counts them"


CONSTS = {
    "TURN_BASE_MONEY": 5,
    "MAX_INTEREST_MONEY": 5,
    "BUY_EXP_PRICE": 4,
    "BUY_EXP_GAIN": 4,
    "STREAK_WIN_MONEY": [[0, 0], [3, 1], [5, 2], [6, 3]],
    "STREAK_LOSE_MONEY": [[0, 0], [3, 1], [5, 2], [6, 3]],
    "SHOP_INCOME_TIPS_DESC": "…每回合获得当前总金币10%的利息（最多为5金币）…",
    "BASE_MONEY": 0,
}


def test_economy_reads_the_streak_ladder_as_thresholds():
    economy = autochess.build_economy(CONSTS)
    assert economy["baseIncomePerTurn"] == 5
    assert economy["winStreak"] == [
        {"fromStreak": 0, "bonus": 0},
        {"fromStreak": 3, "bonus": 1},
        {"fromStreak": 5, "bonus": 2},
        {"fromStreak": 6, "bonus": 3},
    ]


def test_economy_does_not_republish_what_only_the_blurb_states():
    # The 10% interest rate and the +1 for winning a duel are in no constant —
    # only inside SHOP_INCOME_TIPS_DESC. Emitting them as fields would present
    # a reading of prose as something the tables said.
    economy = autochess.build_economy(CONSTS)
    assert "interestRate" not in economy
    assert "winBonus" not in economy
    assert "10%" in economy["incomeDescription"]
    # BASE_MONEY is 0 and nothing says what it counts.
    assert "baseMoney" not in economy and "startingGold" not in economy


def test_economy_stops_when_the_streak_ladder_changes_shape():
    with pytest.raises(RuntimeError, match="STREAK_WIN_MONEY"):
        autochess.build_economy({**CONSTS, "STREAK_WIN_MONEY": {}})


def test_a_turn_pointing_nowhere_stops_the_build():
    with pytest.raises(RuntimeError, match="is in none of"):
        autochess.build_rules({
            "Turn": {"1": [{"Id": 1, "Round": 1, "TurnDesc": "1-1", "TurnDetailID": 999}]},
            "PVETurn": [], "PVPTurn": [], "ShowTurn": [],
            "PlayerLevel": [], "Cost": [], "Shop": [], "Const": CONSTS,
        })
