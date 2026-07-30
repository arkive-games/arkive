import json

import pytest

from sts2.encyclopedia import LANG_TAGS, run_encyclopedia
from sts2.env import optional_dir
from sts2.version import stamp_version

RAW = optional_dir("STS2_RAW")

pytestmark = pytest.mark.skipif(
    RAW is None or not RAW.exists(),
    reason="STS2_RAW not set or the gdex export is not available",
)


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    out = tmp_path_factory.mktemp("sts2")
    data_out, res_out = out / "data", out / "res"
    result = run_encyclopedia(RAW, data_out, res_out)
    return result, data_out, res_out


def test_cards_carry_the_numbers_that_render_their_text(built):
    """A description is a template: without its vars it cannot be displayed at all.

    Anger reads "Deal {Damage:diff()} damage", so the 6 has to come from the
    assembly half of the join or the card is unrenderable.
    """
    result, data_out, _ = built
    by_id = {c["id"]: c for c in result["cards"]}

    anger = by_id["ANGER"]
    assert anger["vars"]["Damage"]["base"] == 6
    assert anger["cost"] == 0 and anger["type"] == "Attack" and anger["rarity"] == "Common"

    abrasive = by_id["ABRASIVE"]
    assert abrasive["vars"]["ThornsPower"]["base"] == 4
    assert abrasive["vars"]["DexterityPower"]["base"] == 1
    assert abrasive["cost"] == 3

    text = json.loads((data_out / "locales/en-US/cards.json").read_text(encoding="utf-8"))
    assert "{Damage:diff()}" in text["ANGER"]["description"]
    assert set(text) <= {c["id"] for c in result["cards"]}


def test_cards_are_associated_with_a_character_pool(built):
    """The assembly cannot supply this — CardModel.Pool needs a live model
    database — so it comes from the portrait directory layout instead."""
    result, _, _ = built
    by_id = {c["id"]: c for c in result["cards"]}

    assert by_id["ANGER"]["pool"] == "ironclad"
    assert by_id["ABRASIVE"]["pool"] == "silent"
    assert by_id["ALL_FOR_ONE"]["pool"] == "defect"

    pooled = [c for c in result["cards"] if c.get("pool")]
    assert len(pooled) > 550


def test_test_scaffolding_is_excluded(built):
    """Mock*/Deprecated* model types are fixtures in the game's own test suite."""
    result, _, _ = built
    assert not [c for c in result["cards"] if c["id"].startswith(("MOCK", "DEPRECATED"))]


def test_playable_characters_have_their_stats_and_theme(built):
    result, _, _ = built
    by_id = {c["id"]: c for c in result["characters"]}

    ironclad = by_id["IRONCLAD"]
    assert ironclad["playable"] and ironclad["startingHp"] == 80 and ironclad["maxEnergy"] == 3
    assert ironclad["color"].startswith("#") and ironclad["cardCount"] > 50

    # The Defect is the only character with orb slots; that is what makes its
    # deck play differently, so a regression here is a real content bug.
    assert by_id["DEFECT"]["orbSlots"] == 3
    assert by_id["IRONCLAD"]["orbSlots"] == 0

    playable = [c for c in result["characters"] if c["playable"]]
    assert len(playable) == 5


def test_locales_cover_every_shipped_language_with_real_translations(built):
    _, data_out, _ = built
    for tag in LANG_TAGS.values():
        assert (data_out / "locales" / tag / "cards.json").is_file(), tag

    zh = json.loads((data_out / "locales/zh-CN/cards.json").read_text(encoding="utf-8"))
    assert any("一" <= ch <= "鿿" for ch in zh["ANGER"]["name"])

    chars = json.loads((data_out / "locales/en-US/characters.json").read_text(encoding="utf-8"))
    assert chars["IRONCLAD"]["name"] and chars["IRONCLAD"]["description"]


def test_icons_are_copied_for_cards_that_claim_one(built):
    result, _, res_out = built
    for card in result["cards"]:
        if icon := card.get("icon"):
            assert (res_out / "icons" / f"{icon}.webp").is_file(), card["id"]


def test_restamping_an_unchanged_artifact_keeps_the_version(built):
    """version.json is excluded from its own digest, so an unchanged dataset
    must not bust browser caches for nothing."""
    _, data_out, _ = built
    assert stamp_version(data_out) == stamp_version(data_out)
