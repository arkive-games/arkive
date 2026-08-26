"""Text resolution and row ordering — the parts that need no LuaJIT."""

from __future__ import annotations

from gmzz.tables import resolve_text, unresolved_ids
from gmzz.traintrade import _ordered

STRINGS = {"1218466115749376": "黑麦啤酒", "681698551412224": "艺术品"}


def test_resolves_a_marker():
    assert resolve_text("@LANG:1218466115749376", STRINGS) == "黑麦啤酒"


def test_resolves_nested_structures():
    payload = {
        "rows": [{"name": "@LANG:1218466115749376", "type": "@LANG:681698551412224"}],
        "id": 30101,
    }
    assert resolve_text(payload, STRINGS) == {
        "rows": [{"name": "黑麦啤酒", "type": "艺术品"}],
        "id": 30101,
    }


def test_leaves_plain_text_alone():
    assert resolve_text("WINE", STRINGS) == "WINE"
    assert resolve_text("mail@example.com", STRINGS) == "mail@example.com"


def test_keeps_an_unknown_marker_visible():
    # Blanking it would turn a missing shard into an empty label that nobody
    # notices; unresolved_ids is how the pipeline fails loudly instead.
    payload = {"a": ["@LANG:999", "@LANG:1218466115749376"]}
    resolved = resolve_text(payload, STRINGS)
    assert resolved == {"a": ["@LANG:999", "黑麦啤酒"]}
    assert unresolved_ids(resolved) == {"999"}


def test_no_unresolved_ids_after_a_full_resolve():
    assert unresolved_ids(resolve_text({"a": "@LANG:681698551412224"}, STRINGS)) == set()


def test_numeric_keyed_rows_become_a_sorted_list():
    # The client stores rows in a hash table, so unordered output would churn
    # the content digest on every run even when nothing changed.
    assert _ordered({"30102": {"ID": 30102}, "30101": {"ID": 30101}}) == [
        {"ID": 30101},
        {"ID": 30102},
    ]


def test_sorts_numerically_not_lexically():
    ids = [row["ID"] for row in _ordered({"9": {"ID": 9}, "10": {"ID": 10}})]
    assert ids == [9, 10]


def test_name_keyed_tables_are_left_as_a_mapping():
    types = {"WINE": {"GoodsTypeID": "WINE"}}
    assert _ordered(types) is types
