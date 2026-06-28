"""Asserts on the regenerated data/ repo. Run AFTER the emitter (Step 3)."""
import json
from pathlib import Path

DATA = Path(r"G:/NCSoft/aion2-map/data")


def _locale(lng):
    return json.loads((DATA / "locales" / lng / "maps.json").read_text(encoding="utf-8"))


def test_locales_are_localized_and_differ_across_languages():
    en, zh = _locale("en"), _locale("zh-CN")
    assert en["World_L_A"]["name"] == "Verteron (Elyos)"
    assert zh["World_L_A"]["name"].endswith("（天）")
    assert zh["World_L_A"]["name"] != en["World_L_A"]["name"]


def test_starter_and_b_maps_localized():
    en = _locale("en")
    assert en["World_L_Starter"]["name"] == "Poeta (Elyos)"
    assert en["World_D_Starter"]["name"] == "Ishalgen (Asmodian)"
    assert en["World_L_B"]["name"] == "Eltnen (Elyos)"
    assert en["World_D_B"]["name"] == "Morheim (Asmodian)"


def test_zh_tw_differs_from_zh_cn():
    cn, tw = _locale("zh-CN"), _locale("zh-TW")
    assert tw["World_L_A"]["name"] != cn["World_L_A"]["name"]


def test_generated_maps_json_visibility():
    maps = {m["name"]: m for m in
            json.loads((DATA / "maps.json").read_text(encoding="utf-8"))["maps"]}
    assert maps["World_L_B"]["isVisible"] is True
    assert maps["World_D_B"]["isVisible"] is True
    assert maps["Abyss_Reshanta_B"]["isVisible"] is False
