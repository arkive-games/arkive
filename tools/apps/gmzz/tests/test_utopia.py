"""The Utopian Theater card stage: the icon path mapping and the write ordering."""

from __future__ import annotations

import json

import pytest

from gmzz import utopia


ROWS = {
    "101": {
        "CardID": 101, "Quality": 2, "BuffID": 82001000,
        "Tag": "灵性", "Name": "坚硬倒刺", "Description": "反弹所受伤害的500%。",
        "MutexCard": [], "CardIcon": "/Game/Arts/UI_2/Resource/Skill/Rogue/Rogue_Stat_01.Rogue_Stat_01",
    },
    "102": {
        "CardID": 102, "Quality": 1, "BuffID": 82001001,
        "Tag": "体魄", "Name": "巨人血脉", "Description": "最大生命值提升35%。",
        # Shares art with 101: distinct icons are fewer than cards.
        "MutexCard": [116, 117], "CardIcon": "/Game/Arts/UI_2/Resource/Skill/Rogue/Rogue_Stat_01.Rogue_Stat_01",
    },
}


def test_icon_asset_path_maps_the_object_path_to_the_export():
    # `/Game/` is the pak's `C7/Content/`, and uex writes textures as .png.
    assert utopia.icon_asset_path("/Game/Arts/UI_2/Resource/Skill/Rogue/Rogue_Stat_01.Rogue_Stat_01") == (
        "C7/Content/Arts/UI_2/Resource/Skill/Rogue/Rogue_Stat_01.png"
    )


@pytest.mark.parametrize("value", ["", "Rogue_Stat_01", "/Game/NoObjectSuffix"])
def test_icon_asset_path_rejects_what_it_cannot_parse(value):
    assert utopia.icon_asset_path(value) is None


@pytest.fixture
def stubbed(monkeypatch):
    monkeypatch.setattr(utopia, "load_strings", lambda excel: {})
    monkeypatch.setattr(utopia, "load_table", lambda excel, name: ROWS)
    monkeypatch.setattr(utopia, "resolve_text", lambda payload, strings: payload)


def _layout(tmp_path, icons: list[str]):
    raw = tmp_path / "raw"
    directory = raw / "C7/Content/Arts/UI_2/Resource/Skill/Rogue"
    directory.mkdir(parents=True)
    from PIL import Image
    for name in icons:
        Image.new("RGBA", (4, 4), (9, 9, 9, 255)).save(directory / f"{name}.png")
    return raw, tmp_path / "data", tmp_path / "res"


def test_emits_one_card_per_row_and_one_webp_per_distinct_icon(stubbed, tmp_path):
    raw, data_out, res_out = _layout(tmp_path, ["Rogue_Stat_01"])
    cards, images = utopia.build(tmp_path, raw, data_out, res_out)
    assert (cards, images) == (2, 1)

    payload = json.loads((data_out / utopia.OUT_FILE).read_text(encoding="utf-8"))
    assert [c["cardId"] for c in payload] == [101, 102], "sorted by card id, not hash order"
    assert payload[0]["name"] == "坚硬倒刺"
    assert payload[0]["icon"] == "Rogue_Stat_01"
    assert payload[1]["mutexCardIds"] == [116, 117]
    assert payload[0]["mutexCardIds"] == [], "empty client table normalises to a list"


def test_a_missing_icon_writes_nothing_at_all(stubbed, tmp_path):
    # data-gmzz and resource-gmzz are committed separately, so a run that wrote
    # cards.json and then failed would ship a dataset naming absent images.
    raw, data_out, res_out = _layout(tmp_path, [])
    with pytest.raises(FileNotFoundError, match="absent from the export"):
        utopia.build(tmp_path, raw, data_out, res_out)
    assert not (data_out / utopia.OUT_FILE).exists()
    assert not (res_out / utopia.ICON_SUBDIR).exists()
