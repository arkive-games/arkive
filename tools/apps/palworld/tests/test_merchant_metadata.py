from unittest.mock import patch

from palworld.merchants import _merchant_metadata


def test_merchant_metadata_assigns_portrait_and_map(tmp_path):
    world_map = tmp_path / "DataTable/WorldMapUIData/DT_WorldMapUIData.json"
    world_map.parent.mkdir(parents=True)
    world_map.write_text(
        '[{"Rows":{"MainMap":{"landScapeRealPositionMin":{"X":0,"Y":0},'
        '"landScapeRealPositionMax":{"X":100,"Y":100}},"Tree":{'
        '"landScapeRealPositionMin":{"X":200,"Y":200},'
        '"landScapeRealPositionMax":{"X":300,"Y":300}}}}]',
        encoding="utf-8",
    )
    level = tmp_path / "Maps/MainWorld_5/PL_MainWorld5.json"
    level.parent.mkdir(parents=True)
    level.write_text("[]", encoding="utf-8")
    npcs = [{
        "npcId": "MedalTrader",
        "icon": "T_Medal",
        "location": {"X": 50, "Y": 60, "Z": 7},
    }]
    with patch("palworld.merchants._extract_npcs", return_value=npcs), patch(
        "palworld.merchants._npc_name_icon", return_value=lambda _: ({}, None)
    ):
        metadata = _merchant_metadata(tmp_path, {"MedalTrader"})
    assert metadata["MedalTrader"] == {
        "icon": "T_Medal",
        "locations": [{"map": "MainWorld", "x": 50, "y": 60, "z": 7}],
    }
