import pytest

from gmzz.skill_text import has_formula, skill_text
from gmzz.fellows import build_skill


@pytest.mark.parametrize("token", [
    "*d", "*f", "*s", "*id", "spellfielddisc(*id)", "buffdisc(*id)",
    "bulletdisc(*id)", "skilldisc(*id)", "passivedisc(*id)",
    "trapdisc(*id)", "auradisc(*id)",
])
def test_dynamic_tokens_are_explicitly_unavailable(token):
    assert skill_text(f"Value {token}.") == "Value \u2026."
    assert has_formula(token)


def test_percent_escape_is_not_a_dynamic_formula():
    assert skill_text("Chance 50**; fixed 25%") == "Chance 50%; fixed 25%"
    assert not has_formula("50**")


def test_adjacent_percent_escape_preserves_the_unit():
    assert skill_text("Chance *f** for *d seconds") == "Chance \u2026% for \u2026 seconds"


def test_literal_ellipsis_does_not_set_formula_flag():
    assert not has_formula("Wait\u2026")


def test_client_product_with_dynamic_operands_is_unavailable():
    assert skill_text("Value mul(*d**,*d)") == "Value \u2026"
    assert skill_text("Value mul(mul(*d,*f),*s)") == "Value \u2026"


def test_fellow_brief_and_description_share_token_handling():
    skill = build_skill({"ID": 1, "SkillDisc": "Chance *f**.", "BriefDescription": "buffdisc(*id)"}, {})
    assert skill["description"] == "Chance \u2026%."
    assert skill["brief"] == "\u2026"
    assert skill["hasFormula"]
