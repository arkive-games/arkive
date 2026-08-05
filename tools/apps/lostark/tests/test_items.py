"""Contract tests for gear names, grades and set labels.

Expected values were read out of EFTable_Item / EFTable_ItemAssembly on
2026-08-06. The fixed points are the item-level-1640 ancient family (荣誉烙印 /
명예의 낙인) and the Esther weapons, which are the two ends of the grade range.
"""

import pytest

from lostark.db import Tables
from lostark.env import optional_dir
from lostark.items import extract, localization_keys
from lostark.itemlevel import extract as extract_levels
from lostark.locales import LOCALES, resolve

TABLES = optional_dir("LOSTARK_TABLES")

pytestmark = pytest.mark.skipif(
    TABLES is None or not TABLES.exists(), reason="LOSTARK_TABLES not set"
)

# Berserker: the default class, and one of the 13 that wear the Str armour line.
BERSERKER = "102"
BARD = "204"
WEAPON_1640 = "11152500"
SET_1640 = "1115251"
ESTHER_WEAPON = "21110000"
ARMOUR_SLOTS = 5


@pytest.fixture(scope="module")
def tables():
    return Tables(TABLES)


@pytest.fixture(scope="module")
def data(tables):
    return extract(tables)


@pytest.fixture(scope="module")
def names(tables, data):
    return resolve(tables, localization_keys(data), missing="skip")


def test_every_stat_template_is_named(data, tables):
    """The 68 ItemLevelOption templates all join to at least one item."""
    templates = {str(row["PrimaryKey"]) for row in tables.read("ItemLevelOption")}
    named = set(data["weapons"]) | {
        template
        for template in templates
        if template[:7] in data["sets"] and template[7] != "0"
    }
    assert data["unnamed"] == []
    assert named == templates


def test_weapon_names_are_one_per_class(data):
    for template, weapon in data["weapons"].items():
        # 29 released classes, each with exactly one weapon of the template.
        assert len(weapon["names"]) == 29, template
        for class_id, keys in weapon["names"].items():
            assert len(keys) == 1, (template, class_id)


def test_weapon_name_resolves_to_the_game_string(data, names):
    key = data["weapons"][WEAPON_1640]["names"][BERSERKER][0]
    assert names["zh-CN"][key] == "荣誉烙印大剑"
    assert names["ko-KR"][key] == "명예의 낙인 대검"


def test_esther_weapons_are_individually_named(data, names):
    """Grade 7 weapons share no series prefix — each is its own named weapon."""
    weapon = data["weapons"][ESTHER_WEAPON]
    assert weapon["grade"] == 7
    assert names["zh-CN"][weapon["names"][BERSERKER][0]] == "山之浩劫"
    assert names["zh-CN"][weapon["names"][BARD][0]] == "魔音"


def test_grades_map_to_the_item_grade_enum(data):
    assert data["grades"] == {
        "5": "tip.name.enum_itemgrade_relic",
        "6": "tip.name.enum_itemgrade_ancient",
        "7": "tip.name.enum_itemgrade_esther",
    }


def test_grade_matches_the_family(data):
    # 1015901 is the T4 relic family, 1115251 ancient.
    assert data["sets"]["1015901"]["grade"] == 5
    assert data["sets"][SET_1640]["grade"] == 6


def test_set_key_is_the_clients_own_category_name(data, names):
    """The craftable families carry ItemAssembly's category name; relic does not."""
    ancient = data["sets"][SET_1640]
    assert ancient["set_key"] == "sys.itemassembly.category_equip_s3_t3_ancient_2"
    assert names["zh-CN"][ancient["set_key"]] == "荣誉烙印装备"
    assert data["sets"]["1015901"]["set_key"] is None


def test_each_set_series_covers_the_five_armour_slots(data):
    for group, entry in data["sets"].items():
        assert entry["series"], group
        for class_id, series in entry["series"].items():
            for keys in series:
                assert len(keys) == ARMOUR_SLOTS, (group, class_id)
                assert len(set(keys)) == ARMOUR_SLOTS, (group, class_id)


def test_sets_partition_the_29_classes_by_armour_line(data):
    """Str / Agi / Int lines of one family: 13 + 9 + 7 classes, no overlap."""
    families = {}
    for group, entry in data["sets"].items():
        families.setdefault(group[:6], []).append(set(entry["series"]))
    for family, lines in families.items():
        assert sorted(len(line) for line in lines) == [7, 9, 13], family
        assert len(set.union(*lines)) == 29, family


def test_set_label_prefix_is_non_empty_in_every_locale(data, names):
    """The set label is the common prefix of a series' five piece names.

    The client names pieces, not sets, so this prefix IS the derivation the
    frontend renders. It has to be non-empty in every locale or the label
    silently collapses to nothing.
    """
    for locale in LOCALES:
        table = names[locale]
        for group, entry in data["sets"].items():
            for class_id, series in entry["series"].items():
                for keys in series:
                    resolved = [table[key] for key in keys]
                    prefix = _common_prefix(resolved)
                    assert prefix.strip(), (locale, group, class_id, resolved)


def test_duplicate_gear_copies_collapse_to_one_series(data):
    """A family ships bound and tradable copies that reuse one set of names.

    Item ids 13451111xx and 13451311xx are different items with identical name
    keys; keeping both would list 宿命决断 twice in the same selector.
    """
    for group, entry in data["sets"].items():
        for class_id, series in entry["series"].items():
            tuples = [tuple(keys) for keys in series]
            assert len(tuples) == len(set(tuples)), (group, class_id)
    assert len(data["sets"]["1015901"]["series"][BERSERKER]) == 2


def test_relic_set_label_is_the_series_name(data, names):
    series = data["sets"]["1015901"]["series"][BERSERKER]
    labels = {
        _common_prefix([names["zh-CN"][key] for key in keys]).strip() for keys in series
    }
    # The relic family carries two series over one stat template.
    assert labels == {"宿命决断", "疯狂决断"}


def test_every_name_key_resolves_in_every_locale(data, names):
    keys = localization_keys(data)
    assert len(keys) > 1000
    for locale in LOCALES:
        blank = [key for key in keys if not (names[locale].get(key) or "").strip()]
        assert blank == []


def test_templates_line_up_with_the_stat_table(data):
    """Every set group and weapon id is selectable at some item level."""
    gear = extract_levels(Tables(TABLES))
    weapons, groups = set(), set()
    for pieces in gear.values():
        for piece_id, piece in pieces.items():
            if piece.get("weapon_attack") is not None:
                weapons.add(piece_id)
            else:
                groups.add(piece_id[:7])
    assert set(data["weapons"]) == weapons
    assert set(data["sets"]) == groups


def _common_prefix(values: list[str]) -> str:
    if not values:
        return ""
    low, high = min(values), max(values)
    size = 0
    while size < len(low) and size < len(high) and low[size] == high[size]:
        size += 1
    return low[:size]
