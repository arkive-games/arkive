"""Tests for the card and pet emitter's shaping rules. No game needed."""

from __future__ import annotations

from pathlib import Path

from ro3 import export_cards_pets as cp


# --- which chunks the export reads ------------------------------------------------------


def test_only_the_wanted_data_configs_and_the_four_language_tables_are_selected():
    wanted = {"CardConfig", "PetBaseConfig"}
    assert cp._keep("LuaScript/Config/DataConfig/CardConfig.lua", wanted)
    assert cp._keep("LuaMultiverse/M101/Config/DataConfig/PetBaseConfig.lua", wanted)
    assert cp._keep(
        "Language/Resources/English/Script/LuaScript/Localization_en.lua", wanted
    )
    # A language the dataset does not carry, a table this stage does not own, and a UI class
    # whose name merely contains one.
    assert not cp._keep(
        "Language/Resources/Thai/Script/LuaScript/Localization_th.lua", wanted
    )
    assert not cp._keep("LuaScript/Config/DataConfig/SkillConfig.lua", wanted)
    assert not cp._keep("LuaScript/UI/Pet/Views/UI_Sys_Pet_RoleWidgetView.lua", wanted)


def test_the_base_copy_outranks_the_multiverse_copies():
    scripts = [
        "LuaMultiverse/M102/Config/DataConfig/CardConfig.lua",
        "LuaScript/Config/DataConfig/CardConfig.lua",
        "LuaMultiverse/M101/Config/DataConfig/CardConfig.lua",
    ]
    assert sorted(scripts, key=cp._variant_rank)[0].startswith("LuaScript/")


# --- row shaping ------------------------------------------------------------------------


def test_a_keyed_table_becomes_rows_in_id_order_and_gains_the_key_it_lacks():
    values = {"32005": {"_iQuality": 5}, "10001": {"_iID": 10001, "_iQuality": 3}}
    assert cp._as_rows(values) == [
        {"_iID": 10001, "_iQuality": 3},
        {"_iID": 32005, "_iQuality": 5},
    ]


def test_an_array_table_keeps_its_own_order_and_drops_non_rows():
    assert cp._as_rows([{"_iID": 2}, 7, {"_iID": 1}]) == [{"_iID": 2}, {"_iID": 1}]
    assert cp._as_rows(None) == []


def test_an_empty_lua_table_reads_as_empty_not_as_a_value():
    # Lua has one table type, so an empty list serializes as `{}` - every column that would
    # be a list has to read that as "no entries" rather than as a dict.
    assert cp.pairs({}) == [] and cp.ids({}) == []
    assert cp.pairs([[1, 2], [3, 4]]) == [[1, 2], [3, 4]]
    assert cp.ids([11000003, 11000004]) == [11000003, 11000004]
    # A flat list of ids must not be mistaken for pairs, nor pairs for ids.
    assert cp.pairs([1, 2]) == [] and cp.ids([[1, 2]]) == []


def test_a_picture_column_becomes_the_bare_object_name():
    assert cp.stem("pet_icon_head_32004.png") == "pet_icon_head_32004"
    assert cp.stem("") is None and cp.stem({}) is None


def test_a_table_of_xx_placeholders_is_recognised_as_an_authoring_stub():
    assert cp.is_stub([{"_iID": 1001, "_kAddCost": "xx", "_iLevel": 10}])
    assert not cp.is_stub([{"_iID": 1, "_kCost": [[1200500, 170]]}])
    assert not cp.is_stub([])


# --- text -------------------------------------------------------------------------------


def test_a_field_carries_only_the_languages_that_actually_have_it():
    text = cp.Text({
        "zh-CN": {"1": "疯兔卡片"},
        "en-US": {"1": "Lunatic Card"},
        "ko-KR": {},          # id absent
        "zh-TW": {"1": ""},   # present but empty
    })
    assert text([1]) == {"zh-CN": "疯兔卡片", "en-US": "Lunatic Card"}
    assert text.localized == 1 and text.fields == 1


def test_an_untranslated_slot_is_an_absence_rather_than_the_word_none():
    text = cp.Text({"en-US": {"1": "None"}, "zh-CN": {"1": "美杜莎"}})
    assert text([1]) == {"zh-CN": "美杜莎"}


def test_a_field_with_no_entry_anywhere_is_null_and_is_counted_as_unlocalized():
    text = cp.Text({"zh-CN": {}})
    assert text([10000000000]) is None
    assert text.fields == 1 and text.localized == 0
    # A column that is not a localized reference at all is not even counted.
    assert text([0]) is None and text({}) is None and text.fields == 1


def test_placeholders_are_rendered_from_desc_data_and_the_fields_own_arguments():
    text = cp.Text({"zh-CN": {"1": "造成^{1}${1}%^{2}的伤害"}})
    assert text([1, "<b>", "</b>"], ["160"]) == {"zh-CN": "造成<b>160%</b>的伤害"}
    assert not text.leftover


def test_a_placeholder_with_no_argument_behind_it_is_left_verbatim_and_counted():
    text = cp.Text({"zh-CN": {"1": "最多${8}层"}})
    assert text([1], ["2"]) == {"zh-CN": "最多${8}层"}
    assert dict(text.leftover) == {"zh-CN": 1}


# --- art --------------------------------------------------------------------------------


def test_art_names_route_each_picture_column_to_its_own_directory():
    rows = {
        "ItemConfig": [{"_iID": 1420100, "_kPic": "card_1420100.png"}],
        "CardConfig": [{"_iID": 1, "_iCardID": 1420100}],
        "AdventureCardConfig": [{"_iID": 1, "_kImage": ["2", "adventure_1460300.png"]}],
        "PetBaseConfig": [{"_iID": 10001, "_kHeadPic": "pet_icon_head_10001.png",
                           "_kBgPic": ""}],
        "CardBindingConfig": [{"_iID": 1, "_kBindPic": "card_img_bonds_green_000_${1}.png"}],
    }
    want, templates = cp.art_names(rows)
    assert want == {
        "card_1420100": "icons/cards",
        "adventure_1460300": "icons/cards",
        "pet_icon_head_10001": "icons/pets",
    }
    # A template is not rendered - nothing in the row supplies its argument.
    assert list(templates) == ["card_img_bonds_green_000_${1}"]


def test_the_art_index_joins_across_a_casing_difference(tmp_path: Path):
    # PetBaseConfig asks for pet_icon_gacha_101.png; the object is pet_icon_Gacha_101.
    (tmp_path / "icons/pets").mkdir(parents=True)
    (tmp_path / "icons/pets/pet_icon_Gacha_101.webp").write_bytes(b"")
    index = cp.ArtIndex(tmp_path)
    assert index.get("pet_icon_gacha_101") == "icons/pets/pet_icon_Gacha_101.webp"
    assert index.get("nothing") is None and index.get(None) is None


def test_the_art_index_lists_every_file_answering_to_a_template(tmp_path: Path):
    (tmp_path / "icons/cards").mkdir(parents=True)
    for name in ("crad_icon_type_01_b", "crad_icon_type_01_s", "crad_icon_type_02_b"):
        (tmp_path / f"icons/cards/{name}.webp").write_bytes(b"")
    index = cp.ArtIndex(tmp_path)
    assert index.variants("crad_icon_type_01_${1}.png") == [
        "icons/cards/crad_icon_type_01_b.webp",
        "icons/cards/crad_icon_type_01_s.webp",
    ]
    assert index.variants("card_1420100.png") == []
    assert index.variants(None) == []
