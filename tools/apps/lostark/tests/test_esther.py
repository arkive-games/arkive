"""Contract tests for the Esther weapon names behind BattlePoint Type 23.

Read out of the live CN client tables on 2026-08-06. No coefficient is decoded here --
Type 23 was already emitted -- so what these pin is the *join*: six bare percentages
become four named weapon generations x two scored evolution stages, per class.
"""

import pytest

from lostark import locales
from lostark.battlepoint import DPS, SUPPORT, extract
from lostark.db import Tables
from lostark.env import optional_dir
from lostark.esther import (
    BP_ESTHER_WEAPON,
    ESTHER_GRADE,
    UI_KEYS,
    generations,
    localization_keys,
    unscored_option_ids,
)

TABLES = optional_dir("LOSTARK_TABLES")

pytestmark = pytest.mark.skipif(
    TABLES is None or not TABLES.exists(), reason="LOSTARK_TABLES not set"
)


@pytest.fixture(scope="module")
def tables():
    return Tables(TABLES)


@pytest.fixture(scope="module")
def gens(tables):
    return generations(tables)


def test_four_generations_numbered_by_their_own_ids(gens):
    assert [g["index"] for g in gens] == [1, 2, 3, 4]
    assert [g["quality_option_id"] for g in gens] == [
        "21110000",
        "22110000",
        "23110000",
        "24110000",
    ]


def test_every_generation_covers_the_same_29_classes(gens):
    rosters = [set(g["weapons"]) for g in gens]  # type: ignore[arg-type]
    assert all(len(r) == 29 for r in rosters)
    assert len(set(map(frozenset, rosters))) == 1


def test_weapons_are_esther_grade_items_with_a_name_key(tables, gens):
    with tables.connect("Item") as con:
        for generation in gens:
            for weapon in dict(generation["weapons"]).values():  # type: ignore[arg-type]
                row = con.execute(
                    "SELECT Grade, Name FROM Item WHERE PrimaryKey = ?",
                    (int(str(weapon["item_id"])),),
                ).fetchone()
                assert row is not None, weapon
                assert row["Grade"] == ESTHER_GRADE, weapon
                assert row["Name"] == weapon["name_key"], weapon


def test_two_scored_stages_per_generation_with_the_clients_amps(gens):
    """Only stages 6 and 8 grant an Esther option, so only they carry an amp.

    The ladder 0.005 / 0.0095 / 0.0075 / 0.0143 / 0.01 / 0.019 is the whole of
    BattlePoint Type 23, and 0.019 is the top grade the fan site publishes as real.
    """
    seen = {
        (int(g["index"]), int(s["stage"])): (str(s["esther_option_id"]), s["amp"])
        for g in gens
        for s in g["stages"]  # type: ignore[union-attr]
    }
    assert seen[(1, 6)] == ("1100106", {DPS: 0.005, SUPPORT: 0.005})
    assert seen[(1, 8)] == ("1100108", {DPS: 0.0095, SUPPORT: 0.0095})
    assert seen[(2, 6)] == ("2100106", {DPS: 0.0075, SUPPORT: 0.0075})
    assert seen[(2, 8)] == ("2100108", {DPS: 0.0143, SUPPORT: 0.0143})
    assert seen[(3, 6)] == ("3100106", {DPS: 0.01, SUPPORT: 0.01})
    assert seen[(3, 8)] == ("3100108", {DPS: 0.019, SUPPORT: 0.019})
    assert set(seen) == {(g, s) for g in (1, 2, 3, 4) for s in (6, 8)}


def test_generation_four_reuses_generation_threes_option(gens):
    """The client's own wiring, not a fallback.

    ``ItemQualityOption`` routes generation 4's stages 100-109 through
    ``EvolutionCommonId 241200000``, and that track carries generation 3's
    ``EstherOptionId``s. So the newest weapon scores what the previous one does at the
    same stage, and two generations share a ``chosenWeaponId``.
    """
    by_index = {int(g["index"]): g for g in gens}
    third = {int(s["stage"]): str(s["esther_option_id"]) for s in by_index[3]["stages"]}  # type: ignore[union-attr]
    fourth = {int(s["stage"]): str(s["esther_option_id"]) for s in by_index[4]["stages"]}  # type: ignore[union-attr]
    assert third == fourth
    tracks = {str(s["evolution_common_id"]) for s in by_index[4]["stages"]}  # type: ignore[union-attr]
    assert tracks == {"241200000"}


def test_the_stubbed_fourth_generation_options_are_reported_not_dropped(tables):
    """``4100106``/``4100108`` exist in the client and are unreachable.

    They are defined on track ``241100000``, which ``ItemQualityOption`` only reaches
    at stage 110 -- a stage that grants no Esther option -- and BattlePoint carries no
    amp for them. This is the concrete form of the fan site's "Esther values are
    estimates" note.
    """
    assert unscored_option_ids(tables) == ["4100106", "4100108"]


def test_every_emitted_option_has_a_battlepoint_amp(tables, gens):
    coeffs = extract(tables)
    for role in (DPS, SUPPORT):
        table = coeffs[role]["chosen_weapon_values"]
        for generation in gens:
            for stage in generation["stages"]:  # type: ignore[union-attr]
                assert str(stage["esther_option_id"]) in table, stage


def test_all_six_battlepoint_rows_are_reachable_from_a_weapon(tables, gens):
    """Nothing in Type 23 is orphaned by the join.

    The other direction of the previous test: if the join dropped a row the picker
    would be missing an option the game scores.
    """
    emitted = {
        str(stage["esther_option_id"])
        for generation in gens
        for stage in generation["stages"]  # type: ignore[union-attr]
    }
    with tables.connect("BattlePoint") as con:
        rows = {
            str(row[0])
            for row in con.execute(
                "SELECT ValueB FROM BattlePoint WHERE Type = ?", (BP_ESTHER_WEAPON,)
            )
        }
    assert rows == emitted


def test_localization_keys_cover_every_weapon_name(gens):
    keys = set(localization_keys(gens))
    assert set(UI_KEYS.values()) <= keys
    for generation in gens:
        for weapon in dict(generation["weapons"]).values():  # type: ignore[arg-type]
            assert weapon["name_key"] in keys
    # 4 generations x 29 classes, plus the five UI strings.
    assert len(keys) == 4 * 29 + len(UI_KEYS)


def test_every_key_resolves_in_both_locales(tables, gens):
    keys = localization_keys(gens)
    names = locales.resolve(tables, keys)
    assert set(names) == {"zh-CN", "ko-KR"}
    for locale, table in names.items():
        missing = [k for k in keys if not table.get(k, "").strip()]
        assert not missing, (locale, missing)


def test_the_stage_template_takes_one_placeholder(tables):
    """``sys.esther.evolution_ui_evolution_grade_now`` is "第{0}阶段", not a sentence.

    A client string is not automatically a label, so the shape is checked rather than
    assumed: the picker fills ``{0}`` with the evolution stage.
    """
    names = locales.resolve(tables, [UI_KEYS["stage"]])
    for text in names.values():
        assert "{0}" in text[UI_KEYS["stage"]]
        assert len(text[UI_KEYS["stage"]]) < 16
