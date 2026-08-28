"""Tests for the localized-string renderer.

The templates below are ASCII stand-ins with the *exact* placeholder structure of shipped
strings (the skill each one is taken from is named in a comment), because source files in
this repository stay pure English. The one test that asserts against real game text reads
it from the installed client and is skipped when ``RO3_GAME`` is unset -- so the rendering
rule is checked against the shipped string without transcribing it here.
"""

from __future__ import annotations

import pytest

from ro3 import localization as loc
from ro3.env import optional_dir, require_dir  # importing it also loads tools/.env

# Skill 1110601 (Knight, Counter Attack, level 1): five kDescData values and two own
# arguments, which are the colour tags the ^ family addresses.
COUNTER_ATTACK_TEMPLATE = (
    "Counter within ${4}m by ${5}m against ${3} enemies "
    "for attack * ^{1}${1}%+${2}^{2} physical damage."
)
COUNTER_ATTACK_ID = 10110301006
COUNTER_ATTACK_FIELD = [COUNTER_ATTACK_ID, "<color=#cc762a>", "</color>"]
COUNTER_ATTACK_DESC_DATA = ["55", "60", "5", "3", "5"]


def test_caret_span_is_the_highest_caret_index():
    assert loc.caret_span("no placeholders") == 0
    assert loc.caret_span("^{1}x^{2}") == 2
    assert loc.caret_span("^{4}...^{1}") == 4
    assert loc.caret_span("${9}@{3}") == 0


def test_dollar_draws_from_desc_data_and_caret_from_the_fields_own_arguments():
    text = loc.render(
        COUNTER_ATTACK_TEMPLATE, COUNTER_ATTACK_FIELD[1:], COUNTER_ATTACK_DESC_DATA
    )
    # kDamageParam1 is 5500 on this row, and kDescData[1] is the 55 the text shows.
    assert "<color=#cc762a>55%+60</color>" in text
    assert "within 3m by 5m" in text  # ${4} = 3, ${5} = 5
    assert "against 5 enemies" in text  # ${3} = 5
    assert loc.unresolved(text) == []


def test_at_continues_the_argument_list_after_the_carets():
    # Skill 11631201: eight own arguments, four addressed by ^ and four by @.
    template = "bubble ^{1}@{2}^{2} pops after @{1}s for @{3} hits at ^{3}@{4}%^{4}"
    args = ["<b>", "</b>", "<i>", "</i>", "5", "20", "1", "300"]
    assert loc.render(template, args) == "bubble <b>20</b> pops after 5s for 1 hits at <i>300%</i>"


def test_at_starts_at_one_when_the_template_has_no_carets():
    # Skill 1160301: four own arguments, all addressed by @.
    template = "long @{1}m wide @{2}m for @{3}% and @{4}m"
    assert loc.render(template, ["9", "4", "36", "8"]) == "long 9m wide 4m for 36% and 8m"


def test_a_placeholder_with_no_argument_is_left_verbatim():
    text = loc.render("needs ${12} and @{9}", ["a"], ["1"])
    assert text == "needs ${12} and @{9}"
    assert loc.unresolved(text) == ["${12}", "@{9}"]


def test_numbers_render_without_a_float_tail():
    assert loc.render("${1} / ${2} / ${3}", [], [3, 3.0, 3.5]) == "3 / 3 / 3.5"
    assert loc.render("${1}", [], [True]) == "true"


def test_lookup_treats_the_untranslated_marker_as_missing():
    table = {"1": "real", "2": loc.UNTRANSLATED, "3": ""}
    assert loc.lookup(table, [1]) == "real"
    assert loc.lookup(table, [2]) is None
    assert loc.lookup(table, [3]) is None
    assert loc.lookup(table, [4]) is None


def test_lookup_rejects_a_field_that_is_not_a_localized_reference():
    table = {"1": "real"}
    assert loc.lookup(table, None) is None
    assert loc.lookup(table, []) is None
    assert loc.lookup(table, 1) is None
    assert loc.lookup(table, "1") is None


def test_lookup_renders_through_the_placeholder_rule():
    table = {str(COUNTER_ATTACK_ID): COUNTER_ATTACK_TEMPLATE}
    text = loc.lookup(table, COUNTER_ATTACK_FIELD, COUNTER_ATTACK_DESC_DATA)
    assert text and "<color=#cc762a>55%+60</color>" in text


def test_text_table_flattens_and_drops_the_untranslated():
    rows = {
        "1": {"_iID": 1, "_kDes": "kept"},
        "2": {"_iID": 2, "_kDes": "None"},
        "3": {"_iID": 3, "_kDes": ""},
        "4": {"_iID": 4},
        "5": "not a row",
    }
    assert loc.text_table(rows) == {"1": "kept"}


needs_game = pytest.mark.skipif(
    optional_dir("RO3_GAME") is None,
    reason="RO3_GAME is unset: the game is not installed here",
)


@needs_game
def test_the_shipped_zh_cn_template_renders_the_damage_coefficient():
    """Render the real string behind Counter Attack and check the number it produces.

    kDamageParam1 is 5500 and kDescData[1] is "55", so a correct render puts 55% inside the
    colour tags the field's own arguments supply. Only the ASCII part of the result is
    asserted, so no game text is transcribed into this file.
    """
    from ro3 import lua_tables

    root = require_dir("RO3_GAME") / "StreamingAssets" / "VFS"
    runner = lua_tables.Runner()
    chunks = lua_tables.collect_chunks(
        root, lambda script: script.endswith("LuaScript/Localization_zh_CN.lua")
    )
    assert chunks, "the zh_CN language table was not found under RO3_GAME"
    table = loc.text_table(lua_tables.rows(runner.run(next(iter(chunks.values()))[0].data)))

    template = table.get(str(COUNTER_ATTACK_ID))
    assert template, f"language id {COUNTER_ATTACK_ID} is missing"
    assert loc.caret_span(template) == 2
    text = loc.lookup(table, COUNTER_ATTACK_FIELD, COUNTER_ATTACK_DESC_DATA)
    assert text is not None
    assert "<color=#cc762a>55%+60</color>" in text
    assert loc.unresolved(text) == []
