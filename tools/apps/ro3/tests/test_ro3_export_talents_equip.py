"""Tests for the talent/equipment export's pure decisions.

The three that matter: a table whose ``m_kValues`` is a Lua *sequence* must still be keyed
by the row's own id (get that wrong and ``SeasonTalent`` node 1 becomes node 5 in half the
joins); the keys-only detection must distinguish "no fields" from "all fields default",
because ten ``Equip*`` tables depend on it to be reported as gaps; and the art selection
regex must match the sprites the rows name and nothing else, since ``^item_`` would drag a
thousand unrelated item icons into ``icons/equipment``.
"""

from __future__ import annotations

import re

import pytest

from ro3 import export_talents_equip as ex
from ro3.lua_tables import LuaError


def test_table_rows_keys_a_sequence_by_the_rows_own_id():
    table = {"m_kValues": [{"id": 7, "type": 1}, {"id": 3, "type": 2}], "m_kCount": 2}
    assert ex.table_rows(table) == {"7": {"id": 7, "type": 1}, "3": {"id": 3, "type": 2}}


def test_table_rows_falls_back_to_position_when_a_sequence_row_has_no_id():
    table = {"m_kValues": [[8769], [17474]], "m_kCount": 2}
    assert ex.table_rows(table) == {"1": [8769], "2": [17474]}


def test_table_rows_passes_a_map_through():
    table = {"m_kValues": {"2550562": {"_iID": 2550562}}}
    assert ex.table_rows(table) == {"2550562": {"_iID": 2550562}}


def test_table_rows_refuses_a_table_that_is_not_a_config_table():
    with pytest.raises(LuaError):
        ex.table_rows({"something": "else"})


def test_keys_only_is_true_when_every_row_body_is_empty():
    assert ex.keys_only({"60555001": {}, "60555002": {}})


def test_keys_only_is_false_when_any_row_carries_a_field():
    assert not ex.keys_only({"1": {}, "2": {"_iID": 2}})


def test_keys_only_is_false_for_an_empty_table():
    """An absent table is not the same claim as a table shipping ids with no bodies."""
    assert not ex.keys_only({})


def test_slot_slug_comes_out_of_the_grid_sprite_name():
    assert ex.SLOT_FROM_ICON.match("icon_equip_weapon_01").group("slot") == "weapon"
    assert ex.SLOT_FROM_ICON.match("icon_equip_accessory_01").group("slot") == "accessory"
    assert ex.SLOT_FROM_ICON.match("icon_equip_001") is None


def test_pair_ids_reads_the_leading_id_of_each_pair():
    assert ex.pair_ids([[101, 8190, 8190], [105, 114]]) == [101, 105]
    assert ex.pair_ids([50303]) == [50303]
    assert ex.pair_ids({}) == []


def test_flat_ids_ignores_anything_that_is_not_an_int():
    assert ex.flat_ids([16520001, "x", None]) == [16520001]
    assert ex.flat_ids(0) == []


def test_sprite_names_strips_the_extension_and_drops_the_blanks():
    assert ex.sprite_names("item_2550530.png", "", None, "icon_talent_x.png") == {
        "item_2550530", "icon_talent_x"
    }


def test_art_categories_match_only_the_named_sprites():
    categories = ex.art_categories({"item_2550530"}, {"patronlevel_icon_920"})
    equipment, talents = categories
    assert equipment.out == "icons/equipment"
    assert talents.out == "icons/talents"
    assert equipment.regex.search("item_2550530")
    assert not equipment.regex.search("item_2550531")
    assert not equipment.regex.search("item_2550530_extra")
    assert talents.regex.search("patronlevel_icon_920")


def test_art_categories_are_dropped_when_nothing_is_missing():
    assert ex.art_categories(set(), set()) == ()


def test_art_category_pattern_escapes_regex_metacharacters():
    """A sprite name is a literal, so a name carrying '.' must not match any character."""
    (category,) = ex.art_categories({"item_a.b"}, set())
    assert category.regex.search("item_a.b")
    assert not category.regex.search("item_axb")


def test_sort_key_orders_numeric_ids_numerically():
    assert ex.ordered({"10": {}, "9": {}, "100": {}}) == ["9", "10", "100"]


def test_sort_key_keeps_non_numeric_keys_after_the_numbers():
    assert ex.ordered({"b": {}, "2": {}}) == ["2", "b"]


def test_wanted_accepts_the_export_tables_and_the_language_tables():
    assert ex.is_wanted("Assets/Script/LuaScript/Config/DataConfig/EquipConfig.lua")
    assert ex.is_wanted("Assets/Script/LuaMultiverse/M101/Config/DataConfig/SeasonTalent.lua")
    assert ex.is_wanted("Assets/Script/LuaScript/Localization_zh_CN.lua")
    assert not ex.is_wanted("Assets/Script/LuaScript/Config/DataConfig/SceneConfig.lua")
    assert not ex.is_wanted("Assets/Script/LuaScript/Logic/SeasonTalent/Helper.lua")


def test_every_expected_keys_only_table_is_actually_read():
    """A gap can only be reported for a table the export loads."""
    assert set(ex.EXPECTED_KEYS_ONLY) <= set(ex.WANTED_TABLES)


def test_icon_path_matches_case_insensitively():
    """The art export lowercases file names; the config columns do not."""
    icons = {"icon_talent_common_attack": "icons/talents/icon_talent_common_attack.webp"}
    assert ex.icon_path(icons, "icon_talent_common_Attack.png") == (
        "icons/talents/icon_talent_common_attack.webp"
    )
    assert ex.icon_path(icons, "") is None
    assert ex.icon_path(icons, 0) is None


def test_placeholder_family_is_the_one_localization_implements():
    """Guards the note in equipment.json/talents.json against the module drifting."""
    from ro3 import localization

    template = "gain ${1}% for ^{1}@{1} seconds"
    assert isinstance(localization.PLACEHOLDER, re.Pattern)
    assert localization.render(template, ["A", "9"], ["55"]) == "gain 55% for A9 seconds"
