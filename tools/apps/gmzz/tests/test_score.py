"""The Beyonder-rating stage: formula compilation, curve separability, output shape."""

from __future__ import annotations

import json

import pytest

from gmzz import score


# A miniature of the client's own ladder: role level first, then divinity, with
# the fall-through default at the top of the body.
LADDER = (
    "local Score = 900\n"
    "if $1 < 40 then Score = 100\n"
    "elseif $1 < 70 then Score = 200\n"
    "elseif $2 < 2 then Score = 300\n"
    "elseif $2 == 30 then Score = 800\n"
    "end\n"
    "return Score"
)
#: A ladder that reads divinity before the level cap — the shape that would make
#: the two-list curve lossy.
LEAKY = "local Score = 5\nif $2 < 3 then Score = 1 else Score = 2 end\nreturn Score"


@pytest.fixture
def runtime():
    return score._lua()


def test_compile_formula_binds_the_dollar_parameters(runtime):
    fn = score.compile_formula(runtime, LADDER)
    assert int(fn(39, 0)) == 100
    assert int(fn(69, 0)) == 200
    assert int(fn(70, 1)) == 300
    assert int(fn(70, 30)) == 800


def test_compile_formula_provides_the_min_helper(runtime):
    # The percentage formula calls Min/2, which is not a Lua builtin.
    fn = score.compile_formula(runtime, "return Min($1, $2)")
    assert int(fn(3, 8)) == 3


def test_curve_splits_into_a_level_list_and_a_divinity_list(runtime):
    result = score.curve(score.compile_formula(runtime, LADDER))
    assert len(result["byLevel"]) == score.MAX_ROLE_LEVEL - 1, "levels 1..69"
    assert len(result["byDivinity"]) == score.MAX_DIVINITY + 1, "divinity 0..30"
    assert result["byLevel"][0] == 100, "level 1"
    assert result["byLevel"][-1] == 200, "level 69"
    assert result["byDivinity"][0] == 300
    assert result["byDivinity"][-1] == 800


def test_curve_rejects_a_formula_where_divinity_matters_below_the_level_cap(runtime):
    # Two lists cannot represent that, and emitting them anyway would drop a
    # dimension without any symptom in the output.
    with pytest.raises(RuntimeError, match="no longer separable"):
        score.curve(score.compile_formula(runtime, LEAKY))


def test_curve_catches_a_divinity_branch_between_the_old_sample_points(runtime):
    # Sampling 0/7/15/30 would have missed this: it agrees at every one of those
    # and differs only at divinity 1, so separability has to be checked over the
    # whole range rather than a few points.
    sneaky = (
        "local Score = 50\n"
        "if $1 < 70 and $2 == 1 then Score = 100 end\n"
        "return Score"
    )
    with pytest.raises(RuntimeError, match="no longer separable"):
        score.curve(score.compile_formula(runtime, sneaky))


def test_curve_refuses_a_fractional_benchmark_rather_than_truncating(runtime):
    with pytest.raises(RuntimeError, match="whole number"):
        score.curve(score.compile_formula(runtime, "return 12.9"))


def test_curve_does_not_probe_outside_the_domain(runtime):
    # Divinity 31 matches no branch and falls through to the body's default
    # (900 here, unlike the 800 at 30). That is out-of-domain, not a curve still
    # growing, and must not fail the build.
    assert score.curve(score.compile_formula(runtime, LADDER))["byDivinity"][-1] == 800


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("/Game/Arts/UI_2/x/UI_ConfigIcon_ES_Icon_03.UI_ConfigIcon_ES_Icon_03", "UI_ConfigIcon_ES_Icon_03"),
        ("", ""),
    ],
)
def test_object_name(path, expected):
    assert score._object_name(path) == expected


GENUS = [{"ID": 1, "Name": "途径", "Module_Enum": "Player", "Priority": 1, "BasicIcon": "/Game/x/A.A"}]
SPECIES = [
    {
        "ID": 1, "Name": "等级", "BelongGroupID": 1, "ModuleEnum": "Player_Level", "Priority": 1,
        "ExpectedScore": 25740, "MaxScore": 25740,
        "ExpectedScoreFormula": 1, "MaxScoreFormula": 2, "ItemIDs": [2000059],
    },
]
FORMULAS = {"1": {"Formula": LADDER}, "2": {"Formula": LADDER}, str(score.PERCENT_FORMULA): {"Formula": "return 1"}}
BANDS = [{"ID": 2, "Percentage": 75, "ShowText": "稳步增长"}, {"ID": 1, "Percentage": 49, "ShowText": "推荐提升"}]
MATERIALS = [{"ItemID": 2000059, "Description": "认知经验。"}]
ITEMS = {"2000059": {"itemName": "认知经验", "quality": 3, "icon": "2000059"}}


@pytest.fixture
def stubbed(monkeypatch):
    tables = {
        score.GENUS_TABLE: GENUS, score.SPECIES_TABLE: SPECIES, score.BAND_TABLE: BANDS,
        score.MATERIAL_TABLE: MATERIALS, score.FORMULA_TABLE: FORMULAS, score.ITEM_TABLE: ITEMS,
    }
    monkeypatch.setattr(score, "load_strings", lambda excel: {})
    monkeypatch.setattr(score, "load_table", lambda excel, name: tables[name])
    monkeypatch.setattr(score, "resolve_text", lambda payload, strings: payload)
    return tables


def _payload(tmp_path):
    return json.loads((tmp_path / score.OUT_SUBDIR / "rating.json").read_text(encoding="utf-8"))


def test_build_rejects_a_species_count_that_is_not_the_panel_s_14(stubbed, tmp_path):
    with pytest.raises(RuntimeError, match="expected the panel's 14"):
        score.build(tmp_path, tmp_path)


def test_build_emits_curves_bands_and_named_materials(stubbed, monkeypatch, tmp_path):
    monkeypatch.setattr(score, "load_table", lambda excel, name: {
        **stubbed, score.SPECIES_TABLE: [{**SPECIES[0], "ID": i} for i in range(1, 15)],
    }[name])
    counts = score.build(tmp_path, tmp_path)
    assert counts == {"genus": 1, "species": 14, "bands": 2, "materials": 1}

    payload = _payload(tmp_path)
    assert payload["species"][0]["expected"]["byDivinity"][-1] == 800
    assert payload["bands"] == [
        {"id": 1, "percentage": 49, "label": "推荐提升"},
        {"id": 2, "percentage": 75, "label": "稳步增长"},
    ], "sorted by percentage, not by hash order"
    assert payload["materials"][0]["name"] == "认知经验", "itemName, not name"
    assert payload["maxRoleLevel"] == 70 and payload["maxDivinityLevel"] == 30


def test_build_rejects_a_species_pointing_at_an_unknown_genus(stubbed, monkeypatch, tmp_path):
    monkeypatch.setattr(score, "load_table", lambda excel, name: {
        **stubbed,
        score.SPECIES_TABLE: [{**SPECIES[0], "ID": i, "BelongGroupID": 9} for i in range(1, 15)],
    }[name])
    with pytest.raises(RuntimeError, match="absent from"):
        score.build(tmp_path, tmp_path)


def test_build_rejects_a_material_with_no_item_row(stubbed, monkeypatch, tmp_path):
    monkeypatch.setattr(score, "load_table", lambda excel, name: {
        **stubbed,
        score.SPECIES_TABLE: [{**SPECIES[0], "ID": i} for i in range(1, 15)],
        score.MATERIAL_TABLE: [{"ItemID": 999999, "Description": "x"}],
    }[name])
    with pytest.raises(RuntimeError, match="absent from"):
        score.build(tmp_path, tmp_path)
