"""The relic stage: the nested table shapes, the grade ladder, the Mark rates."""

from __future__ import annotations

import json

import pytest

from gmzz import relics


ARTIFACTS = {
    "2085029": {
        "ID": 2085029, "Name": "公证书", "GroupId": 1, "Tag": 1, "InitialGrade": 3,
        "Icon": "2000557", "DisplayItemID": 2000641, "ItemDes": "一纸<Mark>公证</>。", "SeasonIdList": [103],
    },
    "2085004": {
        "ID": 2085004, "Name": "正义钱包", "GroupId": 2, "Tag": 3, "InitialGrade": 3,
        "Icon": "2000584", "DisplayItemID": 2000584, "ItemDes": "", "SeasonIdList": [103],
    },
}

# Nested two levels: artifact id -> grade -> row.
PROMOTE = {
    "2085029": {
        "3": {"Grade": 3, "Mark": 500, "AttributeImproveTitle": "3级封印物最多生效4条词条"},
        "2": {"Grade": 2, "Mark": 2500, "AttributeImproveTitle": "2级封印物最多生效5条词条"},
        "1": {"Grade": 1, "Mark": 4500, "AttributeImproveTitle": ""},
        "0": {"Grade": 0, "Mark": 6500, "AttributeImproveTitle": ""},
    },
    "2085004": {
        "3": {"Grade": 3, "Mark": 500, "AttributeImproveTitle": ""},
    },
}

# Nested: season -> group -> list of rows.
RESONANCE = {
    "103": {
        "103": [
            {"SeasonID": 103, "Group": 103, "Level": 2, "Mark": 2704, "FightProp": {"Atk_N": [602, "k1"]}},
            {"SeasonID": 103, "Group": 103, "Level": 1, "Mark": 1352, "FightProp": {"Atk_N": [301, "k1"]}},
        ],
    },
}

# Nested: season -> level -> row.
KNOWLEDGE = {
    "103": {
        "11": {"SeasonID": 103, "Level": 11, "k1": 0.32, "k2": 0.32, "RoleLevelConditions": 64},
        "0": {"SeasonID": 103, "Level": 0, "k1": 0.1, "k2": 0.1, "RoleLevelConditions": 1},
    },
}

# Nested: season -> prop -> row.
WORTHS = {
    "103": {
        "Atk_N": {"Prop": "Atk_N", "Value": 2.62, "SeasonID": 103},
        "Crit_N": {"Prop": "Crit_N", "Value": 3.83, "SeasonID": 103},
    },
}

MATS = {"2085103": {"ID": 2085103, "Name": "攻击物质", "Type": 1, "TC": 3, "quality": 5, "icon": "2085102", "itemDes": "可以填充到攻击/特化封印物上。"}}
MAT_TC = {"3": {"TC": 3, "Set": 5, "Entry_1": 0, "Entry_2": 0, "Entry_3": 100, "Entry_4": 0, "Entry_5": 0, "Entry_6": 0}}
MAT_GROUPS = {"101": {"ID": 101, "GroupNmae": "攻击", "GroupType": [1], "Rarity": 2, "MaxRepeatTimes": 1, "EntryDescription": ""}}
MAT_WORDS = {
    "10004": {"ID": 10004, "Mark": 1284, "Set": [5], "Tag": [2], "Groups": [101], "Saturation": 0.6875,
              "FightProp": {"Atk_N": [[0, 490], "k2"]}},
    "10003": {"ID": 10003, "Mark": 1167, "Set": [5], "Tag": [2], "Groups": [101], "Saturation": 0.625,
              "FightProp": {"Atk_N": [[0, 445], "k2"]}},
}
CONSTS = {"XMatMinWordNum": 1, "XMatMaxWordNum": 6, "SealWorstGrade": 3, "SealBestGrade": 1,
          "MainAttributeTipsEntryNumber": [6, 6, 5, 4], "Unwanted": "x"}
# The 公证书 displays through a different item than its icon names; only the
# displayed one carries the quality.
ITEMS = {"2000641": {"ID": 2000641, "quality": 4, "icon": "2000557"}, "2000584": {"ID": 2000584, "quality": 4}}
RISKS = [{"RiskID": 1, "RiskLevel": "有一定危险", "RiskDescription": "小心使用。"}]


@pytest.fixture
def stub(monkeypatch):
    tables = {
        relics.SEALED_TABLE: ARTIFACTS, relics.ITEM_TABLE: ITEMS, relics.PROMOTE_TABLE: PROMOTE,
        relics.RISK_TABLE: RISKS, relics.RESONANCE_TABLE: RESONANCE,
        relics.KNOWLEDGE_TABLE: KNOWLEDGE, relics.WORTH_TABLE: WORTHS,
        relics.MAT_TABLE: MATS, relics.MAT_TC_TABLE: MAT_TC,
        relics.MAT_WORD_TABLE: MAT_WORDS, relics.MAT_GROUP_TABLE: MAT_GROUPS,
        relics.CONST_TABLE: CONSTS,
    }
    monkeypatch.setattr(relics, "load_strings", lambda excel: {})
    monkeypatch.setattr(relics, "resolve_text", lambda payload, strings: payload)
    monkeypatch.setattr(relics, "load_table", lambda excel, name: tables[name])
    return tables


def test_artifacts_carry_their_group_name(stub):
    rows = {a["id"]: a for a in relics.artifacts(None, {})}
    assert rows[2085029]["groupName"] == "攻击"
    assert rows[2085004]["groupName"] == "防御"
    assert rows[2085029]["description"] == "一纸公证。", "client markup stripped"
    # The rarity plate comes from the item the client displays, via DisplayItemID.
    assert rows[2085029]["quality"] == 4 and rows[2085004]["quality"] == 4


def test_promotion_reads_the_nested_shape_and_orders_worst_first(stub):
    ladder = relics.promotion(None, {})
    assert [(r["grade"], r["mark"]) for r in ladder["ladder"]] == [
        (3, 500), (2, 2500), (1, 4500), (0, 6500),
    ]
    # Lower is better, and that is stated in the data rather than only in prose.
    assert ladder["bestGrade"] == 0
    assert ladder["worstGrade"] == 3
    assert "4条词条" in ladder["ladder"][0]["note"]


def test_promotion_refuses_a_grade_whose_mark_differs_between_artifacts(stub, monkeypatch):
    # The ladder is emitted once for all artifacts, so a disagreement means that
    # assumption broke and the shape has to change rather than pick a winner.
    clashing = {**PROMOTE, "2085004": {"3": {"Grade": 3, "Mark": 999, "AttributeImproveTitle": ""}}}
    monkeypatch.setattr(relics, "load_table", lambda excel, name: clashing)
    with pytest.raises(RuntimeError, match="several Mark values"):
        relics.promotion(None, {})


def test_resonance_flattens_season_and_group_and_sorts_by_affix_count(stub):
    result = relics.resonance(None, {})
    ladder = result["103"]["103"]
    assert [r["affixCount"] for r in ladder] == [1, 2], "sorted, not hash order"
    assert ladder[1]["mark"] == 2704
    # The `[value, "k1"]` pair keeps only the value; the coefficient is applied
    # by the page from the knowledge ladder.
    assert ladder[0]["stats"] == [["Atk_N", 301]]


def test_knowledge_ladder_is_sorted_and_carries_k2(stub):
    result = relics.knowledge(None, {})
    assert [r["level"] for r in result["103"]] == [0, 11]
    assert result["103"][1]["k2"] == 0.32


def test_worths_are_the_mark_exchange_rate_per_season(stub):
    result = relics.worths(None, {})
    # Mark = round(value * worth): 490 * 2.62 = 1283.8 -> the 1284 in the table.
    assert result["103"]["Atk_N"] == 2.62
    assert round(490 * result["103"]["Atk_N"]) == MAT_WORDS["10004"]["Mark"]


def test_materials_join_the_affix_count_distribution_and_pool(stub):
    result = relics.materials(None, {})
    item = result["items"][0]
    assert item["affixCountWeights"] == [0, 0, 100, 0, 0, 0]
    assert sum(item["affixCountWeights"]) == 100, "each row sums to 100"
    # poolSet selects the affix pool and is NOT always equal to tc.
    assert item["poolSet"] == 5 and item["tc"] == 3


def test_material_affix_pool_unwraps_the_value_and_orders_richest_first(stub):
    result = relics.materials(None, {})
    ladder = result["affixPool"]["5"]["2"]
    assert [a["mark"] for a in ladder] == [1284, 1167]
    # `[[0, 490], "k2"]` -> 490. Taking amount[0] alone would yield a list.
    assert ladder[0]["value"] == 490


def test_constants_keeps_only_what_the_page_needs(stub):
    result = relics.constants(None, {})
    assert result["XMatMaxWordNum"] == 6
    assert result["MainAttributeTipsEntryNumber"] == [6, 6, 5, 4]
    assert "Unwanted" not in result


def test_build_writes_the_payload_with_the_score_rule(stub, tmp_path):
    counts = relics.build(None, tmp_path)
    assert counts["artifacts"] == 2 and counts["gradeLadder"] == 4

    payload = json.loads((tmp_path / relics.OUT_FILE).read_text(encoding="utf-8"))
    # The rule ships so the page cannot reimplement the rounding the other way:
    # summing then flooring gives 1269 where per-affix flooring gives 1268.
    assert payload["scoreRule"] == relics.SCORE_RULE
    assert payload["groupNames"] == {"1": "攻击", "2": "防御", "3": "特化"}
