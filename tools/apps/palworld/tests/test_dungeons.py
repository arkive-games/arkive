import json

import pytest

from palworld.dungeons import run_dungeons
from palworld.env import optional_dir

RAW = optional_dir("PALWORLD_RAW")


@pytest.mark.skipif(RAW is None or not RAW.exists(), reason="PALWORLD_RAW not set or raw Palworld export not available")
def test_dungeons_integration(tmp_path):
    out = run_dungeons(RAW, tmp_path)
    dungeons = {d["id"]: d for d in out["dungeons"]}

    # Every playable random-dungeon area, none of the debug ones.
    assert "TestDebug01" not in dungeons
    for area in ("Grass001", "Forest001", "Dessert001", "Volcano001", "Snow001",
                 "Sakura001", "Viking001", "Yakushima001", "Skyland001"):
        assert area in dungeons

    # Interior chests: normal biome lottery + the Special technology-book chest.
    forest = dungeons["Forest001"]
    assert forest["chests"] == {
        "normal": "Forest01", "special": "Forest001_Dungeon_TechnologyBook",
    }
    assert forest["bonusExpRate"] == 4.0

    # Referenced lotteries are emitted, with independent slots and weighted items.
    lot = out["lotteries"]["Forest01"]
    assert all(0 < s["prob"] <= 100 for s in lot)
    slot1 = lot[0]["items"]
    assert any(i["item"] == "PalUpgradeStone" and i["min"] >= 1 for i in slot1)
    # Blueprint rows carry the locked-chest tier (TreasureBoxGrade 4+).
    assert any(i["item"].startswith("Blueprint_") and i["grade"] >= 4 for i in slot1)
    # The tech-book chest: one guaranteed book of each kind + gold.
    tech = out["lotteries"]["Forest001_Dungeon_TechnologyBook"]
    items = {i["item"] for s in tech for i in s["items"]}
    assert {"TechnologyBook_G1", "AncientTechnologyBook_G1", "Money"} <= items

    # Boss rewards: tiers in difficulty order, entries resolved to typed kinds.
    tiers = [t["tier"] for t in forest["bossRewards"]]
    assert tiers == ["Easy01", "Medium01", "Hard01", "Hard03"]
    medium = next(t for t in forest["bossRewards"] if t["tier"] == "Medium01")
    kinds = {e["kind"] for e in medium["entries"]}
    assert {"chest", "cage", "egg", "lotus"} <= kinds
    egg = next(e for e in medium["entries"] if e["kind"] == "egg")
    assert egg["eggPool"] in out["eggPools"]
    assert all(p["weight"] > 0 and p["pal"] for p in out["eggPools"][egg["eggPool"]])
    # Pools are merged onto base pal ids: no BOSS_ (alpha) variants and no
    # duplicate rows survive (they'd render duplicate chips).
    for pool in list(out["eggPools"].values()) + list(out["cagePools"].values()):
        ids = [p["pal"] for p in pool]
        assert len(ids) == len(set(ids))
        assert not any(i.upper().startswith("BOSS_") for i in ids)
    cage = next(e for e in medium["entries"] if e["kind"] == "cage")
    pool = out["cagePools"][cage["cagePool"]]
    assert all(p["lvMin"] <= p["lvMax"] for p in pool)
    # Hard03 is the Dungeon Elixir chest.
    hard3 = next(t for t in forest["bossRewards"] if t["tier"] == "Hard03")
    assert hard3["entries"] == [
        {"kind": "chest", "weight": 1.0, "lottery": "Forest001_Dungeon_Elixir"},
    ]

    # Enemies: normal mobs + the dungeon boss with level ranges.
    assert forest["enemies"]["boss"] and forest["enemies"]["normal"]
    assert all(e["lvMin"] <= e["lvMax"] for r in forest["enemies"].values() for e in r)

    # Locale files: real names per language, no blanks, dungeon set matches.
    en = json.loads((tmp_path / "locales/en-US/dungeons.json").read_text(encoding="utf-8"))
    assert set(en) == set(dungeons)
    assert en["Forest001"]["name"] == "Mountain Stream Grotto"
    assert all(v["name"] for v in en.values())
    zh = json.loads((tmp_path / "locales/zh-CN/dungeons.json").read_text(encoding="utf-8"))
    assert all(v["name"] for v in zh.values())
