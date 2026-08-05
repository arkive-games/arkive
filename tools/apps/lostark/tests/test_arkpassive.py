"""Contract tests for the Ark Passive tree metadata."""

import pytest

from lostark import locales
from lostark.arkpassive import TREES, localization_keys, trees
from lostark.db import Tables
from lostark.env import optional_dir

TABLES = optional_dir("LOSTARK_TABLES")

needs_tables = pytest.mark.skipif(
    TABLES is None or not TABLES.exists(), reason="LOSTARK_TABLES not set"
)


def test_trees_are_in_the_clients_group_order():
    # ArkPassive.Group is 0/1/2 for Evolution/Enlightenment/Leap, and the
    # medallion sheet is laid out in that same order — so the order here is
    # load-bearing, not cosmetic.
    assert [t["key"] for t in trees()] == ["evolution", "enlightenment", "leap"]
    assert [t["group"] for t in trees()] == [0, 1, 2]


def test_each_tree_has_six_medallion_tiers():
    # 18 icons on use_12, six per tree.
    assert [t["tiers"] for t in trees()] == [6, 6, 6]


def test_only_evolution_ranks_and_only_leap_levels():
    # BattlePoint Type 8 keys off the evolution rank and Type 9 off the leap
    # level; Enlightenment has neither, and asserting that stops a future
    # "make it symmetric" edit from inventing a dial the game does not have.
    by_key = {t["key"]: t for t in trees()}
    assert by_key["evolution"]["rank_scores"] is True
    assert by_key["leap"]["level_scores"] is True
    assert by_key["enlightenment"]["rank_scores"] is False
    assert by_key["enlightenment"]["level_scores"] is False
    assert sum(bool(t["rank_scores"]) for t in trees()) == 1
    assert sum(bool(t["level_scores"]) for t in trees()) == 1


def test_trees_returns_copies():
    trees()[0]["key"] = "mutated"
    assert TREES[0]["key"] == "evolution"


@needs_tables
def test_every_key_resolves_in_every_locale():
    keys = localization_keys()
    got = locales.resolve(Tables(TABLES), keys, missing="skip")
    for locale, table in got.items():
        missing = [k for k in keys if k not in table]
        assert not missing, f"{locale} is missing {missing}"


@needs_tables
def test_tree_colour_matches_the_karma_name_colour():
    """The colour is why the medallion sheet could be split with confidence.

    ``tip.name.karma_<tree>01`` wraps its name in the tree's own colour, so if
    a hard-coded colour here ever drifts from the client's, this fails.
    """
    table = locales.resolve(Tables(TABLES), localization_keys(), missing="skip")["zh-CN"]
    for tree in trees():
        text = table[str(tree["karma_name_key"])]
        assert f"<c {tree['colour']}>" in text, f"{tree['key']}: {text!r}"
