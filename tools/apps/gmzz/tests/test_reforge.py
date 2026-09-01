"""The reforge-grace stage: condition arithmetic, unlock parsing, slot ordering."""

from __future__ import annotations

import json

import pytest

from gmzz import reforge


NAMES = {3991721: "攻击", 3991021: "攻击", 3991726: "技能增强", 3991026: "技能增强"}

# Two weapon graces and one armour one. `GroupCondition` shapes are the client's:
# a Lua table keyed `1` reaches the pipeline as a list, everything else as a dict.
ROWS = {
    "108": {
        "ID": 108, "Slot": 1, "Name": "征服宣言", "Score": 2000,
        "GroupCondition1": {"2": [3991721, 3991021]},
        "GroupCondition2": [[3991726, 3991026]],
        "Tag": ["普攻", "通用"], "Tag2": ["普攻", "通用"],
        "Prop1": [["Atk_N", 540]], "Prop2": [["Atk_N", 540]],
        "Brief1": "提高攻击540。", "Brief2": "提高攻击540。",
        "PassiveSkill1": [80003002], "PassiveSkill2": [80003002],
        "ShowCondition": {"RawInput": "SEASON_DAY(101)>=5"},
        "SeasonID": [101, 102], "Icon": "/Game/Arts/UI_2/x/Convergence_1_1_5.Convergence_1_1_5",
    },
    "113": {
        "ID": 113, "Slot": 1, "Name": "战刃", "Score": 1000,
        "GroupCondition1": {"2": [3991721, 3991021]},
        "GroupCondition2": {"0": [3991726, 3991026]},
        "Tag": ["输出", "通用"], "Tag2": ["输出", "通用"],
        "Prop1": [["Atk_N", 380]], "Prop2": {},
        "Brief1": "提高攻击380。", "Brief2": "提高攻击380。",
        "ShowCondition": {},
        "SeasonID": [101], "Icon": "/Game/Arts/UI_2/x/Convergence_1_1_2.Convergence_1_1_2",
    },
    "1203": {
        "ID": 1203, "Slot": 12, "Name": "丰饶乐土的呼唤", "Score": 3200,
        "GroupCondition1": {"3": [3991721, 3991021]},
        "GroupCondition2": {"1": [3991726, 3991026]},
        "Tag": ["防守", "副本"], "Tag2": ["防守", "副本"],
        "Prop1": {}, "Prop2": {},
        "Brief1": "提高最大生命4%。", "Brief2": "提高最大生命4%。",
        "PassiveSkill1": [80003100],
        "ShowCondition": {"RawInput": "SEASON_DAY(101)>=18"},
        "SeasonID": [101], "Icon": "/Game/Arts/UI_2/x/Convergence_1_5_1.Convergence_1_5_1",
    },
}

SLOTS = [
    {"ID": 1, "Name": "武器", "OrderRandom": 1, "OrderEnhance": 1},
    {"ID": 12, "Name": "护甲", "OrderRandom": 2, "OrderEnhance": 5},
    {"ID": 7, "Name": "帽子", "OrderRandom": 4, "OrderEnhance": 7},
]

GROUPS = {
    "a": {"ID": 3991721, "Des": "攻击"},
    "b": {"ID": 3991021, "Des": "攻击"},
    "c": {"ID": 3991726, "Des": "技能增强"},
    "d": {"ID": 3991026, "Des": "技能增强"},
}


def test_a_one_affix_condition_survives_the_lua_list_conversion():
    # `{1: ids}` arrives as `[ids]`. Read as a dict it would index from 0 and
    # turn every one-affix condition into a zero — silently, and consistently.
    assert reforge.conditions([[3991726, 3991026]], NAMES) == [
        {"count": 1, "groupIds": [3991726, 3991026], "stat": "技能增强"}
    ]


def test_a_zero_count_condition_is_kept():
    # 0 is meaningful: "3 attack and none of the other family" is a distinct row
    # from "3 attack", and pairs with a differently named grace.
    assert reforge.conditions({"0": [3991726, 3991026]}, NAMES) == [
        {"count": 0, "groupIds": [3991726, 3991026], "stat": "技能增强"}
    ]


def test_conditions_are_ordered_by_count_not_hash_order():
    value = {"3": [3991721, 3991021], "1": [3991726, 3991026]}
    assert [c["count"] for c in reforge.conditions(value, NAMES)] == [1, 3]


def test_a_condition_mixing_stat_families_is_an_error():
    with pytest.raises(RuntimeError, match="affix stats"):
        reforge.conditions({"2": [3991721, 3991726]}, NAMES)


def test_an_unresolvable_group_id_is_an_error_even_when_its_partner_resolves():
    # Naming the condition after the ids that did resolve would look like valid
    # output while `groupIds` carried a group nothing has a name for.
    with pytest.raises(RuntimeError, match="affix group"):
        reforge.conditions({"2": [3991721, 9999999]}, NAMES)


@pytest.mark.parametrize(
    "icon",
    ["/Game/Arts/UI_2/x/Convergence_1_1_5.Convergence_1_1_5"],
)
def test_icon_name_reads_the_object_path(icon):
    assert reforge._icon_name(icon) == "Convergence_1_1_5"


def test_icon_name_is_empty_for_an_empty_column():
    assert reforge._icon_name("") == ""


@pytest.mark.parametrize(
    "icon",
    [
        # A bare file path: splitting on the last dot would yield "png", so
        # every icon would collapse to its extension instead of failing.
        "UI/Icons/Convergence_1_1_5.png",
        "/Game/Arts/UI_2/x/Convergence_1_1_5.SomethingElse",
        "Convergence_1_1_5",
    ],
)
def test_icon_name_rejects_what_is_not_an_object_path(icon):
    with pytest.raises(RuntimeError, match="object path"):
        reforge._icon_name(icon)


def test_props_reads_a_list_and_normalises_the_empty_client_table():
    assert reforge._props([["Atk_N", 540]]) == [["Atk_N", 540]]
    assert reforge._props({}) == []
    assert reforge._props(None) == []


def test_props_rejects_a_non_empty_mapping_rather_than_reading_it_as_none():
    # This is how the column would look if the client moved to
    # `{statKey: amount}`; returning [] would blank every grace's stats.
    with pytest.raises(RuntimeError, match="non-empty dict"):
        reforge._props({"Atk_N": 540})


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("SEASON_DAY(101)>=5", {"kind": "seasonDay", "seasonId": 101, "day": 5}),
        # 999 is the client's "not scheduled this season" marker; it parses like
        # any other day rather than being special-cased away.
        ("SEASON_DAY(101)>=999", {"kind": "seasonDay", "seasonId": 101, "day": 999}),
    ],
)
def test_season_day_unlocks(raw, expected):
    assert reforge.unlock({"RawInput": raw}) == {**expected, "raw": raw}


def test_equipment_unlocks():
    raw = "GET_EQUIP_NUM_IN_GROUP({3010650,3020650})>=1"
    assert reforge.unlock({"RawInput": raw}) == {
        "kind": "equipment", "equipIds": [3010650, 3020650], "count": 1, "raw": raw,
    }


@pytest.mark.parametrize("value", [{}, None, {"RawInput": ""}])
def test_no_condition_is_none(value):
    assert reforge.unlock(value) is None


def test_an_unrecognised_condition_raises_rather_than_reading_as_unconditional():
    # A wiki showing "no requirement" because the pipeline failed to parse the
    # requirement is worse than a build that stops and says so.
    with pytest.raises(RuntimeError, match="unrecognised ShowCondition"):
        reforge.unlock({"RawInput": "PLAYER_LEVEL()>=40"})


@pytest.fixture
def stubbed(monkeypatch):
    tables = {
        reforge.GRACE_TABLE: ROWS,
        reforge.SLOT_TABLE: SLOTS,
        reforge.GROUP_TABLES[0]: GROUPS,
        reforge.GROUP_TABLES[1]: {},
    }
    monkeypatch.setattr(reforge, "load_strings", lambda excel: {})
    monkeypatch.setattr(reforge, "load_table", lambda excel, name: tables[name])
    monkeypatch.setattr(reforge, "resolve_text", lambda payload, strings: payload)


def _graces(data_out):
    path = data_out / reforge.OUT_SUBDIR / reforge.GRACES_FILE
    return json.loads(path.read_text(encoding="utf-8"))


def test_build_emits_one_row_per_grace_sorted_by_id(stubbed, tmp_path):
    assert reforge.build(tmp_path, tmp_path / "data") == (3, 2)
    payload = _graces(tmp_path / "data")
    assert [g["id"] for g in payload] == [108, 113, 1203], "sorted numerically, not as strings"


def test_extraordinary_count_is_the_sum_of_both_conditions(stubbed, tmp_path):
    reforge.build(tmp_path, tmp_path / "data")
    counts = {g["id"]: g["extraordinaryCount"] for g in _graces(tmp_path / "data")}
    # 2+1, 2+0, 3+1 — the client's own editor labels for these rows are
    # 恩赐词条-武器-3-1, -武器-2-2 and -护甲-4-1.
    assert counts == {108: 3, 113: 2, 1203: 4}


def test_icon_is_the_asset_name_and_empty_props_normalise_to_a_list(stubbed, tmp_path):
    reforge.build(tmp_path, tmp_path / "data")
    rows = {g["id"]: g for g in _graces(tmp_path / "data")}
    assert rows[108]["icon"] == "Convergence_1_1_5"
    assert rows[113]["prop2"] == [], "client writes {} for none"
    assert rows[113]["passiveSkillIds"] == [], "absent column, not an empty one"


def test_slots_are_limited_to_the_ones_with_graces_in_reforge_order(stubbed, tmp_path):
    reforge.build(tmp_path, tmp_path / "data")
    slots = json.loads((tmp_path / "data" / reforge.OUT_SUBDIR / reforge.SLOTS_FILE).read_text(encoding="utf-8"))
    # 帽子 has a slot row but no grace, so it is not offered as a filter.
    assert slots == [
        {"id": 1, "name": "武器", "order": 1},
        {"id": 12, "name": "护甲", "order": 2},
    ]


def test_a_grace_on_a_slot_with_no_slot_row_is_an_error(stubbed, tmp_path, monkeypatch):
    monkeypatch.setattr(reforge, "load_table", lambda excel, name: {
        reforge.GRACE_TABLE: ROWS,
        reforge.SLOT_TABLE: [SLOTS[0]],
        reforge.GROUP_TABLES[0]: GROUPS,
        reforge.GROUP_TABLES[1]: {},
    }[name])
    with pytest.raises(RuntimeError, match="no row for slot"):
        reforge.build(tmp_path, tmp_path / "data")
