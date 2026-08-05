"""Contract tests for the avatar main-stat decode.

Read out of the live CN client tables on 2026-08-06. The point of pinning these is
that the avatar bonus was fan-site sourced until now, and the value set the client
turns out to carry -- ``{0.005, 0.01, 0.02}`` over four slots -- is exactly what the
fan site published. If a patch moves it, these fail rather than the calculator
silently drifting back to a hand-copied number.
"""

import pytest

from lostark import locales
from lostark.avatars import (
    ADDON_TYPE_STAT,
    AVATAR_ITEM_TYPE,
    COMBINED_CATEGORY,
    GRADES,
    MAIN_STAT_PERCENT_STATS,
    UI_KEYS,
    combined_slot,
    localization_keys,
    options,
    slot_name_suffixes,
    slots,
    stat_variants,
)
from lostark.db import Tables
from lostark.env import optional_dir

TABLES = optional_dir("LOSTARK_TABLES")

pytestmark = pytest.mark.skipif(
    TABLES is None or not TABLES.exists(), reason="LOSTARK_TABLES not set"
)


@pytest.fixture(scope="module")
def tables():
    return Tables(TABLES)


@pytest.fixture(scope="module")
def avatar_options(tables):
    return options(tables)


def test_four_slots_in_the_clients_own_words():
    assert [s["key"] for s in slots()] == ["head", "upper_body", "lower_body", "weapon"]
    assert [s["name_key"] for s in slots()] == [
        "tip.name.enum_equipslot_avatar_head",
        "tip.name.enum_equipslot_avatar_upper_body",
        "tip.name.enum_equipslot_avatar_lower_body",
        "tip.name.enum_equipslot_avatar_weapon",
    ]


def test_every_slot_offers_the_same_three_grades(avatar_options):
    by_slot: dict[str, list[int]] = {}
    for option in avatar_options:
        by_slot.setdefault(str(option["slot_key"]), []).append(int(option["grade"]))
    assert set(by_slot) == {"head", "upper_body", "lower_body", "weapon"}
    for grades in by_slot.values():
        assert grades == [2, 3, 4]


def test_the_amp_ladder_is_the_fan_sites_value_set(avatar_options):
    """0.5% / 1% / 2% by grade, identical in all four slots.

    This is the whole decode: the fan site's ``avatarAmp`` keyed tier *names* to
    ``{0.005, 0.01, 0.02}``, and the client's ``AddonValue00`` is ``{50, 100, 200}``
    at the 1e4 divisor every rate in this dataset uses.
    """
    expected = {2: 0.005, 3: 0.01, 4: 0.02}
    for option in avatar_options:
        assert option["amp"] == expected[int(option["grade"])], option


def test_grades_are_rare_epic_legend_and_nothing_else():
    assert [(g["grade"], g["key"], g["name_key"]) for g in GRADES] == [
        (2, "rare", "tip.name.enum_itemgrade_rare"),
        (3, "epic", "tip.name.enum_itemgrade_epic"),
        (4, "legend", "tip.name.enum_itemgrade_legend"),
    ]


def test_each_group_is_a_real_population_not_a_stray_row(avatar_options):
    assert all(int(option["items"]) >= 4 for option in avatar_options)
    assert sum(int(option["items"]) for option in avatar_options) > 25_000


def test_only_the_three_main_stat_percentage_ids_appear(avatar_options):
    for option in avatar_options:
        assert set(option["stats"]) <= set(MAIN_STAT_PERCENT_STATS)  # type: ignore[arg-type]


def test_stat_ids_789_split_the_roster_into_str_agi_int(tables):
    """The empirical half of "7/8/9 are Str%/Agi%/Int%".

    An avatar names exactly one class, so grouping the classes by the addon stat has
    to reproduce the three main-stat families. Checked with one unambiguous member of
    each rather than the whole list, which shifts as classes ship.
    """
    variants = stat_variants(tables)
    assert set(variants) == set(MAIN_STAT_PERCENT_STATS)
    assert "Berserker" in variants[7]
    assert "Blade" in variants[8]
    assert "Bard" in variants[9]
    # No class may appear under two stats: a class has one main stat.
    seen: dict[str, int] = {}
    for stat, names in variants.items():
        for name in names:
            assert name not in seen, (name, stat, seen.get(name))
            seen[name] = stat


def test_combined_garment_is_exactly_upper_plus_lower(tables):
    """Why the slot list has four entries and not five.

    Category 90107 is the 上下装 garment; it grants 2% at epic where upper and lower
    grant 1% each, so it is representable and offering it as a slot would only let a
    user count the same 2% twice. :func:`combined_slot` asserts the equality; this
    pins the numbers it asserts on.
    """
    combined = combined_slot(tables)
    assert combined["category"] == COMBINED_CATEGORY
    assert combined["grade"] == 3
    assert combined["amp"] == 0.02
    assert combined["equivalent_to"] == ["upper_body-3", "lower_body-3"]


def test_slot_name_suffixes_match_the_items_own_names(tables):
    """Signal 3 behind the Category -> slot mapping, re-derived.

    No table maps ``Item.Category`` to an equip slot, so the mapping rests on four
    agreeing signals. This one is textual and therefore the easiest to re-check: a
    head avatar's zh-CN name carries 头部 and its slot label is 头部外观.

    Containment rather than a suffix match, because a variant tags itself after the
    slot word (上装-特别款, 上装[2号]).
    """
    suffixes = slot_name_suffixes()
    names = locales.resolve(tables, [s["name_key"] for s in slots()])["zh-CN"]
    for slot in slots():
        label = names[str(slot["name_key"])]
        assert label.startswith(suffixes[str(slot["key"])]), (slot, label)

    with tables.connect("Item") as con:
        samples = {
            "head": 90101,
            "upper_body": 90102,
            "lower_body": 90103,
        }
        for key, category in samples.items():
            ids = [
                row[0]
                for row in con.execute(
                    "SELECT Name FROM Item WHERE Type = ? AND Category = ? LIMIT 25",
                    (AVATAR_ITEM_TYPE, category),
                )
            ]
            resolved = locales.resolve(tables, ids, missing="skip")["zh-CN"]
            assert resolved, category
            assert all(suffixes[key] in text for text in resolved.values()), key


def test_addon_type_is_a_stat_add():
    assert ADDON_TYPE_STAT == 2


def test_localization_keys_cover_slots_grades_and_the_panel_title():
    keys = localization_keys()
    assert set(UI_KEYS.values()) <= set(keys)
    assert "tip.name.enum_equipslot_avatar_weapon" in keys
    assert "tip.name.enum_itemgrade_legend" in keys
    assert keys == sorted(set(keys))


def test_every_key_resolves_in_both_locales(tables):
    names = locales.resolve(tables, localization_keys())
    assert set(names) == {"zh-CN", "ko-KR"}
    for locale, table in names.items():
        missing = [k for k in localization_keys() if not table.get(k, "").strip()]
        assert not missing, (locale, missing)
