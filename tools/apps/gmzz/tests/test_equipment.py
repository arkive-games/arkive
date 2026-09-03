"""The equipment stage: affix tiers, the profession inversion, base-stat pickup."""

from __future__ import annotations

import json

import pytest

from gmzz import equipment


@pytest.mark.parametrize(
    ("group_id", "tier"),
    [
        (3991001, "normal"), (3991012, "normal"), (3991701, "normal"),
        (3991021, "extraordinary"), (3991032, "extraordinary"), (3991721, "extraordinary"),
        (3991041, "contaminated"), (3991052, "contaminated"),
        (3991061, "special"), (3991063, "special"),
    ],
)
def test_tier_of_reads_the_group_id_tail(group_id, tier):
    # The tail is the only thing that says which tier a group is; the 400->550
    # Mark gap between 普通 and 非凡 is a consequence, not the test.
    assert equipment.tier_of(group_id) == tier


def test_tier_of_rejects_a_tail_in_no_band():
    # Silently bucketing an unknown group would mislabel real affixes.
    with pytest.raises(RuntimeError, match="no known tier band"):
        equipment.tier_of(3991099)


TYPES = {
    "302": {
        "ID": 302, "TypeName": "龙瞳", "EquipSlot": 1,
        "BasicPropName": ["AtkMin_N", "AtkMax_N", "MaxHp_N", "AllProHurtPlus_N"],
        "BasicPropAppear": ["攻击", "最大生命", "途径专攻"],
        "ClassLimit": [1200002],
    },
    "328": {
        "ID": 328, "TypeName": "鞋靴", "EquipSlot": 10,
        "BasicPropName": ["MaxHp_N", "Pierce_N"], "BasicPropAppear": ["最大生命", "穿刺"],
    },
}

ITEMS = {
    "3020623": {
        "ID": 3020623, "itemName": "无形之编排", "subType": 302, "quality": 6, "icon": "3020623",
        "TC": 62, "lvReq": 60, "Mark": 2430, "SuitID": 101, "SetId": 4, "UniqueID": 0,
        "itemDes": "悄无声息的引导。", "ShowCondition": [101, 7],
        "AtkMin_N": 327, "AtkMax_N": 607, "MaxHp_N": 1960, "AllProHurtPlus_N": 0,
    },
    "3001059": {
        "ID": 3001059, "itemName": "温暖的皮靴", "subType": 328, "quality": 6, "icon": "3001059",
        "TC": 62, "Mark": 2685, "UniqueID": 10035, "itemDes": "x", "ShowCondition": [101, 10000],
        "MaxHp_N": 2000, "Pierce_N": 0,
    },
    "3000108": {
        "ID": 3000108, "itemName": "鞋靴橙75", "subType": 328, "quality": 6, "icon": "3000108",
        "TC": 69, "Mark": 0, "UniqueID": 0, "Order": 999, "ShowCondition": {},
    },
    "3001074": {
        "ID": 3001074, "itemName": "pvp烙印68", "subType": 328, "quality": 6, "icon": "3001074",
        "TC": 68, "Mark": 2977, "UniqueID": 30013, "ShowCondition": [101, 10000],
    },
    "9999": {"ID": 9999, "itemName": "不是装备", "subType": 7777, "quality": 1, "icon": "x"},
}

BRANDS = {
    "10035": {"ID": 10035, "SuitName1": "好孩子", "SuitBrief1": "怪物专攻提高<Mark>150</>。", "SuitStory": ""},
    "10032": {"ID": 10032, "SuitName1": "好孩子", "SuitBrief1": "怪物专攻提高<Mark>150</>。", "SuitStory": "", "productItemId": 3001059},
    "10036": {"ID": 10036, "SuitName1": "好孩子2", "SuitBrief1": "second state", "SuitStory": ""},
    "30013": {"ID": 30013, "SuitName1": "隐秘烙印", "SuitBrief1": "该效果已被隐秘，暂时无法查看。", "SuitStory": ""},
    "40001": {"ID": 40001, "SuitName1": "未命名", "SuitBrief1": "描述文本3", "SuitStory": ""},
}

PROFESSIONS = {
    "1200002": {"ID": 1200002, "Name": "空想家途径", "SequenceName": "观众", "ProfessionDesc": "化身巨龙。", "Disabled": False},
    "1200008": {"ID": 1200008, "Name": "错误途径", "SequenceName": "偷盗者", "ProfessionDesc": "", "Disabled": True},
}


FORMULAS = {
    "1600176": {"ID": 1600176, "Name": "EQUIP_SUIT_LEVEL_SCORE_1", "Formula": "return 201*($1 -49)"},
    "1600177": {"ID": 1600177, "Name": "EQUIP_SUIT_LEVEL_SCORE_2", "Formula": "return 323*($1 -49)"},
    "1600175": {"ID": 1600175, "Name": "EQUIP_SUIT_LEVEL1_FIXED", "Formula": "return 20*($1 -49)"},
}


def test_suit_level_scores_reads_the_two_linear_formulas(stub):
    stub({equipment.FORMULA_TABLE: FORMULAS})
    assert equipment.suit_level_scores(None) == {
        "1": {"perLevel": 201.0, "origin": 49},
        "2": {"perLevel": 323.0, "origin": 49},
    }


def test_suit_level_scores_rejects_a_formula_of_another_shape(stub):
    bent = dict(FORMULAS)
    bent["1600177"] = {**FORMULAS["1600177"], "Formula": "if $1 > 60 then return 9 end return 0"}
    stub({equipment.FORMULA_TABLE: bent})
    with pytest.raises(RuntimeError, match="EQUIP_SUIT_LEVEL_SCORE_2"):
        equipment.suit_level_scores(None)


@pytest.fixture
def stub(monkeypatch):
    def stubbed(tables):
        monkeypatch.setattr(equipment, "load_strings", lambda excel: {})
        monkeypatch.setattr(equipment, "resolve_text", lambda payload, strings: payload)
        monkeypatch.setattr(equipment, "load_table", lambda excel, name: tables[name])
    return stubbed


def test_types_keeps_keys_and_labels_unzipped(stub):
    stub({equipment.TYPE_TABLE: TYPES})
    rows = {t["id"]: t for t in equipment.types(None, {})}
    weapon = rows[302]
    # 4 keys against 3 labels, because AtkMin_N/AtkMax_N share the label 攻击.
    # Zipping them here would mislabel every weapon.
    assert len(weapon["baseStatKeys"]) == 4
    assert len(weapon["baseStatLabels"]) == 3
    assert weapon["classLimit"] == [1200002]
    assert rows[328]["classLimit"] == [], "armour is unrestricted"


def test_items_reads_base_stats_off_the_item_and_drops_zeroes(stub):
    stub({equipment.TYPE_TABLE: TYPES, equipment.ITEM_TABLE: ITEMS})
    types_by_id = {t["id"]: t for t in equipment.types(None, {})}
    rows = {r["id"]: r for r in equipment.items(None, {}, types_by_id, set())}

    assert 9999 not in rows, "a non-equipment subType is skipped"
    item = rows[3020623]
    assert item["slot"] == 1, "joined via subType -> EquipmentTypeData"
    assert item["gearLevel"] == 62, "TC is the 装等, not lvReq"
    assert item["levelRequirement"] == 60
    assert item["baseScore"] == 2430, "Mark on the row is the 装备基础 score"
    assert item["brandId"] is None, "UniqueID 0 is no brand"
    # AllProHurtPlus_N is 0 and the game hides it.
    assert dict(item["baseStats"]) == {"AtkMin_N": 327, "AtkMax_N": 607, "MaxHp_N": 1960}
    assert rows[3001059]["brandId"] == 10035, "UniqueID is the 烙印 the item wears"


def test_items_takes_the_live_name_for_a_brooch_the_export_predates(stub):
    renamed = {
        **ITEMS,
        "3210642": {**ITEMS["3020623"], "ID": 3210642, "itemName": "淬炼·无火的余灰", "SuitID": 102},
    }
    stub({equipment.TYPE_TABLE: TYPES, equipment.ITEM_TABLE: renamed})
    types_by_id = {t["id"]: t for t in equipment.types(None, {})}
    names = {i["id"]: i["name"] for i in equipment.items(None, {}, types_by_id, set())}
    assert names[3210642] == "二律之背反"
    assert names[3020623] == "无形之编排", "an item with no override keeps its table name"


def test_items_drops_unreleased_gear(stub):
    stub({equipment.TYPE_TABLE: TYPES, equipment.ITEM_TABLE: ITEMS, equipment.BRAND_TABLE: BRANDS})
    types_by_id = {t["id"]: t for t in equipment.types(None, {})}
    hidden = equipment.unwritten_brands(None, {})
    # Both the designer stand-in and the client's "hidden" notice; the live
    # brands and the `2` variant are not in this set.
    assert hidden == {30013, 40001}

    ids = [r["id"] for r in equipment.items(None, {}, types_by_id, hidden)]
    # 鞋靴橙75 has no ShowCondition (the client never lists it) and pvp烙印68
    # wears a brand the client still hides; both would be pickable otherwise.
    assert ids == [3001059, 3020623]


def test_brands_links_by_product_and_drops_the_unwritten(stub):
    stub({equipment.BRAND_TABLE: BRANDS})
    rows = {b["id"]: b for b in equipment.brands(None, {})}
    assert set(rows) == {10035, 10032}, "hidden, placeholder and second-state rows are dropped"
    assert rows[10032]["productItemId"] == 3001059
    assert rows[10035]["productItemId"] is None
    assert rows[10035]["effect"] == "怪物专攻提高150。", "client markup stripped"


def test_professions_inverts_class_limit_and_keeps_the_disabled_one(stub):
    stub({equipment.TYPE_TABLE: TYPES, equipment.PROFESSION_TABLE: PROFESSIONS})
    type_rows = equipment.types(None, {})
    rows = {p["id"]: p for p in equipment.professions(None, {}, type_rows)}

    # ClassLimit points subtype -> class, so the mapping has to be inverted.
    assert rows[1200002]["weaponTypeIds"] == [302]
    assert rows[1200002]["sequenceName"] == "观众"
    # A pathway with no weapon subtype is emitted as-is rather than dropped;
    # the page decides what is offerable.
    assert rows[1200008]["weaponTypeIds"] == []
    assert rows[1200008]["disabled"] is True


BODIES = {"101": {"ID": 101, "Slot": [1], "Season": 101, "Year": 1}}
STAGES = {"101": [{"StageID": n, "Mark": 80, "Consume": [2, 100], "FirstConsume": [2, 200]} for n in range(1, 9)]}
STAGE_PROPS = {"101": {"ID": 101, **{f"Prop{n}": [["AtkMin_N", 0, 20], ["MaxHp_N", 0, 86]] for n in range(1, 9)}}}


def test_enhancement_joins_stages_to_their_body(stub):
    stub({
        equipment.BODY_TABLE: BODIES, equipment.STAGE_TABLE: STAGES,
        equipment.STAGE_PROP_TABLE: STAGE_PROPS,
    })
    result = equipment.enhancement(None, {})
    body = result["bodies"][0]
    assert body["slot"] == 1 and body["season"] == 101
    assert result["markPerStage"] == [80]
    assert result["maxStage"] == 8
    # The middle field of each prop triple is always 0 and is dropped.
    assert body["stages"][0]["stats"] == [["AtkMin_N", 20], ["MaxHp_N", 86]]
    # 3 stages x 80 is the 240 the game shows for a +3 piece.
    assert sum(s["mark"] for s in body["stages"][:3]) == 240


def test_enhancement_rejects_a_stage_ladder_with_no_body(stub):
    # Without the body there is no slot or season, so the ladder cannot be placed
    # and mixing seasons is exactly the failure this guards.
    stub({
        equipment.BODY_TABLE: {}, equipment.STAGE_TABLE: STAGES,
        equipment.STAGE_PROP_TABLE: STAGE_PROPS,
    })
    with pytest.raises(RuntimeError, match="absent from"):
        equipment.enhancement(None, {})


GROUPS = {
    "3991021": {"ID": 3991021, "Des": "攻击", "Type1_1": 1, "Type7_1": 0},
    "3991026": {"ID": 3991026, "Des": "技能增强", "Type1_1": 1},
    "3991001": {"ID": 3991001, "Des": "攻击", "Type1_1": 1},
}
WORDS = {
    "1": {"ID": 1, "Mark": 1000, "Set": [4], "Groups": [3991021], "FightProp": {"Atk_N": [382]}},
    "2": {"ID": 2, "Mark": 550, "Set": [4], "Groups": [3991021], "FightProp": {"Atk_N": [210]}},
    "3": {"ID": 3, "Mark": 400, "Set": [4], "Groups": [3991001], "FightProp": {"Atk_N": [153]}},
    "4": {"ID": 4, "Mark": 114, "Set": [3], "Groups": [3991001], "FightProp": {"Atk_N": [44]}},
}


def test_affixes_ladders_are_lists_ordered_richest_first(stub):
    stub({
        equipment.GROUP_TABLES[0]: GROUPS, equipment.GROUP_TABLES[1]: {},
        equipment.WORD_TABLE: WORDS,
    })
    result = equipment.affixes(None, {})
    weapon = result["bySlot"]["1"]

    # A list, not a mark-keyed object: write_json sorts keys, and stringified
    # numbers put "1000" before "550".
    assert weapon["normal"]["攻击"] == [[400, 153]], "Set 3 is a legacy tier and excluded"
    assert weapon["extraordinary"]["攻击"][0] == [1000, 382]
    assert [mark for mark, _ in weapon["extraordinary"]["攻击"]] == equipment.LIVE_EXTRAORDINARY_MARKS
    assert result["set"] == equipment.CURRENT_SET


def test_extraordinary_ladder_is_the_live_one_not_the_shipped_one(stub):
    stub({
        equipment.GROUP_TABLES[0]: GROUPS, equipment.GROUP_TABLES[1]: {},
        equipment.WORD_TABLE: WORDS,
    })
    weapon = equipment.affixes(None, {})["bySlot"]["1"]
    # The shipped 550 -> 210 rung is gone; the values are the ones read off live
    # gear: 攻击 382/357/332/308/283/258/233/208/183/159.
    assert weapon["extraordinary"]["攻击"] == [
        [1000, 382], [935, 357], [870, 332], [805, 308], [740, 283],
        [675, 258], [610, 233], [545, 208], [480, 183], [415, 159],
    ]


def test_live_extraordinary_ladder_rounds_half_up_and_needs_the_top_rung():
    # 技能增强 is the family whose values were read in game: 80/70/49/33 on
    # Marks 1000/870/610/415.
    ladder = equipment.live_extraordinary_ladder({1000: 80, 550: 44})
    assert ladder[1000] == 80 and ladder[870] == 70 and ladder[610] == 49 and ladder[415] == 33
    # 675 x 0.08 = 54 exactly, 545 x 0.08 = 43.6 -> 44.
    assert ladder[675] == 54 and ladder[545] == 44
    # Half rounds up the way the client's own rows do (750 x 0.382 = 286.5 -> 287),
    # which a float floor would get wrong: 1000 x 0.5 / 1000 lands on exactly .5.
    assert equipment.live_extraordinary_ladder({1000: 5})[805] == 4  # 4.025
    assert equipment.live_extraordinary_ladder({1000: 500})[805] == 403  # 402.5
    with pytest.raises(RuntimeError):
        equipment.live_extraordinary_ladder({950: 363})


def test_affixes_only_offers_a_slot_the_groups_flagged_for_it(stub):
    stub({
        equipment.GROUP_TABLES[0]: GROUPS, equipment.GROUP_TABLES[1]: {},
        equipment.WORD_TABLE: WORDS,
    })
    result = equipment.affixes(None, {})
    # 3991021 has Type7_1 = 0, so 帽子 must not offer it.
    assert "7" not in result["bySlot"]


def test_build_writes_the_payload_and_rejects_an_orphan_slot(stub, tmp_path):
    tables = {
        equipment.SLOT_TABLE: {"1": {"ID": 1, "Name": "武器", "OrderRandom": 1, "Season": [101]}},
        equipment.TYPE_TABLE: TYPES,
        equipment.PROFESSION_TABLE: PROFESSIONS,
        equipment.ITEM_TABLE: ITEMS,
        equipment.BRAND_TABLE: BRANDS,
        equipment.BODY_TABLE: BODIES,
        equipment.STAGE_TABLE: STAGES,
        equipment.STAGE_PROP_TABLE: STAGE_PROPS,
        equipment.SUIT_TIER_TABLE: {
            "1": {"ID": 1, "Type": 2, "Level": 1, "Mark": 1003, "RequireAvgPercent": 50, "SuitProp": {"Atk_N": 10}, "SuitAdditionDesc": "x"},
            "2": {"ID": 2, "Type": 1, "Level": 1, "Mark": 560, "Require": 1, "RequireLevel": 3, "RequirePromote": 8, "SuitProp": {"Atk_N": 80}},
        },
        equipment.SUIT_TABLE: {"101": {"ID": 101, "SuitName": "灵与知回响", "SuitNameAll": "[冒险]灵与知回响", "SuitTag": "冒险套装", "BeSuitNum": [2, 3], "SuitDesc1": "a", "SuitDesc2": "b"}},
        equipment.FORMULA_TABLE: FORMULAS,
        equipment.GROUP_TABLES[0]: GROUPS,
        equipment.GROUP_TABLES[1]: {},
        equipment.WORD_TABLE: WORDS,
    }
    stub(tables)
    counts = equipment.build(None, tmp_path)
    assert counts["items"] == 2 and counts["professions"] == 2 and counts["brands"] == 2

    payload = json.loads((tmp_path / equipment.OUT_FILE).read_text(encoding="utf-8"))
    assert payload["brands"][0]["effect"] == "怪物专攻提高150。", "client markup stripped"
    whole_body = next(t for t in payload["suits"]["tiers"] if t["type"] == 1)
    assert (whole_body["requiredStage"], whole_body["requiredPieces"]) == (3, 8)
    assert payload["suits"]["levelScores"] == {
        "1": {"perLevel": 201.0, "origin": 49},
        "2": {"perLevel": 323.0, "origin": 49},
    }
    assert {i["id"]: i["baseScore"] for i in payload["items"]} == {3001059: 2685, 3020623: 2430}
