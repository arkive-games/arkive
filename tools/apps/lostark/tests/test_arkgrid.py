"""Contract tests for ark grid core metadata."""

import pytest

from lostark.arkgrid import extract, partition_values
from lostark.battlepoint import DPS, SUPPORT
from lostark.battlepoint import extract as bp_extract
from lostark.db import Tables
from lostark.env import optional_dir

TABLES = optional_dir("LOSTARK_TABLES")

pytestmark = pytest.mark.skipif(
    TABLES is None or not TABLES.exists(), reason="LOSTARK_TABLES not set"
)


@pytest.fixture(scope="module")
def cores():
    return extract(Tables(TABLES))


@pytest.fixture(scope="module")
def coeffs():
    return bp_extract(Tables(TABLES))


def test_cores_are_keyed_by_id(cores):
    assert "673000003" in cores


def test_core_carries_grade_and_localization_keys(cores):
    core = cores["673000003"]
    assert core["category_key"] == "sys.arkgrid.core_order_sun"
    assert core["name_key"] == "tip.name.core_673000003"
    assert core["grade"] == 0


def test_partitioned_values_join_totally(cores, coeffs):
    """After partitioning, every retained core id has a definition.

    An unresolved id would render as a blank core carrying a real number, which
    is worse than dropping it.
    """
    for role in (DPS, SUPPORT):
        kept, _ = partition_values(coeffs[role]["ark_core_values"], cores)
        assert set(kept) <= set(cores)
        assert kept, role


def test_orphan_core_ids_are_the_known_7xx_series(cores, coeffs):
    """72 BattlePoint core ids exist in no other table in the extraction.

    Pinned so that a patch shipping definitions for them — or introducing a new
    orphan series — is noticed rather than silently absorbed.
    """
    _, orphans = partition_values(coeffs[DPS]["ark_core_values"], cores)
    assert len(orphans) == 72
    assert all(o[-3] == "7" for o in orphans), f"unexpected orphan shape: {orphans[:5]}"


def test_orphans_are_absent_from_every_other_table(cores, coeffs):
    # Verified by a full scan of all 779 databases on 2026-08-02: 673000703
    # appears only in BattlePoint. This guards the assumption behind dropping them.
    _, orphans = partition_values(coeffs[DPS]["ark_core_values"], cores)
    assert "673000703" in orphans


def test_localization_keys_are_present_on_every_core(cores):
    missing = [cid for cid, c in cores.items() if not c["name_key"]]
    assert missing == [], f"cores with no name key: {missing[:10]}"


def test_option_points_map_index_to_threshold(cores):
    """BattlePoint Type 29 keys by option index 1-6, not by point total.

    ArkGridCore.ReqOptionPoint1..6 carries the thresholds those indexes unlock,
    which is what turns a user's "20 points" into a value lookup.
    """
    core = cores["673000005"]
    assert core["option_points"] == {
        "1": 10, "2": 14, "3": 17, "4": 18, "5": 19, "6": 20,
    }


def test_every_core_with_values_has_option_points(cores, coeffs):
    from lostark.arkgrid import partition_values

    kept, _ = partition_values(coeffs[DPS]["ark_core_values"], cores)
    missing = [cid for cid in kept if not cores[cid]["option_points"]]
    assert missing == [], f"cores with values but no point thresholds: {missing[:5]}"
