from copy import deepcopy

import pytest

from gmzz.history_research import build_history_research, build_research_rewards


def sample():
    return (
        [{"PropID": 2, "Rank": 1, "SubRank": 2, "Name": " Second ", "Score": 30, "Mark": 941},
         {"PropID": 1, "Rank": 1, "SubRank": 1, "Name": "First", "Score": 1, "Mark": 165}],
        [{"Power_N": 3}, {"Power_N": 15, "Attack_P": 0.005}],
        {"1": {"PropMode": "Power_N", "PropName": "Power", "ShowType": 0},
         "2": {"PropMode": "PhysicalAttack_P", "PropName": "Physical attack", "ShowType": 1},
         "3": {"PropMode": "MagicAttack_P", "PropName": "Magic attack", "ShowType": 1}},
        {"4": {"Prop": "Attack_P", "Discription": "Attack", "PropNameSet": ["PhysicalAttack_P", "MagicAttack_P"]}},
    )


def test_rank_properties_are_joined_by_id_not_input_order():
    ranks = build_history_research(*sample())
    assert [rank["id"] for rank in ranks] == [1, 2]
    assert ranks[0]["attributes"] == [{"key": "Power_N", "name": "Power", "value": 3, "format": "number"}]
    assert ranks[1]["attributes"][0] == {"key": "Attack_P", "name": "Attack", "value": 0.005, "format": "percent"}
    assert ranks[1]["name"] == "Second"


def test_named_and_positional_rank_tables_match():
    ranks, props, modes, groups = sample()
    assert build_history_research({str(i): r for i, r in enumerate(ranks)}, props, modes, groups) == build_history_research(ranks, props, modes, groups)


def test_noncontiguous_properties_are_rejected():
    ranks, _, modes, groups = sample()
    with pytest.raises(ValueError, match="contiguous"):
        build_history_research(ranks, {"1": {}}, modes, groups)


@pytest.mark.parametrize("prop_id", [0, 3, 1])
def test_missing_or_duplicate_property_ids_are_rejected(prop_id):
    ranks, props, modes, groups = deepcopy(sample())
    ranks[0]["PropID"] = prop_id
    with pytest.raises(ValueError, match="PropID"):
        build_history_research(ranks, props, modes, groups)


def test_unknown_attributes_do_not_leak_internal_names():
    ranks, props, modes, groups = sample()
    props[0]["Unknown"] = 12
    with pytest.raises(ValueError, match="Missing research attribute metadata"):
        build_history_research(ranks, props, modes, groups)


def test_mixed_group_formats_are_rejected():
    ranks, props, modes, groups = sample()
    modes["3"]["ShowType"] = 0
    with pytest.raises(ValueError, match="Inconsistent display"):
        build_history_research(ranks, props, modes, groups)


def test_display_type_not_suffix_decides_percentage():
    ranks, props, modes, groups = sample()
    modes["1"]["ShowType"] = 1
    assert build_history_research(ranks, props, modes, groups)[0]["attributes"][0]["format"] == "percent"


def test_unknown_display_format_is_rejected():
    ranks, props, modes, groups = sample()
    modes["1"]["ShowType"] = 2
    with pytest.raises(ValueError, match="Unknown attribute display"):
        build_history_research(ranks, props, modes, groups)


def test_relation_rewards_keep_each_tier_value_without_accumulating_it():
    grades = [{"grade": n, "name": f"Tier {n}"} for n in range(6)]
    rewards = build_research_rewards([16, 16, 16, 16, 16, 32], grades)
    assert [r["value"] for r in rewards] == [16, 16, 16, 16, 16, 32]
    assert rewards[-1] == {"grade": 5, "gradeName": "Tier 5", "value": 32}


@pytest.mark.parametrize("values", [{}, None, [16]])
def test_incomplete_relation_rewards_fail(values):
    with pytest.raises(ValueError, match="Incomplete"):
        build_research_rewards(values, [{"grade": n, "name": str(n)} for n in range(6)])


def test_noncontiguous_grades_cannot_shift_rewards():
    with pytest.raises(ValueError, match="zero-based"):
        build_research_rewards([1, 2], [{"grade": 1, "name": "First"}, {"grade": 2, "name": "Last"}])
