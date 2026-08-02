"""Contract tests for gear stats per item level.

Expected values were read out of EFTable_ItemLevelOption on 2026-08-02 and match
the fan site's commonGearBase["T4 1640"] exactly.
"""

import pytest

from lostark.db import Tables
from lostark.env import optional_dir
from lostark.itemlevel import extract

TABLES = optional_dir("LOSTARK_TABLES")

pytestmark = pytest.mark.skipif(
    TABLES is None or not TABLES.exists(), reason="LOSTARK_TABLES not set"
)

HEAD_1640 = "11152511"
WEAPON_1640 = "11152500"


@pytest.fixture(scope="module")
def gear():
    return extract(Tables(TABLES))


def test_indexed_by_item_level(gear):
    assert "1640" in gear
    assert gear["1640"]


def test_head_stats_at_1640(gear):
    head = gear["1640"][HEAD_1640]
    assert head["main"] == 57721
    assert head["vitality"] == 7293


def test_weapon_attack_at_1640(gear):
    assert gear["1640"][WEAPON_1640]["weapon_attack"] == 100036


def test_main_stat_collapses_str_agi_int(gear):
    # The game emits the same value once per class stat; we keep a single "main".
    head = gear["1640"][HEAD_1640]
    assert not {"str", "agi", "int"} & set(head)


def test_defence_is_preserved(gear):
    # Data the fan site dropped entirely; cheap to keep.
    assert gear["1640"][HEAD_1640]["defence"] == 6130


def test_levels_are_sorted_numerically(gear):
    levels = [int(k) for k in gear]
    assert levels == sorted(levels)


def test_empty_rows_are_not_emitted(gear):
    for level, pieces in gear.items():
        for piece, entry in pieces.items():
            assert entry, f"{level}/{piece} emitted with no stats"
