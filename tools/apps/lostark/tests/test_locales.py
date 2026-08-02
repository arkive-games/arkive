"""Tests for GameMsg name resolution."""

import pytest

from lostark.db import Tables
from lostark.env import optional_dir
from lostark.locales import LOCALES, has_template, resolve, strip_markup


def test_strip_markup_removes_font_and_img():
    assert strip_markup("<font color='{0}'>连续击溃</font>") == "连续击溃"
    assert (
        strip_markup(" <img src='emoticon_arkgrid_order_sun' width='0'></img>秩序之日")
        == "秩序之日"
    )


def test_strip_markup_collapses_whitespace():
    assert strip_markup("  a   b  ") == "a b"


def test_strip_markup_leaves_plain_text_alone():
    assert strip_markup("肾上腺素") == "肾上腺素"


def test_has_template_detects_calc_directives():
    assert has_template("增加<$CALC %2 <$TABLE_COMBATEFFECT Action0ArgA 608111000/>/100/>%")
    assert not has_template("秩序之日")


TABLES = optional_dir("LOSTARK_TABLES")
live = pytest.mark.skipif(
    TABLES is None or not TABLES.exists(), reason="LOSTARK_TABLES not set"
)


@live
def test_resolve_returns_every_locale():
    out = resolve(
        Tables(TABLES), ["tip.name.ability_adrenaline1", "sys.arkgrid.core_order_sun"]
    )
    assert set(out) == set(LOCALES)
    assert out["zh-CN"]["tip.name.ability_adrenaline1"] == "肾上腺素"
    assert out["zh-CN"]["sys.arkgrid.core_order_sun"] == "秩序之日"
    assert out["ko-KR"]["sys.arkgrid.core_order_sun"] == "질서의 해"


@live
def test_missing_key_is_reported_not_silently_dropped():
    with pytest.raises(KeyError, match="not.a.real.key"):
        resolve(Tables(TABLES), ["not.a.real.key"])


@live
def test_resolve_handles_more_keys_than_one_sql_chunk():
    # The IN(...) chunking must not drop keys at a boundary.
    keys = [f"tip.name.core_{i}" for i in range(673000003, 673000009)] * 200
    out = resolve(Tables(TABLES), keys, missing="skip")
    assert len(out["zh-CN"]) <= 6
