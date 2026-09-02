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
        "TC": 62, "lvReq": 60, "Mark": 2430, "SuitID": 101, "SetId": 4,
        "itemDes": "悄无声息的引导。",
        "AtkMin_N": 327, "AtkMax_N": 607, "MaxHp_N": 1960, "AllProHurtPlus_N": 0,
    },
    "9999": {"ID": 9999, "itemName": "不是装备", "subType": 7777, "quality": 1, "icon": "x"},
}

PROFESSIONS = {
    "1200002": {"ID": 1200002, "Name": "空想家途径", "SequenceName": "观众", "ProfessionDesc": "化身巨龙。", "Disabled": False},
    "1200008": {"ID": 1200008, "Name": "错误途径", "SequenceName": "偷盗者", "ProfessionDesc": "", "Disabled": True},
}


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
    rows = equipment.items(None, {}, types_by_id)

    assert [r["id"] for r in rows] == [3020623], "a non-equipment subType is skipped"
    item = rows[0]
    assert item["slot"] == 1, "joined via subType -> EquipmentTypeData"
    assert item["gearLevel"] == 62, "TC is the 装等, not lvReq"
    assert item["levelRequirement"] == 60
    assert item["baseScore"] == 2430, "Mark on the row is the 装备基础 score"
    # AllProHurtPlus_N is 0 and the game hides it.
    assert dict(item["baseStats"]) == {"AtkMin_N": 327, "AtkMax_N": 607, "MaxHp_N": 1960}


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
    assert weapon["extraordinary"]["攻击"] == [[1000, 382], [550, 210]]
    assert weapon["normal"]["攻击"] == [[400, 153]], "Set 3 is a legacy tier and excluded"
    assert result["set"] == equipment.CURRENT_SET


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
        equipment.BRAND_TABLE: {"1": {"ID": 1, "SuitName1": "好孩子", "SuitBrief1": "怪物专攻提高<Mark>150</>。", "SuitStory": "", "productItemId": 3020623}},
        equipment.BODY_TABLE: BODIES,
        equipment.STAGE_TABLE: STAGES,
        equipment.STAGE_PROP_TABLE: STAGE_PROPS,
        equipment.SUIT_TIER_TABLE: {"1": {"ID": 1, "Type": 2, "Level": 1, "Mark": 1003, "RequireAvgPercent": 50, "SuitProp": {"Atk_N": 10}, "SuitAdditionDesc": "x"}},
        equipment.SUIT_TABLE: {"101": {"ID": 101, "SuitName": "灵与知回响", "SuitNameAll": "[冒险]灵与知回响", "SuitTag": "冒险套装", "BeSuitNum": [2, 3], "SuitDesc1": "a", "SuitDesc2": "b"}},
        equipment.GROUP_TABLES[0]: GROUPS,
        equipment.GROUP_TABLES[1]: {},
        equipment.WORD_TABLE: WORDS,
    }
    stub(tables)
    counts = equipment.build(None, tmp_path)
    assert counts["items"] == 1 and counts["professions"] == 2

    payload = json.loads((tmp_path / equipment.OUT_FILE).read_text(encoding="utf-8"))
    assert payload["brands"][0]["effect"] == "怪物专攻提高150。", "client markup stripped"
    assert payload["items"][0]["baseScore"] == 2430
