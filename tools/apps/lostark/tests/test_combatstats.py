"""Contract tests for BattlePoint Type 26 (``battlestat``) and the six combat traits.

Read out of the live CN client tables on 2026-08-06. Type 26 was one of the nine
undecoded Types; the numbers pinned here are the evidence that it is the combat-trait
table -- three traits at 0.0003 for a damage dealer and two at 0.0004 for a support,
which are the fan site's own rates and its own per-role split.
"""

import pytest

from lostark import locales
from lostark.battlepoint import DPS, SUPPORT, extract
from lostark.combatstats import (
    BP_BATTLE_STAT,
    STATS,
    UI_KEYS,
    localization_keys,
    rates,
    stats,
    verify_stat_ids,
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
def trait_rates(tables):
    return rates(tables)


def test_type_26_is_the_battlestat_type():
    assert BP_BATTLE_STAT == 26


def test_the_enum_has_a_battlestat_member_and_no_avatar_one(tables):
    """The bijection's two load-bearing facts, checked against GameMsg.

    ``battlestat`` existing is what lets Type 26 be named at all. ``avatar`` *not*
    existing is why looking for the avatar bonus in BattlePoint was hopeless, and is
    recorded here so a future patch adding one shows up as a failure.
    """
    with tables.connect("GameMsg") as con:
        members = {
            key
            for (key,) in con.execute(
                'SELECT KEY FROM "GameMsg_Chinese" WHERE KEY LIKE ?',
                ("tip.name.enum_battlepointtype_%",),
            )
        }
    assert "tip.name.enum_battlepointtype_battlestat" in members
    assert not [k for k in members if "avatar" in k]
    # 35 names for the 35 slots 0..34 is what makes the mapping a bijection. Three
    # slots carry no rows -- 0 (``none``), 18 (accessory grinding's support heal
    # channel) and 32 (the ark-grid gem one) -- so the table shows 32 Types with 34
    # as the largest, which is exactly what the enum's size predicts.
    assert len(members) == 35
    with tables.connect("BattlePoint") as con:
        types = {row[0] for row in con.execute("SELECT DISTINCT Type FROM BattlePoint")}
    assert max(types) == len(members) - 1
    assert set(range(len(members))) - types == {0, 18, 32}


def test_six_traits_in_the_clients_order():
    assert [s["key"] for s in stats()] == [
        "criticalhit",
        "specialty",
        "oppression",
        "rapidity",
        "endurance",
        "mastery",
    ]
    assert [s["index"] for s in stats()] == [1, 2, 3, 4, 5, 6]
    assert [s["stat"] for s in stats()] == [15, 16, 17, 18, 19, 20]


def test_arkpassive_nodes_anchor_the_trait_index(tables):
    """The 1..6 index is the client's, not ours.

    ``ArkPassive`` node ``10101<n>00`` is named after trait ``n`` and grants global
    stat ``14 + n``. That is the only place the extraction ties the small index to a
    named trait, so Type 26's ``ValueA`` is readable only as long as it holds.
    """
    assert verify_stat_ids(tables) == {1: 15, 2: 16, 3: 17, 4: 18, 5: 19, 6: 20}


def test_damage_dealers_score_crit_specialty_swiftness(trait_rates):
    assert trait_rates[DPS] == {"1": 0.0003, "2": 0.0003, "4": 0.0003}


def test_supports_score_specialty_and_swiftness_only(trait_rates):
    assert trait_rates[SUPPORT] == {"2": 0.0004, "4": 0.0004}


def test_no_role_scores_oppression_endurance_or_mastery(trait_rates):
    for role in (DPS, SUPPORT):
        assert not {"3", "5", "6"} & set(trait_rates[role])


def test_the_client_carries_no_base_trait_total(tables):
    """The fan site's ``COMBAT_STAT.base = 2160`` is its own.

    Every Type 26 row leaves ``ValueC`` at zero, so BattlePoint holds a per-point rate
    and nothing else. Pinned because it is the one number of this system that stays
    unsourced, and because a patch adding a base would change the score materially.
    """
    with tables.connect("BattlePoint") as con:
        extras = {
            (row[0], row[1])
            for row in con.execute(
                "SELECT ValueC, ValueD FROM BattlePoint WHERE Type = ?", (BP_BATTLE_STAT,)
            )
        }
    assert extras == {(0, 0)}


def test_battlepoint_extract_exposes_the_rates(tables):
    coeffs = extract(tables)
    assert coeffs[DPS]["combat_stat_rates"] == {"1": 0.0003, "2": 0.0003, "4": 0.0003}
    assert coeffs[SUPPORT]["combat_stat_rates"] == {"2": 0.0004, "4": 0.0004}


def test_localization_keys_cover_the_six_names_and_the_title():
    keys = localization_keys()
    assert set(UI_KEYS.values()) <= set(keys)
    assert len(keys) == len(STATS) + len(UI_KEYS)
    assert keys == sorted(set(keys))


def test_every_key_resolves_in_both_locales(tables):
    names = locales.resolve(tables, localization_keys())
    assert set(names) == {"zh-CN", "ko-KR"}
    for locale, table in names.items():
        missing = [k for k in localization_keys() if not table.get(k, "").strip()]
        assert not missing, (locale, missing)
    assert names["zh-CN"]["tip.name.enum_stattype_criticalhit"] == "会心"
    assert names["ko-KR"]["tip.name.enum_stattype_criticalhit"] == "치명"
