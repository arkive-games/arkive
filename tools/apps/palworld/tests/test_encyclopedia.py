import json
import re

import pytest

from palworld.encyclopedia import ELEMENTS, WORK_TYPES, run_encyclopedia
from palworld.env import optional_dir

RAW = optional_dir("PALWORLD_RAW")


@pytest.mark.skipif(RAW is None or not RAW.exists(), reason="PALWORLD_RAW not set or raw Palworld export not available")
def test_encyclopedia_integration(tmp_path):
    data_out, res_out = tmp_path / "data", tmp_path / "res"
    out = run_encyclopedia(RAW, data_out, res_out)
    pals, passives = out["pals"], out["passives"]
    by_id = {p["id"]: p for p in pals}

    # Roster matches the breeding stage's filter: 288 catalogued Pals plus the
    # 11 uncatalogued Terraria-collab creatures (ZukanIndex -1, icons under the
    # PalIcon/Normal/Yakushima subfolder).
    assert len(pals) == 299
    # No.038 Hangyu: CharacterID is WindChimes but every text table spells it
    # Windchimes — the casefolded name lookup must keep both variants rostered.
    assert {p["id"] for p in pals if p["zukanIndex"] == 38} == {"WindChimes", "WindChimes_Ice"}
    assert all(p["icon"].startswith("T_") for p in pals)
    uncatalogued = [p["id"] for p in pals if p["zukanIndex"] < 1]
    assert uncatalogued == [
        "YakushimaMonster001", "YakushimaMonster001_Blue", "YakushimaMonster001_Red",
        "YakushimaMonster001_Purple", "YakushimaMonster001_Pink", "YakushimaMonster001_Rainbow",
        "YakushimaMonster002", "YakushimaMonster003", "YakushimaMonster003_Purple",
        "YakushimaBoss001", "YakushimaBoss001_Small",
    ]
    # Uncatalogued pals sort last (after every Paldeck-numbered pal).
    assert [p["id"] for p in pals[-len(uncatalogued):]] == uncatalogued
    slime = by_id["YakushimaMonster001"]
    assert slime["elements"] == ["Leaf"]
    assert slime["stats"]["hp"] == 65
    assert slime["work"] == {"Transport": 1}

    # A known Pal's stats / elements / work / drops / learnset.
    anubis = by_id["Anubis"]
    assert anubis["elements"] == ["Earth"]
    assert anubis["genus"] == "Humanoid"
    assert anubis["stats"]["hp"] == 120
    assert anubis["work"]["Handcraft"] == 6 and anubis["bestWork"] == "Handcraft"
    assert len(anubis["activeSkills"]) >= 1
    assert anubis["activeSkills"][0]["level"] <= anubis["activeSkills"][-1]["level"]
    # Each active skill carries its attack range (raw world units) from DT_WazaDataTable.
    assert all(
        "minRange" in s and "maxRange" in s and s["maxRange"] >= 0
        for s in anubis["activeSkills"]
    )
    assert any(s["maxRange"] > 0 for s in anubis["activeSkills"])
    assert any(d["item"] == "Bone" for d in anubis["drops"])

    # Every Pal has a learnset and a localized partner-skill name.
    assert all(p["activeSkills"] for p in pals)

    # Egg item (primary-element family + rarity tier from BP_PalGameSetting),
    # spot-checked against in-game hatches: Lamball → Common Egg, Jetragon →
    # Huge Dragon Egg, Relaxaurus (rarity 8, first tier past the 7-ceiling) →
    # Huge Dragon Egg, Vanwyrm (Fire/Dark dual, rarity 5) → Large Scorching Egg.
    assert by_id["SheepBall"]["egg"] == "PalEgg_Normal_01"
    assert by_id["JetDragon"]["egg"] == "PalEgg_Dragon_05"
    assert by_id["LazyDragon"]["egg"] == "PalEgg_Dragon_05"
    assert by_id["BirdDragon"]["egg"] == "PalEgg_Fire_03"
    assert all(re.fullmatch(r"PalEgg_\w+_0[1-5]", p["egg"]) for p in pals)

    # Summoning-Altar pals (DT_PalRaidBoss egg rewards) are flagged; others aren't.
    assert all(isinstance(p["summonable"], bool) for p in pals)
    assert {p["id"] for p in pals if p["summonable"]} == {
        "NightLady", "NightLady_Dark", "KingBahamut_Dragon", "DarkMechaDragon", "LegendDeer",
    }
    # Summonable pals carry their summon-item recipe materials (parts × count).
    assert by_id["NightLady"]["summonMaterials"] == [{"item": "PalSummon_NightLady_Parts", "count": 4}]
    assert "summonMaterials" not in by_id["Anubis"]

    # Partner skill extras (verified against the raw export 2026-07-14).
    # Ranch production per rank: BP SpawnItem.FieldLotteryNameByRank chain.
    chikipi = by_id["ChickenPal"]["partnerSkill"]
    assert len(chikipi["farm"]) == 10
    assert chikipi["farm"][0] == [{"item": "Egg", "weight": 1, "min": 1, "max": 2}]
    assert chikipi["farm"][9][0]["max"] > chikipi["farm"][0][0]["max"]
    # Vixy digs a weighted multi-item pool that upgrades with rank.
    vixy = by_id["CuteFox"]["partnerSkill"]["farm"]
    assert {i["item"] for i in vixy[0]} == {"PalSphere", "Arrow", "Money", "Bone"}
    assert any(i["item"] == "PalSphere_Mega" for i in vixy[9])
    assert sum(1 for p in pals if p["partnerSkill"].get("farm")) >= 30
    # Gear kind from the SkillUnlock item icon (incl. the SkillUnlock_<cid>
    # fallback for the 14 gear-gated skills with empty RestrictionItems).
    assert by_id["Alpaca"]["partnerSkill"]["gear"] == "Saddle"
    assert by_id["Eagle"]["partnerSkill"] == {"unlockItem": "SkillUnlock_Eagle", "gear": "Gloves"}
    assert by_id["Kitsunebi"]["partnerSkill"]["gear"] == "Harness"
    # Action name + auto trigger type; attack shape carries the waza base power.
    assert by_id["Kitsunebi"]["partnerSkill"]["action"]["name"] == "Flamethrower"
    assert by_id["LeafMomonga"]["partnerSkill"]["action"]["triggerType"] == "PlayerRevive"
    assert by_id["MimicDog"]["partnerSkill"]["action"]["triggerType"] == "OpenTreasure"
    assert by_id["BluePlatypus"]["partnerSkill"]["power"] == 100

    # Global passive list: the 115 displayable, each with a rank and effects list.
    assert len(passives) == 115
    assert all("rank" in p and isinstance(p["effects"], list) for p in passives)

    # Locale files: 17 languages, non-mojibake real text for a known Pal.
    en_pals = json.loads((data_out / "locales/en-US/pals.json").read_text(encoding="utf-8"))
    assert en_pals["Anubis"]["name"] == "Anubis"
    assert en_pals["YakushimaMonster001"]["name"] == "Green Slime"
    assert en_pals["YakushimaBoss001"]["name"] == "Eye of Cthulhu"
    assert en_pals["Anubis"]["description"]
    assert en_pals["Anubis"]["partnerSkill"]["name"]
    # Case-mismatched text keys (PAL_NAME_/PAL_LONG_DESC_/PAL_FIRST_SPAWN_DESC_
    # _Windchimes vs CharacterID WindChimes) must still resolve.
    assert en_pals["WindChimes"]["name"] == "Hangyu"
    assert en_pals["WindChimes"]["description"]
    assert en_pals["WindChimes"]["partnerSkill"]["desc"]
    zh_name = json.loads((data_out / "locales/zh-CN/pals.json").read_text(encoding="utf-8"))["Anubis"]["name"]
    assert zh_name and all("一" <= c <= "鿿" for c in zh_name)  # real CJK, not JA base
    en_enums = json.loads((data_out / "locales/en-US/enums.json").read_text(encoding="utf-8"))
    assert en_enums["elements"]["Fire"] == "Fire" and en_enums["work"]["Mining"]

    # Icons: 9 elements + 13 colored work suitabilities (all WORK_TYPES).
    assert {p.name for p in (res_out / "icons").glob("element_*.webp")} == {f"element_{e}.webp" for e in ELEMENTS}
    work_icons = {p.name for p in (res_out / "icons").glob("work_*.webp")}
    assert work_icons == {f"work_{w}.webp" for w in WORK_TYPES}
