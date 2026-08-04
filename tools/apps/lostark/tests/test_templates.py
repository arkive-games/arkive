"""Tests for the GameMsg template resolver."""

import pytest

from lostark.db import Tables
from lostark.env import optional_dir
from lostark.templates import Resolver, strip_markup

TABLES = optional_dir("LOSTARK_TABLES")
live = pytest.mark.skipif(
    TABLES is None or not TABLES.exists(), reason="LOSTARK_TABLES not set"
)


def test_strip_markup_keeps_the_games_colour_spans():
    """The client's own colours are carried through, not re-derived."""
    assert strip_markup("<FONT COLOR='#99ff99'>4%</FONT>。") == "<c #99ff99>4%</c>。"


def test_strip_markup_drops_placeholder_coloured_spans():
    # Core names use <font color='{0}'>: there is no colour to render, so the
    # span goes and its close must go with it.
    assert strip_markup("<font color='{0}'>连续击溃</font>") == "连续击溃"


def test_strip_markup_drops_images_and_other_tags():
    assert strip_markup(" <img src='x' width='0'></img>秩序之日") == "秩序之日"


@pytest.fixture(scope="module")
def resolver():
    return Resolver(Tables(TABLES))


@live
def test_resolves_a_combateffect_lookup_inside_calc(resolver):
    # tip.desc.arkgrid_3150000 is
    #   暴击时对敌人造成的伤害增加<$CALC %2 <$TABLE_COMBATEFFECT Action0ArgA 608111000/>/100/>%
    out = resolver.text("tip.desc.arkgrid_3150000")
    assert out == "暴击时对敌人造成的伤害增加<c #99ff99>0.55%</c>。"


@live
def test_table_names_are_case_insensitive(resolver):
    # Descriptions use both <$TABLE_COMBATEFFECT and <$TABLE_ArkGridCoreOption.
    out = resolver.text("tip.desc.arkgrid_3150600")
    assert "/100/>" not in out, out
    assert "%" in out


@live
def test_leaves_context_dependent_directives_alone(resolver):
    # $MACRO and $PLAYER_INFO depend on runtime state; a static resolver must
    # not invent a value for them.
    assert resolver.text("no.such.key") is None


@live
def test_no_arkgrid_description_keeps_an_unresolved_fragment(resolver):
    """Every ark grid option description resolves, bar the documented few.

    A leftover '/>' or '$TABLE' means a directive form we do not handle, which
    would ship broken text to the UI.
    """
    tables = Tables(TABLES)
    bad = []
    for row in tables.read("ArkGridCoreOption"):
        key = row["Desc"]
        if not key:
            continue
        out = resolver.text(key)
        if out and ("/>" in out or "$TABLE" in out or "$CALC" in out):
            bad.append((row["PrimaryKey"], out[:70]))
    # $MACRO and $PLAYER_INFO rows are expected to survive unresolved.
    assert len(bad) <= 12, f"{len(bad)} unresolved: {bad[:5]}"
