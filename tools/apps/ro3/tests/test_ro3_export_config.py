"""Tests for the config-table emitter's shaping rules. No game needed."""

from __future__ import annotations

from ro3 import export_config as ec
from ro3.common import dumps, read_json


class FakeRunner:
    """Returns a canned table per chunk, so ``union_rows`` can be tested on its own."""

    def __init__(self, tables: dict[bytes, dict]) -> None:
        self.tables = tables

    def run(self, data: bytes, **_):
        return self.tables[data]


def chunk(script: str, data: bytes):
    from ro3.lua_tables import Chunk

    return Chunk("container", 0, script, data)


# --- which chunks the export reads ------------------------------------------------------


def test_only_the_wanted_data_configs_and_the_language_tables_are_selected():
    assert ec.wanted("LuaScript/Config/DataConfig/SkillConfig.lua")
    assert ec.wanted("LuaMultiverse/M102/Config/DataConfig/SkillConfig.lua")
    assert ec.wanted("LuaScript/Config/DataConfig/NPCConfig.lua")
    assert ec.wanted(
        "Language/Resources/English/Script/LuaScript/Localization_en.lua"
    )
    # A table another stage owns, and an accessor class that only looks like one.
    assert not ec.wanted("LuaScript/Config/DataConfig/ItemConfig.lua")
    assert not ec.wanted("LuaScript/Config/CFG/Lua_CFG_SkillConfig.lua")
    assert not ec.wanted("LuaScript/UI/Lua_UIBase.lua")


# --- is_empty / clean -------------------------------------------------------------------


def test_is_empty_reads_a_list_of_defaults_as_a_default():
    for value in (None, 0, 0.0, "", [], {}, [0], [""], [0, 0], [[""]], {"a": 0}):
        assert ec.is_empty(value), value
    for value in (1, -1, "x", [1], [0, 1], [["x"]], {"a": 1}, 0.5):
        assert not ec.is_empty(value), value


def test_clean_strips_the_underscore_and_the_defaults():
    row = {
        "_iID": 1110601,
        "_iCD": 0,
        "_kIcon": "icon_skill_knight_counter_attack.png",
        "_kRange": [500, 300],
        "_kShout": [0, 0],
        "_kMultiverseArray": [0],
    }
    assert ec.clean(row) == {
        "iID": 1110601,
        "kIcon": "icon_skill_knight_counter_attack.png",
        "kRange": [500, 300],
        "kMultiverseArray": [0],
    }


def test_clean_sorts_its_columns_so_a_rerun_is_byte_stable():
    row = {"_zLast": 1, "_aFirst": 2, "_mMiddle": 3}
    assert list(ec.clean(row)) == ["aFirst", "mMiddle", "zLast"]


# --- union_rows -------------------------------------------------------------------------


def test_union_rows_merges_nested_variant_copies_and_reports_the_declared_count():
    shared = {"1": {"_iID": 1, "_kMultiverseArray": [0]}}
    base = {"m_kCount": 3, "m_kValues": dict(shared)}
    m101 = {
        "m_kCount": 3,
        "m_kValues": {**shared, "2": {"_iID": 2, "_kMultiverseArray": [101]}},
    }
    m102 = {
        "m_kCount": 3,
        "m_kValues": {**shared, "3": {"_iID": 3, "_kMultiverseArray": [102]}},
    }
    runner = FakeRunner({b"base": base, b"m101": m101, b"m102": m102})
    rows, stats = ec.union_rows(
        [chunk("base.lua", b"base"), chunk("m101.lua", b"m101"), chunk("m102.lua", b"m102")],
        runner,
    )
    assert set(rows) == {"1", "2", "3"}
    assert stats["union"] == 3
    assert stats["declaredCount"] == 3
    assert stats["copies"]["m101.lua"] == {"rows": 2, "added": 1, "conflictingSharedRows": 0}
    assert all(c["conflictingSharedRows"] == 0 for c in stats["copies"].values())


def test_union_rows_counts_a_shared_row_that_disagrees_rather_than_hiding_it():
    a = {"m_kCount": 1, "m_kValues": {"1": {"_iID": 1, "_iCD": 100}}}
    b = {"m_kCount": 1, "m_kValues": {"1": {"_iID": 1, "_iCD": 200}}}
    rows, stats = ec.union_rows(
        [chunk("a.lua", b"a"), chunk("b.lua", b"b")], FakeRunner({b"a": a, b"b": b})
    )
    assert rows["1"]["_iCD"] == 100  # the first copy wins
    assert stats["copies"]["b.lua"]["conflictingSharedRows"] == 1


def test_union_rows_lists_every_declared_count_when_the_copies_disagree():
    a = {"m_kCount": 5, "m_kValues": {"1": {"_iID": 1}}}
    b = {"m_kCount": 7, "m_kValues": {"2": {"_iID": 2}}}
    _, stats = ec.union_rows(
        [chunk("a.lua", b"a"), chunk("b.lua", b"b")], FakeRunner({b"a": a, b"b": b})
    )
    assert stats["declaredCount"] == [5, 7]


# --- sharding ---------------------------------------------------------------------------


def test_shard_rows_deepens_the_prefix_only_where_the_budget_needs_it(monkeypatch):
    monkeypatch.setattr(ec, "SHARD_BUDGET", 200)
    rows = [{"iID": 1100 + i, "pad": "x" * 40} for i in range(6)]
    rows += [{"iID": 2100, "pad": "y"}]
    bands = ec.shard_rows(rows, lambda r: r["iID"])
    assert "21" in bands and len(bands["21"]) == 1
    assert "11" not in bands, "the oversize band must have been split"
    assert all(key.startswith(("11", "21")) for key in bands)
    assert sum(len(band) for band in bands.values()) == len(rows)
    assert all(len(dumps(band).encode()) <= 200 for band in bands.values())


def test_shard_rows_stops_when_the_prefix_cannot_split_further(monkeypatch):
    monkeypatch.setattr(ec, "SHARD_BUDGET", 10)
    rows = [{"iID": 42, "pad": "x" * 100}, {"iID": 42, "pad": "y" * 100}]
    bands = ec.shard_rows(rows, lambda r: r["iID"])
    # Both rows share the whole id, so no deeper prefix exists and the band ships oversize
    # rather than recursing forever.
    assert bands == {"42": rows}


def test_shard_rows_on_no_rows_is_empty():
    assert ec.shard_rows([], lambda r: r["iID"]) == {}


def test_write_shards_writes_one_file_per_band_and_returns_the_manifest(tmp_path):
    bands = {"11": [{"iID": 1101}], "23": [{"iID": 2301}, {"iID": 2302}]}
    manifest = ec.write_shards(tmp_path, "skills", bands, "skills")
    assert manifest == [
        {"idPrefix": "11", "path": "skills/11.json", "rows": 1},
        {"idPrefix": "23", "path": "skills/23.json", "rows": 2},
    ]
    written = read_json(tmp_path / "skills" / "23.json")
    assert written["shardOf"] == "skills.json"
    assert written["idPrefix"] == "23"
    assert written["counts"] == {"rows": 2}
    assert written["skills"] == bands["23"]


# --- indexes ----------------------------------------------------------------------------


def test_skill_index_collapses_the_level_rows_to_their_ids():
    rows = [
        {"iID": 1110602, "iSkillID": 11106, "iLevel": 2, "iMaxLevel": 10, "iJob": 1200},
        {
            "iID": 1110601,
            "iSkillID": 11106,
            "iLevel": 1,
            "iMaxLevel": 10,
            "iJob": 1200,
            "icon": "icons/skills/a.webp",
            "name": {"zh-CN": "x"},
        },
        {"iID": 900001, "iSkillID": 9000, "iLevel": 1},
    ]
    index = ec.skill_index(rows)
    assert [e["iSkillID"] for e in index] == [9000, 11106]
    counter = index[1]
    assert counter["levels"] == [1110601, 1110602]
    assert counter["iJob"] == 1200
    assert counter["icon"] == "icons/skills/a.webp"
    assert counter["name"] == {"zh-CN": "x"}
    assert "icon" not in index[0]


def test_light_index_keeps_only_the_named_columns_that_have_a_value():
    rows = [{"iID": 7, "iLevel": 0, "iNPCType": 8, "name": {"zh-CN": "x"}, "iSpeed": 400}]
    assert ec.light_index(rows, ("iLevel", "iNPCType")) == [
        {"iID": 7, "iNPCType": 8, "name": {"zh-CN": "x"}}
    ]


# --- icon join --------------------------------------------------------------------------


def test_icons_join_a_config_sprite_name_to_the_exported_webp(tmp_path):
    directory = tmp_path / "icons" / "skills"
    directory.mkdir(parents=True)
    (directory / "icon_skill_knight_counter_attack.webp").write_bytes(b"")
    icons = ec.Icons.read(tmp_path)
    assert icons.lookup("icon_skill_knight_counter_attack.png") == (
        "icons/skills/icon_skill_knight_counter_attack.webp"
    )
    assert icons.lookup("icon_skill_missing.png") is None
    assert icons.lookup("") is None
    assert icons.lookup(None) is None
    assert icons.lookup(0) is None


# --- rendered text ----------------------------------------------------------------------


def test_text_renders_only_the_inline_locales_and_counts_what_it_produced():
    text = ec.Text({
        "zh-CN": {"1": "a ${1}"},
        "en-US": {"1": "b ${1}"},
        "ko-KR": {"1": "None"},
        "th-TH": {"1": "unused"},
    })
    assert text.render([1], ["9"]) == {"zh-CN": "a 9", "en-US": "b 9"}
    assert text.rendered == 2
    assert text.with_placeholders == 0
    assert text.render([1], []) == {"zh-CN": "a ${1}", "en-US": "b ${1}"}
    assert text.with_placeholders == 2
    assert text.render([2], []) == {}
