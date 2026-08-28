"""Tests for running config chunks and reading the tables back.

The fixtures are ordinary Lua sources compiled here, so the sandbox, the ``__index``
template merge and the key ordering are all exercised without the game. The one test that
reads shipped tables is skipped when ``RO3_GAME`` is unset.
"""

from __future__ import annotations

import pytest

from ro3 import lua_tables
from ro3.env import optional_dir, require_dir  # importing it also loads tools/.env

from .test_ro3_lua import stock_chunk

# A config table exactly as the client writes one: a shared template behind __index, and
# rows that store only the columns differing from it.
TEMPLATED_TABLE = """
local template = {_iCD = 0, _kIcon = "", _iJob = 1200, _kRange = {0}}
local meta = {__index = template}
local values = {}
values[1110601] = setmetatable({_iID = 1110601, _iLevel = 1, _iCD = 7000}, meta)
values[1110602] = setmetatable({_iID = 1110602, _iLevel = 2}, meta)
return {m_kCount = 2, m_kValues = values}
"""

# Config chunks pull in engine modules that are not present headless.
REQUIRES_ENGINE = """
local mgr = require("Lua_DBManager")
mgr.GetInstance():Register("x")
return {m_kCount = 1, m_kValues = {[900] = {_iID = 900, _kName = "ok"}}}
"""


def run(source: str, **kwargs):
    return lua_tables.Runner().run(stock_chunk(source), **kwargs)


def test_the_template_behind_index_is_merged_into_every_row():
    table = run(TEMPLATED_TABLE)
    rows = lua_tables.rows(table)
    assert table["m_kCount"] == 2
    assert set(rows) == {"1110601", "1110602"}
    assert rows["1110601"] == {
        "_iID": 1110601,
        "_iLevel": 1,
        "_iCD": 7000,
        "_kIcon": "",
        "_iJob": 1200,
        "_kRange": [0],
    }
    # The row that stores no _iCD inherits the template's 0 rather than losing the column.
    assert rows["1110602"]["_iCD"] == 0
    assert rows["1110602"]["_iJob"] == 1200


def test_without_the_merge_a_row_shows_only_its_stored_columns():
    rows = lua_tables.rows(run(TEMPLATED_TABLE, merge_defaults=False))
    assert rows["1110602"] == {"_iID": 1110602, "_iLevel": 2}


def test_require_is_stubbed_so_an_engine_call_does_not_break_the_table():
    rows = lua_tables.rows(run(REQUIRES_ENGINE))
    assert rows["900"]["_kName"] == "ok"


def test_object_keys_come_back_sorted_so_a_rerun_is_byte_stable():
    rows = lua_tables.rows(run(TEMPLATED_TABLE))
    assert list(rows["1110601"]) == sorted(rows["1110601"])


def test_sequences_stay_arrays_and_sparse_tables_become_objects():
    table = run(
        'return {m_kCount = 1, m_kValues = {[900] = {a = {10, 20, 30}, b = {[2] = "x"}}}}'
    )
    row = lua_tables.rows(table)["900"]
    assert row["a"] == [10, 20, 30]
    assert row["b"] == {"2": "x"}


def test_a_dense_id_run_is_rekeyed_from_the_lua_sequence():
    # Row ids 1..N make m_kValues a Lua sequence, which serializes as an array. The ids
    # are still recoverable, because a Lua sequence starts at 1.
    table = run("return {m_kValues = {{_iID = 1}, {_iID = 2}, {_iID = 3}}}")
    rows = lua_tables.rows(table)
    assert list(rows) == ["1", "2", "3"]
    assert rows["2"] == {"_iID": 2}


def test_integers_and_floats_keep_their_lua_type():
    row = lua_tables.rows(run("return {m_kValues = {[900] = {i = 7, f = 0.5, s = 'x'}}}"))["900"]
    assert row["i"] == 7 and isinstance(row["i"], int)
    assert row["f"] == 0.5
    assert row["s"] == "x"


def test_a_chunk_that_raises_is_reported_rather_than_silently_empty():
    with pytest.raises(lua_tables.LuaError, match="run:"):
        run('error("boom")')


def test_a_chunk_that_returns_no_table_is_reported():
    with pytest.raises(lua_tables.LuaError, match="returned number"):
        run("return 42")


def test_rows_refuses_a_table_that_is_not_shaped_like_a_config_table():
    with pytest.raises(lua_tables.LuaError, match="no m_kValues"):
        lua_tables.rows(run("return {something = 1}"))
    with pytest.raises(lua_tables.LuaError, match="not a map"):
        lua_tables.rows(run("return {m_kValues = 3}"))


def test_a_bad_chunk_is_reported_as_a_load_failure():
    with pytest.raises(lua_tables.LuaError, match="load:"):
        lua_tables.Runner().run(b"\x1bLuaT" + bytes(40))


def test_the_runner_recycles_its_lua_state():
    runner = lua_tables.Runner()
    for _ in range(lua_tables.STATE_CHUNKS + 5):
        assert lua_tables.rows(runner.run(stock_chunk(TEMPLATED_TABLE)))
    assert runner._used <= lua_tables.STATE_CHUNKS


def test_chunk_name_falls_back_to_the_container_position():
    assert lua_tables.Chunk("abc", 7, "a/b/SkillConfig.lua", b"").name == "SkillConfig"
    assert lua_tables.Chunk("abc", 7, None, b"").name == "abc_00007"


needs_game = pytest.mark.skipif(
    optional_dir("RO3_GAME") is None,
    reason="RO3_GAME is unset: the game is not installed here",
)


@needs_game
def test_the_shipped_skill_table_unions_to_its_own_declared_count():
    """The three shipped copies of SkillConfig nest, and their union is m_kCount.

    Each copy declares the same ``m_kCount`` while shipping fewer rows than that, and the
    row's own ``_kMultiverseArray`` says which copy it belongs to. This is the check that
    the union in :mod:`.export_config` is the whole authored table rather than a guess.
    """
    from .. import export_config

    root = require_dir("RO3_GAME") / "StreamingAssets" / "VFS"
    runner = lua_tables.Runner()
    found = lua_tables.collect_chunks(
        root, lambda script: script.endswith("Config/DataConfig/SkillConfig.lua")
    )
    chunks = found.get("SkillConfig", [])
    assert len(chunks) >= 2, "expected the base copy plus at least one multiverse variant"

    rows, stats = export_config.union_rows(chunks, runner)
    assert stats["declaredCount"] == len(rows), stats
    assert sum(copy["conflictingSharedRows"] for copy in stats["copies"].values()) == 0
    tags = {
        tuple(row.get("_kMultiverseArray") or []) for row in rows.values()
    }
    assert (0,) in tags, "the shared rows are tagged [0]"
