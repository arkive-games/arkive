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
