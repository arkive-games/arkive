"""Contract tests for the BattlePoint extraction.

The expected values were read out of the live CN client tables on 2026-08-02, so
these double as a tripwire: a game patch that shifts the data fails here rather
than silently producing wrong combat power in the UI.
"""

import pytest

from lostark.battlepoint import DPS, SUPPORT, extract
from lostark.db import Tables
from lostark.env import optional_dir

TABLES = optional_dir("LOSTARK_TABLES")

pytestmark = pytest.mark.skipif(
    TABLES is None or not TABLES.exists(), reason="LOSTARK_TABLES not set"
)


@pytest.fixture(scope="module")
def coeffs():
    return extract(Tables(TABLES))


def test_base_rates(coeffs):
    assert coeffs[DPS]["base_rate"] == pytest.approx(0.000288)
    assert coeffs[SUPPORT]["base_rate"] == pytest.approx(0.000124)


def test_heal_rate_is_support_only(coeffs):
    assert coeffs[SUPPORT]["heal_rate"] == pytest.approx(0.0012)
    assert "heal_rate" not in coeffs[DPS]


def test_combat_level_is_a_table_not_a_constant(coeffs):
    # The fan site hardcodes only level 70 and calls it a formula constant.
    dps = coeffs[DPS]["combat_level_amp"]
    assert set(dps) == {str(lv) for lv in range(55, 71)}
    assert dps["70"] == pytest.approx(0.2945)
    assert dps["55"] == pytest.approx(0.0895)
    assert coeffs[SUPPORT]["combat_level_amp"]["70"] == pytest.approx(0.0476)


def test_growth_rates_differ_by_role(coeffs):
    assert coeffs[DPS]["evolution_rate"] == pytest.approx(0.0075)
    assert coeffs[SUPPORT]["evolution_rate"] == pytest.approx(0.016)
    assert coeffs[DPS]["enlightenment_rate"] == pytest.approx(0.007)
    assert coeffs[SUPPORT]["enlightenment_rate"] == pytest.approx(0.0072)
    assert coeffs[DPS]["leap_rate"] == pytest.approx(0.002)
    assert coeffs[SUPPORT]["leap_rate"] == pytest.approx(0.002)


def test_leap_karma_is_dps_only(coeffs):
    assert coeffs[DPS]["leap_karma_rate"] == pytest.approx(0.0002)
    assert "leap_karma_rate" not in coeffs[SUPPORT]


def test_ark_core_values_are_keyed_by_core_id_then_points(coeffs):
    cores = coeffs[DPS]["ark_core_values"]
    assert len(cores) > 100
    assert all(k.isdigit() and 673_000_000 < int(k) < 674_000_000 for k in cores)
    points = next(iter(cores.values()))
    assert all(p.isdigit() for p in points)


def test_both_roles_are_populated(coeffs):
    assert set(coeffs) == {DPS, SUPPORT}
    for role in (DPS, SUPPORT):
        assert coeffs[role]["combat_level_amp"], role
        assert coeffs[role]["ark_core_values"], role


def test_weapon_quality_is_a_table_and_dps_only(coeffs):
    """The fan site fits (10 + 0.002*q^2)/100 to this table; the fit is inexact.

    It agrees at only 21 of 101 quality values, deviating by up to 0.0599% of the
    amp -- above the fan site's own stated +/-0.01% tolerance. The table wins.
    """
    quality = coeffs[DPS]["weapon_quality_amp"]
    assert set(quality) == {str(q) for q in range(101)}
    assert quality["0"] == pytest.approx(0.1)
    assert quality["100"] == pytest.approx(0.3)
    # Points where the fan site's quadratic disagrees with the game.
    assert quality["1"] == pytest.approx(0.1001)
    assert quality["41"] == pytest.approx(0.1337)
    assert "weapon_quality_amp" not in coeffs[SUPPORT]


def test_karma_stage_step(coeffs):
    for role in (DPS, SUPPORT):
        assert coeffs[role]["karma_stage_step"] == pytest.approx(0.006), role


def test_gem_option_values_join_the_gem_option_table(coeffs):
    """Type 31 keys (group, level) cover EFTable_ArkGridGemOption exactly.

    The 720 option rows are split between the roles rather than duplicated:
    360 damage-dealer option groups and 360 support ones, disjoint.
    """
    from lostark.db import Tables

    def pairs_for(role):
        return {
            (int(g), int(lv))
            for g, levels in coeffs[role]["gem_option_values"].items()
            for lv in levels
        }

    dps, support = pairs_for(DPS), pairs_for(SUPPORT)
    assert len(dps) == 360
    assert len(support) == 360
    assert dps.isdisjoint(support)

    with Tables(TABLES).connect("ArkGridGemOption") as con:
        options = {
            (r[0], r[1])
            for r in con.execute("SELECT PrimaryKey, SecondaryKey FROM ArkGridGemOption")
        }
    assert dps | support == options


def test_orb_values_split_by_role(coeffs):
    """Type 33 puts the amp in ValueC; Type 34 puts it in ValueB. Not symmetric."""
    dps = coeffs[DPS]["orb_values"]
    support = coeffs[SUPPORT]["orb_values"]
    assert len(dps) == 10
    assert dps["657820001"]["amp"] == pytest.approx(0.1)
    assert "heal_amp" not in dps["657820001"]

    # The fan site hardcodes 0.013 for one orb type; the game grants it to four.
    assert len(support) == 4
    assert all(v["heal_amp"] == pytest.approx(0.013) for v in support.values())


def test_gem_values_match_the_fan_site_where_they_overlap(coeffs):
    """Type 22 is gem tier x level. Tier 4 levels 6-10 reproduce the fan site's
    dpsGemData battle values exactly; the game also covers tier 3 and levels 1-5.
    """
    gems = coeffs[DPS]["gem_values"]
    assert set(gems) == {"3", "4"}
    assert set(gems["4"]) == {str(i) for i in range(1, 11)}
    expected = {"6": 0.0448, "7": 0.0512, "8": 0.0576, "9": 0.064, "10": 0.0704}
    for level, value in expected.items():
        assert gems["4"][level] == pytest.approx(value), level


def test_support_gem_values_differ_from_dps(coeffs):
    assert coeffs[SUPPORT]["gem_values"]["4"]["10"] == pytest.approx(0.125)


def test_accessory_line_values_match_the_fan_site(coeffs):
    """Type 17 is accessory affix lines: four tiers x three grades per role."""
    dps = coeffs[DPS]["accessory_line_values"]
    support = coeffs[SUPPORT]["accessory_line_values"]
    assert len(dps) == 12
    assert len(support) == 12

    # Fan site: 对敌人造成的伤害 +0.55% / +1.20% / +2.00%.
    assert dps["621000000"] == pytest.approx(0.0055)
    assert dps["621000001"] == pytest.approx(0.012)
    assert dps["621000002"] == pytest.approx(0.02)

    # Fan site: 武器攻击力 +0.80% / +1.80% / +3.00%.
    assert support["6000"] == pytest.approx(0.008)
    assert support["6001"] == pytest.approx(0.018)
    assert support["6002"] == pytest.approx(0.03)


def test_accessory_line_id_spaces_differ_by_role(coeffs):
    # Damage-dealer ids are CombatEffect PrimaryKeys; support ids are not.
    assert all(int(k) > 600_000_000 for k in coeffs[DPS]["accessory_line_values"])
    assert all(int(k) < 10_000 for k in coeffs[SUPPORT]["accessory_line_values"])
